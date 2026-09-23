import { allowLoginAttempt } from "@/lib/login-throttle";
import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { db } from "@/db";
import { users, userAccess, divisions, googleTokens } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { isBetaWhitelisted } from "@/lib/beta";


async function loadUserClaims(email: string) {
  const [dbUser] = await db.select().from(users).where(eq(users.email, email));
  if (!dbUser) return null;

  const access = await db
    .select({ divisionKey: divisions.key, level: userAccess.level })
    .from(userAccess)
    .innerJoin(divisions, eq(userAccess.division_id, divisions.id))
    .where(eq(userAccess.user_id, dbUser.id));

  // Email whitelist saja tidak cukup -- google_sub memastikan email ini benar-benar
  // diverifikasi lewat login Google, bukan sekadar diklaim lewat form register/credentials.
  const isVerifiedViaGoogle = dbUser.google_sub !== null;

  return {
    userId: dbUser.id,
    status: dbUser.status,
    isOwner: dbUser.is_owner,
    fullName: dbUser.full_name,
    hasRequestedDivision: dbUser.requested_division_id !== null,
    access,
    isBetaTester: isVerifiedViaGoogle && isBetaWhitelisted(email),
    accountType: dbUser.account_type ?? "backoffice",
    canUseTimesheetConverter: dbUser.can_use_timesheet_converter ?? false,
  };
}

export const authOptions: NextAuthOptions = {
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "openid email profile",
          access_type: "offline",
          prompt: "consent",
        },
      },
    })] : []),
    CredentialsProvider({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        if (credentials.email.length > 254 || credentials.password.length > 72 || !await allowLoginAttempt(credentials.email)) return null;
        const [user] = await db.select().from(users).where(eq(users.email, credentials.email.trim().toLowerCase()));
        if (!user || user.status !== "active" || !user.is_owner || !user.password_hash) return null;

        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.full_name };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.email) {
        const email = user.email.toLowerCase();
        const [existing] = await db.select().from(users).where(eq(users.email, email));
        if (!existing) {
          await db.insert(users).values({
            email,
            full_name: user.name ?? email,
            google_sub: account.providerAccountId,
            status: "pending",
          });
        } else if (!existing.google_sub) {
          await db.update(users).set({ google_sub: account.providerAccountId }).where(eq(users.id, existing.id));
        }
      }

      return true;
    },

    async jwt({ token, user }) {
      const email = (user?.email ?? token.email as string | undefined)?.toLowerCase();
      if (email) {
        const claims = await loadUserClaims(email);
        if (claims) {
            token.userId = claims.userId;
            token.status = claims.status;
            token.isOwner = claims.isOwner;
            token.fullName = claims.fullName;
            token.hasRequestedDivision = claims.hasRequestedDivision;
            token.access = claims.access;
            token.isBetaTester = claims.isBetaTester;
            token.accountType = claims.accountType;
            token.canUseTimesheetConverter = claims.canUseTimesheetConverter;
        } else {
            token.userId = undefined; token.status = "rejected"; token.isOwner = false; token.access = [];
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        Object.assign(session.user, {
          id: token.userId,
          status: token.status,
          isOwner: token.isOwner,
          fullName: token.fullName,
          access: token.access,
          isBetaTester: token.isBetaTester,
          accountType: token.accountType,
          canUseTimesheetConverter: token.canUseTimesheetConverter,
        });
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
};