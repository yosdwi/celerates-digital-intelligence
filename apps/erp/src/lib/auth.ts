import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { sql } from "@/db";
import { allowAttempt } from "@/lib/login-throttle";
import { isBetaWhitelisted } from "@/lib/beta";
import { redeemGrant } from "@/lib/talent/identity";
import { audit } from "@/lib/security/audit";
import { emailOtpRequired, mailboxAllowed } from "@/lib/security/email-otp";
import { verifyPasskeyAssertion } from "@/lib/security/passkey";
import {
  clientMeta, createSession, findTrustedBrowser, loadSession, readCookie, revokeSession, TRUSTED_BROWSER_COOKIE, type AuthMethod, type SessionClaims,
} from "@/lib/security/session";

// docs/security/02: the cookie carries only the session id. PostgreSQL (auth_sessions + users) decides on every
// request whether the session is still valid and what the user may do. This is only the cookie's lifetime.
const COOKIE_MAX_AGE_SECONDS = 90 * 86_400;
// bcrypt of a random string: unknown accounts cost the same time as wrong passwords.
const DUMMY_HASH = "$2b$12$vNzuoeuJ33uo7I72Tc6mmuyodhamln.cvDmmN8JcZgoIV7vmiasN.";

type Meta = ReturnType<typeof clientMeta>;

/** Password check shared by the login API (before any email code is sent) and the final sign-in. */
export async function checkPassword(emailInput: unknown, password: unknown, meta: Meta) {
  if (typeof emailInput !== "string" || typeof password !== "string" || !emailInput || !password || emailInput.length > 254 || password.length > 72) return null;
  const email = emailInput.trim().toLowerCase();
  const allowed = (await allowAttempt(sql, "login:" + email, 20)) && (await allowAttempt(sql, "login-ip:" + meta.ip, 60));
  const [user] = await sql`SELECT id, email, full_name, password_hash, account_type, status FROM users WHERE email = ${email}`;
  const usable = allowed && user?.status === "active" && typeof user.password_hash === "string";
  const valid = await bcrypt.compare(password, usable ? user.password_hash : DUMMY_HASH);
  if (usable && valid) return user as { id: string; email: string; full_name: string; account_type: string };
  await audit(sql, {
    action: "login",
    decision: "deny",
    actorUserId: user?.id ?? null,
    reason: allowed ? "bad_credentials" : "rate_limited",
    ipHash: meta.ipHash,
    device: meta.device,
  });
  return null;
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const meta = clientMeta((req?.headers ?? {}) as Record<string, string>);
        const user = await checkPassword(credentials?.email, credentials?.password, meta);
        if (!user) return null;
        if (user.account_type !== "talent" && !mailboxAllowed(user.email).ok) {
          await audit(sql, { action: "login", decision: "deny", actorUserId: user.id, reason: "mailbox_not_allowed", ipHash: meta.ipHash, device: meta.device });
          return null;
        }
        // Backoffice: a browser that has not proved the corporate mailbox gets no session (docs/security/02).
        // Talent accounts with a password keep password-only; their strong path is the WhatsApp link.
        let method: AuthMethod = "password";
        const browser = user.account_type === "talent" ? null : await findTrustedBrowser(sql, user.id, readCookie(meta.cookie, TRUSTED_BROWSER_COOKIE));
        if (user.account_type !== "talent" && emailOtpRequired() && !browser) {
          await audit(sql, { action: "login", decision: "deny", actorUserId: user.id, reason: "email_verification_required", ipHash: meta.ipHash, device: meta.device });
          return null;
        }
        if (browser?.fresh) method = "password+email_otp";
        const sid = await createSession(sql, { userId: user.id, method, trustedBrowserId: browser?.id, stepUp: browser?.fresh, device: meta.device, ipPrefix: meta.ipPrefix });
        await audit(sql, { action: "login", decision: "allow", actorUserId: user.id, sessionId: sid, reason: method, ipHash: meta.ipHash, device: meta.device });
        return { id: user.id, email: user.email, name: user.full_name, sid };
      },
    }),
    CredentialsProvider({
      id: "passkey",
      name: "Biometrik / Passkey",
      credentials: {
        challengeId: { label: "Challenge", type: "text" },
        credentialId: { label: "Credential", type: "text" },
        clientDataJSON: { label: "Client data", type: "text" },
        authenticatorData: { label: "Authenticator data", type: "text" },
        signature: { label: "Signature", type: "text" },
        userHandle: { label: "User handle", type: "text" },
      },
      async authorize(credentials, req) {
        const meta = clientMeta((req?.headers ?? {}) as Record<string, string>);
        try {
          const user = await verifyPasskeyAssertion(sql, {
            challengeId: credentials?.challengeId ?? "",
            credentialId: credentials?.credentialId ?? "",
            clientDataJSON: credentials?.clientDataJSON ?? "",
            authenticatorData: credentials?.authenticatorData ?? "",
            signature: credentials?.signature ?? "",
            userHandle: credentials?.userHandle || null,
          });
          if (!user || !mailboxAllowed(user.email).ok) {
            await audit(sql, { action: "login", decision: "deny", actorUserId: user?.id ?? null, reason: "passkey_invalid", ipHash: meta.ipHash, device: meta.device });
            return null;
          }
          const sid = await createSession(sql, { userId: user.id, method: "passkey", stepUp: true, device: meta.device, ipPrefix: meta.ipPrefix });
          await audit(sql, { action: "login", decision: "allow", actorUserId: user.id, sessionId: sid, reason: "passkey", ipHash: meta.ipHash, device: meta.device });
          return { id: user.id, email: user.email, name: user.full_name, sid };
        } catch (error) {
          await audit(sql, { action: "login", decision: "deny", reason: "passkey_invalid", ipHash: meta.ipHash, device: meta.device });
          console.warn("[auth] passkey sign-in refused", (error as Error).message.slice(0, 80));
          return null;
        }
      },
    }),
    // ADR-019 §4: a Talent session starts only by redeeming a deep-link grant bound to an active, linked Talent
    // account, in this explicit sign-in call (never on GET). Opening the WhatsApp link is the Talent's recent proof.
    CredentialsProvider({
      id: "talent-link",
      name: "Tautan Talent",
      credentials: { code: { label: "Kode", type: "text" } },
      async authorize(credentials, req) {
        const meta = clientMeta((req?.headers ?? {}) as Record<string, string>);
        const redeemed = await redeemGrant(sql, credentials?.code ?? "");
        if (!redeemed) {
          await audit(sql, { action: "login", decision: "deny", reason: "talent_link_invalid", ipHash: meta.ipHash, device: meta.device });
          return null;
        }
        const sid = await createSession(sql, { userId: redeemed.userId, method: "talent_link", stepUp: true, device: meta.device, ipPrefix: meta.ipPrefix });
        await audit(sql, { action: "login", decision: "allow", actorUserId: redeemed.userId, sessionId: sid, reason: "talent_link", ipHash: meta.ipHash, device: meta.device });
        return { id: redeemed.userId, email: redeemed.email, name: redeemed.name, sid };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // Sign-in: the cookie holds the session id and user id, nothing else.
      if (user) return { sub: user.id, sid: (user as { sid?: string }).sid };
      const claims = await loadSession(sql, token.sid);
      // Revoked, expired, unknown or inactive: NextAuth clears the cookie and getServerSession returns null.
      if (!claims) throw new Error("session_invalid");
      // Handed to the session callback below, which removes it again before the cookie is re-encoded.
      return { sub: token.sub, sid: token.sid, claims };
    },

    async session({ session, token }) {
      const claims = token.claims as SessionClaims | undefined;
      delete token.claims;
      if (!claims) return session;
      session.user = {
        id: claims.userId,
        email: claims.email,
        name: claims.fullName,
        sid: claims.sid,
        status: claims.status,
        isOwner: claims.isOwner,
        fullName: claims.fullName,
        access: claims.access,
        capabilities: claims.capabilities,
        stepUpAt: claims.stepUpAt ? new Date(claims.stepUpAt).toISOString() : null,
        isBetaTester: claims.googleLinked && isBetaWhitelisted(claims.email),
        accountType: claims.accountType,
        canUseTimesheetConverter: claims.canUseTimesheetConverter,
        hasRequestedDivision: claims.hasRequestedDivision,
      } as typeof session.user;
      return session;
    },
  },
  events: {
    async signOut({ token }) {
      const sid = (token as { sid?: unknown } | null)?.sid;
      if (typeof sid === "string" && (await revokeSession(sql, sid, "logout")))
        await audit(sql, { action: "logout", decision: "allow", actorUserId: (token?.sub as string) ?? null, sessionId: sid });
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt", maxAge: COOKIE_MAX_AGE_SECONDS, updateAge: 24 * 3600 },
  jwt: { maxAge: COOKIE_MAX_AGE_SECONDS },
};
