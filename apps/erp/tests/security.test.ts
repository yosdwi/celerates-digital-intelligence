// Security foundation (docs/security/05): revocable sessions, corporate-email codes, the policy matrix, the private
// identity-document slice and its negative cases. Synthetic people and documents only. In-process PostgreSQL (PGlite)
// and S3 (s3rver); the same modules the ERP runs.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash, generateKeyPairSync, randomBytes, sign as signData } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
// @ts-expect-error no types
import S3rver from "s3rver";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const PG_PORT = 55461;
const S3_PORT = 59061;
const SYNTHETIC_NIK = "3171019900000001"; // synthetic: not a real person
const MARKER = "SYNTHETIC-KTP-DO-NOT-USE";
const PASSWORD = "Synthetic-Only-Password-1";

const dir = mkdtempSync(path.join(tmpdir(), "erp-security-"));
const keyringFile = path.join(dir, "identity-keyring");
writeFileSync(keyringFile, `v1:${randomBytes(32).toString("hex")}\n`, { mode: 0o600 });
Object.assign(process.env, {
  DATABASE_URL: `postgres://postgres:postgres@127.0.0.1:${PG_PORT}/postgres`,
  DB_POOL_MAX: "1",
  NEXTAUTH_URL: "http://localhost:3000",
  NEXTAUTH_SECRET: randomBytes(32).toString("hex"),
  PII_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
  S3_ENDPOINT: `http://127.0.0.1:${S3_PORT}`,
  S3_ACCESS_KEY_ID: "S3RVER",
  S3_SECRET_ACCESS_KEY: "S3RVER",
  S3_BUCKET_PREFIX: "erp-sec",
  IDENTITY_KEYRING_FILE: keyringFile,
  AUTH_EMAIL_DOMAINS: "celerates.com,celerates.co.id",
  AUTH_EMAIL_EXCEPTIONS: "",
});
delete process.env.AUTH_EMAIL_OTP;

// Everything the tests print or log is captured: no identity bytes, NIK, code or key may ever appear in it.
const logged: string[] = [];
for (const level of ["log", "info", "warn", "error"] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    logged.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    original(...args);
  };
}

let pg: PGlite;
let pgServer: PGLiteSocketServer;
const s3 = new S3rver({ port: S3_PORT, address: "127.0.0.1", silent: true, directory: dir });

// Modules are imported after the environment is set (the DB pool and cookie names are fixed at import).
let sql: typeof import("../src/db").sql;
let S: typeof import("../src/lib/security/session");
let P: typeof import("../src/lib/security/policy");
let OTP: typeof import("../src/lib/security/email-otp");
let PASSKEY: typeof import("../src/lib/security/passkey");
let ID: typeof import("../src/lib/security/identity-documents");
let PEOPLE: typeof import("../src/lib/people/identity");
let KEYS: typeof import("../src/lib/security/keyring");
let encryptPII: typeof import("../src/lib/pii-crypto").encryptPII;
const outbox: { to: string; code: string; purpose: string }[] = [];

type Ids = Record<string, string>;
const u: Ids = {};
let divisions: Ids = {};

before(async () => {
  pg = await PGlite.create();
  pgServer = new PGLiteSocketServer({ db: pg, port: PG_PORT, host: "127.0.0.1" });
  await pgServer.start();
  await s3.run();
  // @ts-expect-error JS runtime module
  const { migrate } = await import("../scripts/migrate.mjs");
  await migrate(process.env.DATABASE_URL);
  // @ts-expect-error JS runtime module
  const { initStorage } = await import("../scripts/init-storage.mjs");
  await initStorage();
  ({ sql } = await import("../src/db"));
  S = await import("../src/lib/security/session");
  P = await import("../src/lib/security/policy");
  OTP = await import("../src/lib/security/email-otp");
  PASSKEY = await import("../src/lib/security/passkey");
  ID = await import("../src/lib/security/identity-documents");
  PEOPLE = await import("../src/lib/people/identity");
  KEYS = await import("../src/lib/security/keyring");
  ({ encryptPII } = await import("../src/lib/pii-crypto"));
  OTP.mail.send = async (to, code, purpose) => void outbox.push({ to, code, purpose });

  divisions = Object.fromEntries((await sql`SELECT key, id FROM divisions`).map((d) => [d.key, d.id]));
  const bcrypt = (await import("bcryptjs")).default;
  const hash = await bcrypt.hash(PASSWORD, 4);
  const people: [string, string, string, boolean, [string, string][]][] = [
    ["owner", "owner.sec@celerates.com", "backoffice", true, []],
    ["hr", "hr.sec@celerates.com", "backoffice", false, [["hr", "viewer"]]],
    ["hrNoCap", "hr2.sec@celerates.com", "backoffice", false, [["hr", "full"]]],
    ["ta", "ta.sec@celerates.com", "backoffice", false, [["ta", "editor"]]],
    ["pmo", "pmo.sec@celerates.com", "backoffice", false, [["pmo", "full"]]],
    ["finance", "finance.sec@celerates.com", "backoffice", false, [["finance", "full"]]],
    ["gmail", "outside.sec@gmail.com", "backoffice", false, [["pmo", "viewer"]]],
    ["talentA", "talent.a.sec@celerates.com", "talent", false, []],
    ["talentB", "talent.b.sec@celerates.com", "talent", false, []],
  ];
  for (const [key, email, type, owner, access] of people) {
    const [row] = await sql`INSERT INTO users (email, full_name, status, is_owner, account_type, password_hash)
      VALUES (${email}, ${"Synthetic " + key}, 'active', ${owner}, ${type}, ${hash}) RETURNING id`;
    u[key] = row.id;
    for (const [d, level] of access) await sql`INSERT INTO user_access (user_id, division_id, level) VALUES (${row.id}, ${divisions[d]}, ${level})`;
  }
  for (const [key, cap, scope] of [["hr", "identity_document.read", "all"], ["ta", "identity_document.read", "onboarding"], ["hr", "identity.reveal", "all"], ["hr", "bank.read", "all"]] as const)
    await sql`INSERT INTO user_capabilities (user_id, capability, scope, reason, granted_by) VALUES (${u[key]}, ${cap}, ${scope}, 'synthetic test', ${u.owner})`;
});

after(async () => {
  await sql?.end();
  await pgServer.stop();
  await pg.close();
  await s3.close();
});

/** A live session's claims, optionally with a fresh step-up. */
async function login(key: string, opts: { stepUp?: boolean; method?: "password" | "password+email_otp" | "talent_link" | "passkey" } = {}) {
  const sid = await S.createSession(sql, { userId: u[key], method: opts.method ?? "password+email_otp", stepUp: opts.stepUp });
  const claims = await S.loadSession(sql, sid);
  assert.ok(claims, `session for ${key}`);
  return claims!;
}
const jpeg = (extra = "") => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from(`${MARKER} NIK ${SYNTHETIC_NIK} ${extra}`), randomBytes(512), Buffer.from([0xff, 0xd9])]);
const auditRows = async (action: string) => sql`SELECT * FROM sensitive_access_log WHERE action = ${action} ORDER BY id`;

// ---------------------------------------------------------------------------------------------------------------
test("policy matrix: can(actor, action, resource) for every persona and lifecycle stage", () => {
  const now = new Date("2026-10-02T08:00:00Z");
  const fresh = new Date(now.getTime() - 60_000);
  const stale = new Date(now.getTime() - 11 * 60_000);
  const actor = (o: Partial<import("../src/lib/security/policy").PolicyActor>) => ({ userId: "u", status: "active", accountType: "backoffice", isOwner: false, access: [], capabilities: [], stepUpAt: fresh, ...o });
  const cap = (capability: string, scope = "all") => ({ capability, scope }) as never;
  const onboarding = { classification: "identity", stage: "onboarding" } as const;
  const employee = (daysAgo: number) => ({ classification: "identity", stage: "employee", promotedAt: new Date(now.getTime() - daysAgo * 86_400_000) }) as const;
  const own = { classification: "identity", stage: "self", subjectUserId: "talentA" } as const;
  const rows: [string, ReturnType<typeof actor> | null, string, unknown, boolean | "step_up"][] = [
    ["anonymous", null, "identity_document.read", employee(30), false],
    ["Talent A, own, recent link", actor({ userId: "talentA", accountType: "talent" }), "identity_document.read", own, true],
    ["Talent A, own, stale link", actor({ userId: "talentA", accountType: "talent", stepUpAt: stale }), "identity_document.read", own, "step_up"],
    ["Talent B → Talent A", actor({ userId: "talentB", accountType: "talent" }), "identity_document.read", own, false],
    ["Talent → reveal NIK", actor({ userId: "talentA", accountType: "talent" }), "identity.reveal", own, false],
    ["TA + cap → onboarding", actor({ access: [{ divisionKey: "ta", level: "viewer" }], capabilities: [cap("identity_document.read", "onboarding")] }), "identity_document.read", onboarding, true],
    ["TA + cap, no step-up", actor({ access: [{ divisionKey: "ta", level: "viewer" }], capabilities: [cap("identity_document.read")], stepUpAt: stale }), "identity_document.read", onboarding, "step_up"],
    ["TA without cap", actor({ access: [{ divisionKey: "ta", level: "full" }] }), "identity_document.read", onboarding, false],
    ["TA + cap, promoted 20 days ago", actor({ access: [{ divisionKey: "ta", level: "full" }], capabilities: [cap("identity_document.read")] }), "identity_document.read", employee(20), false],
    ["TA + cap, promoted 3 days ago (grace)", actor({ access: [{ divisionKey: "ta", level: "full" }], capabilities: [cap("identity_document.read")] }), "identity_document.read", employee(3), true],
    ["TA + onboarding-scoped cap, employee stage", actor({ access: [{ divisionKey: "ta", level: "full" }], capabilities: [cap("identity_document.read", "onboarding")] }), "identity_document.read", employee(3), false],
    ["HR + cap → employee", actor({ access: [{ divisionKey: "hr", level: "viewer" }], capabilities: [cap("identity_document.read")] }), "identity_document.read", employee(30), true],
    ["HR + cap → onboarding in progress (TA owns it)", actor({ access: [{ divisionKey: "hr", level: "full" }], capabilities: [cap("identity_document.read")] }), "identity_document.read", onboarding, false],
    ["HR without cap", actor({ access: [{ divisionKey: "hr", level: "full" }] }), "identity_document.read", employee(30), false],
    ["PMO full", actor({ access: [{ divisionKey: "pmo", level: "full" }] }), "identity_document.read", employee(30), false],
    ["PMO with a stray cap (no HR scope)", actor({ access: [{ divisionKey: "pmo", level: "full" }], capabilities: [cap("identity_document.read")] }), "identity_document.read", employee(30), false],
    ["Finance", actor({ access: [{ divisionKey: "finance", level: "full" }] }), "identity_document.read", employee(30), false],
    ["Owner without capability", actor({ isOwner: true }), "identity_document.read", employee(30), false],
    ["Owner with explicit capability", actor({ isOwner: true, capabilities: [cap("identity_document.read")] }), "identity_document.read", employee(30), true],
    ["inactive user with everything", actor({ status: "inactive", isOwner: true, capabilities: [cap("identity_document.read")] }), "identity_document.read", employee(30), false],
    ["HR status metadata (no cap)", actor({ access: [{ divisionKey: "hr", level: "viewer" }] }), "identity_document.status", employee(30), true],
    ["PMO status metadata", actor({ access: [{ divisionKey: "pmo", level: "full" }] }), "identity_document.status", employee(30), false],
    ["TA upload while onboarding (editor)", actor({ access: [{ divisionKey: "ta", level: "editor" }] }), "identity_document.upload", onboarding, true],
    ["TA viewer upload", actor({ access: [{ divisionKey: "ta", level: "viewer" }] }), "identity_document.upload", onboarding, false],
    ["HR reveal NIK + cap", actor({ access: [{ divisionKey: "hr", level: "viewer" }], capabilities: [cap("identity.reveal")] }), "identity.reveal", employee(30), true],
    ["HR reveal NIK, no cap", actor({ access: [{ divisionKey: "hr", level: "full" }] }), "identity.reveal", employee(30), false],
    ["bank.read + cap (Finance)", actor({ access: [{ divisionKey: "finance", level: "viewer" }], capabilities: [cap("bank.read")] }), "bank.read", { classification: "bank", stage: "employee" }, true],
    ["bank.read, TA", actor({ access: [{ divisionKey: "ta", level: "full" }], capabilities: [cap("bank.read")] }), "bank.read", { classification: "bank", stage: "onboarding" }, false],
    ["bank.write, TA during onboarding", actor({ access: [{ divisionKey: "ta", level: "editor" }], stepUpAt: stale }), "bank.write", { classification: "bank", stage: "onboarding" }, true],
    ["bank.write, HR without cap", actor({ access: [{ divisionKey: "hr", level: "full" }] }), "bank.write", { classification: "bank", stage: "employee" }, false],
    ["bank.write, HR + cap, stale", actor({ access: [{ divisionKey: "hr", level: "full" }], capabilities: [cap("bank.write")], stepUpAt: stale }), "bank.write", { classification: "bank", stage: "employee" }, "step_up"],
    ["compensation.read, TM + cap", actor({ access: [{ divisionKey: "tm", level: "viewer" }], capabilities: [cap("compensation.read")] }), "compensation.read", { classification: "compensation", stage: "employee" }, true],
    ["compensation.read, Sales", actor({ access: [{ divisionKey: "sales", level: "full" }], capabilities: [cap("compensation.read")] }), "compensation.read", { classification: "compensation", stage: "employee" }, false],
    ["payroll.export without step-up", actor({ access: [{ divisionKey: "finance", level: "full" }], capabilities: [cap("payroll.export")], stepUpAt: stale }), "payroll.export", { classification: "compensation", stage: "employee" }, "step_up"],
    ["access.admin, Owner, fresh", actor({ isOwner: true }), "access.admin", undefined, true],
    ["access.admin, Owner, stale", actor({ isOwner: true, stepUpAt: stale }), "access.admin", undefined, "step_up"],
    ["access.admin, PMO full", actor({ access: [{ divisionKey: "pmo", level: "full" }] }), "access.admin", undefined, false],
  ];
  for (const [name, a, action, resource, expected] of rows) {
    const d = P.can(a as never, action as never, resource as never, now);
    if (expected === "step_up") assert.ok(!d.allow && d.stepUpRequired, `${name}: expected step_up_required, got ${JSON.stringify(d)}`);
    else assert.equal(d.allow, expected, `${name}: ${JSON.stringify(d)}`);
  }
  assert.equal(P.stepUpFresh(new Date(now.getTime() - 9 * 60_000), now), true, "9 minutes is fresh");
  assert.equal(P.stepUpFresh(new Date(now.getTime() - 10 * 60_000), now), false, "10 minutes is the edge");
  assert.equal(P.stepUpFresh(new Date(now.getTime() + 3600_000), now), false, "a future timestamp is never fresh");
});

test("sessions: revocation, deactivation, expiry and logout-all refuse the same (copied) session id at once", async () => {
  const a = await login("pmo");
  const copy = a.sid; // what an attacker holding a copied cookie presents
  assert.ok(await S.loadSession(sql, copy), "valid before revocation");
  assert.equal(await S.revokeSession(sql, copy, "user_revoked"), true);
  assert.equal(await S.loadSession(sql, copy), null, "revoked session refused immediately");
  assert.equal(await S.loadSession(sql, "not-a-uuid"), null);
  assert.equal(await S.loadSession(sql, "00000000-0000-0000-0000-000000000000"), null, "unknown session");

  const b = await login("pmo");
  await sql`UPDATE users SET status = 'inactive' WHERE id = ${u.pmo}`;
  assert.equal(await S.loadSession(sql, b.sid), null, "deactivated user refused on the next request");
  await sql`UPDATE users SET status = 'active' WHERE id = ${u.pmo}`;
  assert.ok(await S.loadSession(sql, b.sid), "reactivation restores an unrevoked session");
  await sql`UPDATE users SET status = 'rejected' WHERE id = ${u.pmo}`;
  assert.equal(await S.loadSession(sql, b.sid), null, "any non-active status refuses");
  await sql`UPDATE users SET status = 'active' WHERE id = ${u.pmo}`;

  const idle = await login("pmo");
  await sql`UPDATE auth_sessions SET idle_expires_at = now() - interval '1 second' WHERE id = ${idle.sid}`;
  assert.equal(await S.loadSession(sql, idle.sid), null, "idle expiry");
  const abs = await login("pmo");
  await sql`UPDATE auth_sessions SET absolute_expires_at = now() - interval '1 second', idle_expires_at = now() - interval '2 seconds' WHERE id = ${abs.sid}`;
  assert.equal(await S.loadSession(sql, abs.sid), null, "absolute expiry");

  const [policyRow] = await sql`SELECT absolute_expires_at - created_at AS abs, idle_expires_at - created_at AS idle FROM auth_sessions WHERE id = ${b.sid}`;
  assert.match(String(policyRow.abs), /30 days/, "backoffice absolute lifetime");
  assert.match(String(policyRow.idle), /7 days/, "backoffice idle timeout");

  const c1 = await login("pmo");
  const c2 = await login("pmo");
  const browser = await S.createTrustedBrowser(sql, u.pmo, "Chrome · Windows");
  assert.ok(await S.findTrustedBrowser(sql, u.pmo, browser.token));
  assert.equal(await S.findTrustedBrowser(sql, u.hr, browser.token), null, "a trusted browser is bound to its user");
  assert.ok((await S.revokeUserSessions(sql, u.pmo, "logout_all", { browsers: true })) >= 3);
  assert.equal(await S.loadSession(sql, c1.sid), null);
  assert.equal(await S.loadSession(sql, c2.sid), null);
  assert.equal(await S.findTrustedBrowser(sql, u.pmo, browser.token), null, "logout-all forgets trusted browsers");

  const keep = await login("pmo");
  const other = await login("pmo");
  assert.equal(await S.revokeUserSessions(sql, u.pmo, "password_changed", { exceptSid: keep.sid }), 1);
  assert.ok(await S.loadSession(sql, keep.sid), "password change keeps this browser");
  assert.equal(await S.loadSession(sql, other.sid), null, "and ends every other session");
  assert.equal(await S.revokeSession(sql, keep.sid, "user_revoked", u.hr), false, "a user cannot revoke someone else's session");

  // Fresh authorization claims after access changes: no re-login needed, no stale claims.
  const live = await login("pmo");
  await sql`INSERT INTO user_access (user_id, division_id, level) VALUES (${u.pmo}, ${divisions.sales}, 'viewer')`;
  assert.ok((await S.loadSession(sql, live.sid))!.access.some((a) => a.divisionKey === "sales"), "new division visible on the next request");
  await sql`DELETE FROM user_access WHERE user_id = ${u.pmo} AND division_id = ${divisions.sales}`;
  assert.ok(!(await S.loadSession(sql, live.sid))!.access.some((a) => a.divisionKey === "sales"), "removed division gone on the next request");
  const [grant] = await sql`INSERT INTO user_capabilities (user_id, capability, reason, granted_by) VALUES (${u.pmo}, 'compensation.read', 'test', ${u.owner}) RETURNING id`;
  assert.ok((await S.loadSession(sql, live.sid))!.capabilities.some((c) => c.capability === "compensation.read"));
  await sql`UPDATE user_capabilities SET revoked_at = now(), revoked_by = ${u.owner} WHERE id = ${grant.id}`;
  assert.ok(!(await S.loadSession(sql, live.sid))!.capabilities.some((c) => c.capability === "compensation.read"), "revoked capability gone");

  // Talent: revoking the identity link ends the session.
  const { revokeTalentLink } = await import("../src/lib/talent/identity");
  await sql`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, linked_by_user_id) VALUES (${u.talentB}, 'SYN-B', 'NB', 'B', ${u.owner})`;
  const t = await login("talentB", { method: "talent_link", stepUp: true });
  const [talentPolicy] = await sql`SELECT absolute_expires_at - created_at AS abs FROM auth_sessions WHERE id = ${t.sid}`;
  assert.match(String(talentPolicy.abs), /90 days/, "Talent absolute lifetime");
  assert.equal(await revokeTalentLink(sql, u.talentB), true);
  assert.equal(await S.loadSession(sql, t.sid), null, "Talent session ends with its link");
  await sql`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, linked_by_user_id) VALUES (${u.talentB}, 'SYN-B', 'NB', 'B', ${u.owner})`;
});

test("email codes: hashed, single use, expiring, 5 tries, superseded, session-bound; break-glass survives mail outages", async () => {
  const issued = await OTP.issueChallenge(sql, { userId: u.hr, purpose: "login" });
  assert.match(issued.code, /^\d{6}$/);
  const [row] = await sql`SELECT code_hmac FROM auth_email_challenges WHERE id = ${issued.id}`;
  assert.notEqual(row.code_hmac, issued.code);
  assert.ok(!JSON.stringify(await sql`SELECT * FROM auth_email_challenges`).includes(issued.code), "the code is not stored");
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.ta, purpose: "login", code: issued.code })).ok, false, "bound to its user");
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "reset", code: issued.code })).ok, false, "bound to its purpose");
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: issued.code })).ok, true);
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: issued.code })).ok, false, "replay refused");

  const expired = await OTP.issueChallenge(sql, { userId: u.hr, purpose: "login" });
  await sql`UPDATE auth_email_challenges SET created_at = now() - interval '11 minutes', expires_at = now() - interval '1 minute' WHERE id = ${expired.id}`;
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: expired.code })).ok, false, "expired");

  const brute = await OTP.issueChallenge(sql, { userId: u.hr, purpose: "login" });
  const wrong = brute.code === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++) assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: wrong })).ok, false);
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: brute.code })).ok, false, "locked after 5 wrong guesses");

  const first = await OTP.issueChallenge(sql, { userId: u.hr, purpose: "login" });
  const second = await OTP.issueChallenge(sql, { userId: u.hr, purpose: "login" });
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: first.code })).ok, first.code === second.code, "a newer code supersedes");
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: second.code })).ok, first.code !== second.code);

  const s1 = await login("hr");
  const s2 = await login("hr");
  const step = await OTP.issueChallenge(sql, { userId: u.hr, purpose: "step_up", sessionId: s1.sid });
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "step_up", sessionId: s2.sid, code: step.code })).ok, false, "step-up code bound to its session");
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "step_up", sessionId: s1.sid, code: step.code })).ok, true);

  // @ts-expect-error JS runtime module
  const { issueRecoveryCode } = await import("../scripts/issue-recovery-code.mjs");
  const glass = await issueRecoveryCode(sql, "hr.sec@celerates.com", "mail outage drill");
  await OTP.issueChallenge(sql, { userId: u.hr, purpose: "login" }); // an emailed code that never arrived
  assert.equal((await OTP.verifyChallenge(sql, { userId: u.hr, purpose: "login", code: glass })).ok, true, "break-glass code still works");
  assert.equal((await auditRows("break_glass_code_issued")).length, 1, "break-glass issuance is audited");
  await assert.rejects(issueRecoveryCode(sql, "talent.a.sec@celerates.com", "x reason"), /No active backoffice/);

  assert.deepEqual(OTP.mailboxAllowed("hr.sec@celerates.com"), { ok: true, exception: false });
  assert.deepEqual(OTP.mailboxAllowed("pilot.sec@celerates.co.id"), { ok: true, exception: false });
  assert.deepEqual(OTP.mailboxAllowed("outside.sec@gmail.com"), { ok: false, exception: false });
  process.env.AUTH_EMAIL_EXCEPTIONS = "outside.sec@gmail.com";
  assert.deepEqual(OTP.mailboxAllowed("Outside.Sec@gmail.com"), { ok: true, exception: true }, "explicit exception");
  process.env.AUTH_EMAIL_EXCEPTIONS = "";

  const { allowAttempt } = await import("../src/lib/login-throttle");
  for (let i = 0; i < 3; i++) assert.equal(await allowAttempt(sql, "test:k", 3), true);
  assert.equal(await allowAttempt(sql, "test:k", 3), false, "rate limit");
});

test("passkey: registration verifies attestation; assertion verifies RP/origin/UV/signature and is single-use", async () => {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  assert.ok(jwk.x && jwk.y);
  const credentialRaw = randomBytes(32);
  const credentialId = credentialRaw.toString("base64url");
  const encode = (v: Buffer) => v.toString("base64url");
  const makeClient = (type: "webauthn.create" | "webauthn.get", challenge: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin: "http://localhost:3000", crossOrigin: false }));

  const cborLength = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) {
      const out = Buffer.alloc(3);
      out[0] = (major << 5) | 25;
      out.writeUInt16BE(n, 1);
      return out;
    }
    throw new Error("test cbor length too large");
  };
  const cborInt = (n: number) => cborLength(n >= 0 ? 0 : 1, n >= 0 ? n : -1 - n);
  const cborBytes = (v: Buffer) => Buffer.concat([cborLength(2, v.length), v]);
  const cborText = (v: string) => {
    const raw = Buffer.from(v);
    return Buffer.concat([cborLength(3, raw.length), raw]);
  };
  const cborMap = (pairs: [Buffer, Buffer][]) =>
    Buffer.concat([cborLength(5, pairs.length), ...pairs.flatMap(([k, v]) => [k, v])]);

  const cose = cborMap([
    [cborInt(1), cborInt(2)], // kty EC2
    [cborInt(3), cborInt(-7)], // ES256
    [cborInt(-1), cborInt(1)], // P-256
    [cborInt(-2), cborBytes(Buffer.from(jwk.x!, "base64url"))],
    [cborInt(-3), cborBytes(Buffer.from(jwk.y!, "base64url"))],
  ]);
  const rpHash = createHash("sha256").update("localhost").digest();
  const registrationAuthData = Buffer.alloc(37 + 16 + 2);
  rpHash.copy(registrationAuthData, 0);
  registrationAuthData[32] = 0x45; // UP + UV + attested credential data
  registrationAuthData.writeUInt32BE(0, 33);
  registrationAuthData.writeUInt16BE(credentialRaw.length, 53);
  const attestationObject = cborMap([
    [cborText("fmt"), cborText("none")],
    [cborText("authData"), cborBytes(Buffer.concat([registrationAuthData, credentialRaw, cose]))],
    [cborText("attStmt"), cborMap([])],
  ]);

  const reg = await PASSKEY.issuePasskeyChallenge(sql, { purpose: "register", userId: u.hr });
  const regClient = makeClient("webauthn.create", reg.challenge);
  const registrationInput = {
    userId: u.hr,
    challengeId: reg.id,
    credentialId,
    clientDataJSON: encode(regClient),
    attestationObject: encode(attestationObject),
    transports: ["internal"],
    label: "Synthetic Windows Hello",
  };
  const saved = await PASSKEY.registerPasskey(sql, registrationInput);
  assert.match(saved.id, /^[0-9a-f-]{36}$/i);
  const [stored] = await sql`SELECT public_key_spki, algorithm, sign_count FROM auth_passkey_credentials WHERE id = ${saved.id}`;
  assert.equal(stored.algorithm, -7);
  assert.equal(Number(stored.sign_count), 0);
  assert.ok(typeof stored.public_key_spki === "string" && stored.public_key_spki.length > 40);

  await assert.rejects(
    PASSKEY.registerPasskey(sql, registrationInput),
    /invalid_or_expired_challenge/,
    "registration challenge is single-use",
  );

  const loginChallenge = await PASSKEY.issuePasskeyChallenge(sql, { purpose: "login" });
  const assertionClient = makeClient("webauthn.get", loginChallenge.challenge);
  const authData = Buffer.alloc(37);
  rpHash.copy(authData, 0);
  authData[32] = 0x05; // user present + user verified
  authData.writeUInt32BE(1, 33);
  const signed = Buffer.concat([authData, createHash("sha256").update(assertionClient).digest()]);
  const signature = signData("sha256", signed, privateKey);
  const user = await PASSKEY.verifyPasskeyAssertion(sql, {
    challengeId: loginChallenge.id,
    credentialId,
    clientDataJSON: encode(assertionClient),
    authenticatorData: encode(authData),
    signature: encode(signature),
    userHandle: Buffer.from(u.hr).toString("base64url"),
  });
  assert.equal(user?.id, u.hr);

  assert.equal(await PASSKEY.verifyPasskeyAssertion(sql, {
    challengeId: loginChallenge.id,
    credentialId,
    clientDataJSON: encode(assertionClient),
    authenticatorData: encode(authData),
    signature: encode(signature),
    userHandle: Buffer.from(u.hr).toString("base64url"),
  }), null, "assertion challenge replay is refused");

  const noUv = await PASSKEY.issuePasskeyChallenge(sql, { purpose: "login" });
  const noUvClient = makeClient("webauthn.get", noUv.challenge);
  const noUvAuth = Buffer.from(authData);
  noUvAuth[32] = 0x01;
  noUvAuth.writeUInt32BE(2, 33);
  const noUvSigned = Buffer.concat([noUvAuth, createHash("sha256").update(noUvClient).digest()]);
  const noUvSig = signData("sha256", noUvSigned, privateKey);
  assert.equal(await PASSKEY.verifyPasskeyAssertion(sql, {
    challengeId: noUv.id,
    credentialId,
    clientDataJSON: encode(noUvClient),
    authenticatorData: encode(noUvAuth),
    signature: encode(noUvSig),
    userHandle: Buffer.from(u.hr).toString("base64url"),
  }), null, "user verification is mandatory");

  const session = await login("hr", { method: "passkey", stepUp: true });
  assert.equal(session.authMethod, "passkey");
  assert.ok(session.stepUpAt, "passkey login is a fresh strong session");
});

test("backoffice login: new browser → password → corporate-mailbox code → trusted browser → revocable session; next time no code", async () => {
  const { POST } = await import("../src/app/api/login/route");
  const { authOptions } = await import("../src/lib/auth");
  const credentials = authOptions.providers.find((p) => p.id === "credentials") as unknown as { options: { authorize: (c: unknown, r: unknown) => Promise<{ id: string; sid: string } | null> } };
  const authorize = (cookie = "", password = PASSWORD) => credentials.options.authorize({ email: "ta.sec@celerates.com", password }, { headers: { cookie, "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", "cf-connecting-ip": "203.0.113.7" } });
  const call = (body: unknown, cookie = "", origin = "http://localhost:3000") =>
    POST(new Request("http://localhost:3000/api/login", { method: "POST", headers: { "content-type": "application/json", cookie, origin, "cf-connecting-ip": "203.0.113.7" }, body: JSON.stringify(body) }));
  outbox.length = 0;

  assert.equal((await call({ action: "start", email: "ta.sec@celerates.com", password: "wrong-password" })).status, 401, "wrong password: no code sent");
  assert.equal(outbox.length, 0);
  assert.equal((await call({ action: "start", email: "ta.sec@celerates.com", password: PASSWORD }, "", "https://evil.example")).status, 403, "cross-origin refused");
  assert.equal(await authorize(), null, "password alone on a new browser gets no session");

  const start = await call({ action: "start", email: "ta.sec@celerates.com", password: PASSWORD });
  assert.deepEqual(await start.json(), { next: "otp" });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, "ta.sec@celerates.com");
  const code = outbox[0].code;
  assert.equal((await call({ action: "verify", email: "ta.sec@celerates.com", code: code === "123456" ? "654321" : "123456" })).status, 401, "wrong code");
  const verified = await call({ action: "verify", email: "ta.sec@celerates.com", code });
  assert.equal(verified.status, 200);
  const setCookie = verified.headers.get("set-cookie") ?? "";
  assert.match(setCookie, /^erp-tb=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=2592000/);
  const cookie = setCookie.split(";")[0];
  assert.equal((await call({ action: "verify", email: "ta.sec@celerates.com", code })).status, 401, "OTP replay refused");

  const user = await authorize(cookie);
  assert.ok(user?.sid, "session issued after the code");
  const [session] = await sql`SELECT auth_method, step_up_at, trusted_browser_id, device, ip_prefix FROM auth_sessions WHERE id = ${user!.sid}`;
  assert.equal(session.auth_method, "password+email_otp");
  assert.ok(session.step_up_at && session.trusted_browser_id, "fresh code counts as recent auth");
  assert.equal(session.device, "Chrome · Windows");
  assert.equal(session.ip_prefix, "203.0.113.0/24", "only a coarse prefix is kept");

  // The cookie carries only the session locator; claims come from the database and leave before encoding.
  const jwt = authOptions.callbacks!.jwt!;
  const token = await jwt({ token: {}, user: { id: user!.id, sid: user!.sid } as never, account: null } as never);
  assert.deepEqual(Object.keys(token).sort(), ["sid", "sub"]);
  const read = await jwt({ token } as never);
  const sessionOut = await authOptions.callbacks!.session!({ session: { expires: "" } as never, token: read } as never);
  assert.equal((sessionOut.user as { id: string }).id, u.ta);
  assert.ok(!("claims" in read), "claims removed before the cookie is re-encoded");

  // Daily use: same trusted browser, session expired → password only, no email.
  outbox.length = 0;
  assert.deepEqual(await (await call({ action: "start", email: "ta.sec@celerates.com", password: PASSWORD }, cookie)).json(), { next: "signin" });
  assert.equal(outbox.length, 0, "no code on a trusted browser");
  const again = await authorize(cookie);
  assert.ok(again?.sid);
  const [second] = await sql`SELECT auth_method, step_up_at FROM auth_sessions WHERE id = ${again!.sid}`;
  assert.equal(second.auth_method, "password");
  assert.equal(second.step_up_at, null, "a later sign-in on a trusted browser is not a fresh step-up");

  // Revocation through the session row ends the cookie's validity in the callback NextAuth runs on every read.
  await S.revokeSession(sql, again!.sid, "user_revoked");
  await assert.rejects(async () => jwt({ token: { sub: u.ta, sid: again!.sid } } as never), /session_invalid/);

  // Trusted-browser revocation: the next login needs a code again.
  await S.revokeUserSessions(sql, u.ta, "logout_all", { browsers: true });
  assert.equal(await authorize(cookie), null, "revoked trusted browser no longer skips the code");

  // Non-corporate mailbox: no code is ever sent there unless explicitly excepted.
  outbox.length = 0;
  const gmail = await POST(new Request("http://localhost:3000/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", email: "outside.sec@gmail.com", password: PASSWORD }) }));
  assert.equal(gmail.status, 403);
  assert.equal(outbox.length, 0);

  // Invite / forgotten password: same primitive, no enumeration, all sessions revoked.
  const before = await login("ta");
  assert.deepEqual(await (await call({ action: "reset-start", email: "nobody@celerates.com" })).json(), { next: "reset-code" }, "unknown account: same answer");
  assert.equal(outbox.length, 0);
  await call({ action: "reset-start", email: "ta.sec@celerates.com" });
  const reset = outbox.pop()!;
  assert.equal(reset.purpose, "reset");
  assert.equal((await call({ action: "reset-verify", email: "ta.sec@celerates.com", code: reset.code, password: "short" })).status, 400);
  const done = await call({ action: "reset-verify", email: "ta.sec@celerates.com", code: reset.code, password: "New-Synthetic-Password-2" });
  assert.equal(done.status, 200);
  assert.equal(await S.loadSession(sql, before.sid), null, "password reset revokes prior sessions");
  assert.ok(await authorize(done.headers.get("set-cookie")!.split(";")[0], "New-Synthetic-Password-2"), "the new password signs in on the verified browser");
  await sql`UPDATE users SET password_hash = (SELECT password_hash FROM users WHERE id = ${u.hr}) WHERE id = ${u.ta}`;

  const logins = await auditRows("login");
  assert.ok(logins.some((r) => r.decision === "deny" && r.reason === "email_verification_required"));
  assert.ok(logins.some((r) => r.decision === "deny" && r.reason === "bad_credentials"));
  assert.ok(logins.some((r) => r.decision === "allow" && r.reason === "password+email_otp"));
  assert.ok((await auditRows("otp_login_verify")).some((r) => r.decision === "deny"));
  assert.ok((await auditRows("password_reset")).length === 1);
});

test("pilot OTP waiver: listed test accounts sign in with the password alone and it is audited; an Owner or unlisted account never does", async () => {
  const { POST } = await import("../src/app/api/login/route");
  const { authOptions } = await import("../src/lib/auth");
  const otp = await import("../src/lib/security/email-otp");
  const credentials = authOptions.providers.find((p) => p.id === "credentials") as unknown as { options: { authorize: (c: unknown, r: unknown) => Promise<{ id: string; sid: string } | null> } };
  const authorize = (email: string) => credentials.options.authorize({ email, password: PASSWORD }, { headers: { cookie: "", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/130.0", "cf-connecting-ip": "203.0.113.9" } });
  const start = (email: string) =>
    POST(new Request("http://localhost:3000/api/login", { method: "POST", headers: { "content-type": "application/json", cookie: "", origin: "http://localhost:3000", "cf-connecting-ip": "203.0.113.9" }, body: JSON.stringify({ action: "start", email, password: PASSWORD }) }));
  process.env.AUTH_OTP_WAIVED_EMAILS = " HR.sec@celerates.com , owner.sec@celerates.com ";
  try {
    assert.equal(otp.otpWaived({ email: "hr.sec@celerates.com" }), true, "exact match, case and spaces ignored");
    assert.equal(otp.otpWaived({ email: "owner.sec@celerates.com", is_owner: true }), false, "never an Owner, even when listed");
    assert.equal(otp.otpWaived({ email: "ta.sec@celerates.com" }), false);

    outbox.length = 0;
    assert.deepEqual(await (await start("hr.sec@celerates.com")).json(), { next: "signin" });
    assert.equal(outbox.length, 0, "no mailbox code is sent");
    const user = await authorize("hr.sec@celerates.com");
    assert.ok(user?.sid, "the password alone opens a session");
    const [session] = await sql`SELECT auth_method, step_up_at FROM auth_sessions WHERE id = ${user!.sid}`;
    assert.equal(session.auth_method, "password");
    assert.equal(session.step_up_at, null, "no step-up: sensitive actions still need a real code or a passkey");
    const [entry] = await sql`SELECT reason FROM sensitive_access_log WHERE session_id = ${user!.sid} AND action = 'login'`;
    assert.equal(entry.reason, "password;otp_waived", "the waiver is visible in the audit log");

    assert.deepEqual(await (await start("owner.sec@celerates.com")).json(), { next: "otp" }, "a listed Owner still needs the code");
    assert.equal(await authorize("owner.sec@celerates.com"), null);
    assert.equal(await authorize("ta.sec@celerates.com"), null, "an unlisted account still needs the code");
  } finally {
    delete process.env.AUTH_OTP_WAIVED_EMAILS;
  }
});

test("middleware: a copied cookie is refused on the very next request after its session is revoked", async () => {
  const { encode } = await import("next-auth/jwt");
  const { NextRequest } = await import("next/server");
  const { middleware } = await import("../src/middleware");
  const { GET: sessionCheck } = await import("../src/app/api/session-check/route");
  // The Edge middleware asks /api/session-check over loopback; here that request goes straight to the route.
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    assert.equal(url, "http://127.0.0.1:3000/api/session-check");
    return sessionCheck(new NextRequest(url, { headers: init?.headers }));
  }) as typeof fetch;
  after(() => void (globalThis.fetch = realFetch));
  const s = await login("hr");
  const cookie = `next-auth.session-token=${await encode({ token: { sub: u.hr, sid: s.sid }, secret: process.env.NEXTAUTH_SECRET! })}`;
  const request = (p: string) => middleware(new NextRequest(`http://localhost:3000${p}`, { headers: { cookie } }));
  assert.equal((await request("/hr")).headers.get("x-middleware-next"), "1", "valid session passes");
  assert.equal((await request("/finance")).status, 403, "route gate uses fresh DB claims");
  // A forged cookie claiming Owner does not help: claims come only from the session row.
  const forged = `next-auth.session-token=${await encode({ token: { sub: u.hr, sid: s.sid, isOwner: true, access: [{ divisionKey: "finance", level: "full" }] }, secret: process.env.NEXTAUTH_SECRET! })}`;
  assert.equal((await middleware(new NextRequest("http://localhost:3000/finance", { headers: { cookie: forged } }))).status, 403);
  await S.revokeSession(sql, s.sid, "user_revoked");
  const page = await request("/hr/00000000-0000-0000-0000-000000000000");
  assert.equal(page.status, 307);
  assert.match(page.headers.get("location") ?? "", /\/login/);
  assert.match(page.headers.get("set-cookie") ?? "", /next-auth\.session-token=;/, "stale cookie dropped");
  assert.equal((await request("/api/identity-documents?subject_kind=employee&subject_id=x")).status, 403, "API refused");
  assert.equal((await middleware(new NextRequest("http://localhost:3000/hr"))).status, 307, "anonymous refused");
});

test("identity documents: encrypted upload, scoped reads, step-up, lifecycle, audit, Agent metadata only", async () => {
  const [onb] = await sql`INSERT INTO onboarding_requests (ta_pic_name, nik, bank_account_no) VALUES ('Synthetic TA', ${encryptPII(SYNTHETIC_NIK)}, ${encryptPII("1234567890")}) RETURNING id`;
  const taFresh = await login("ta", { stepUp: true });

  // Upload validation: magic bytes, declared type, size, markup polyglots.
  const reject = async (bytes: Buffer, declared: string, code: string) =>
    assert.rejects(ID.uploadIdentityDocument(sql, taFresh, { subject: { onboardingId: onb.id }, docType: "ktp", declaredType: declared, bytes }), (e: unknown) => e instanceof ID.IdentityDocError && e.code === code, code);
  await reject(jpeg(), "image/png", "type_mismatch");
  await reject(Buffer.from("GIF89a" + "x".repeat(100)), "image/gif", "unsupported_content");
  await reject(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`), "image/svg+xml", "unsupported_content");
  await reject(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from("<html><script>alert(1)</script></html>")]), "image/jpeg", "unsupported_content");
  await reject(Buffer.from("%PDF-1.7 no end marker"), "application/pdf", "unsupported_content");
  await reject(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(ID.MAX_IDENTITY_BYTES)]), "image/jpeg", "invalid_size");
  await assert.rejects(ID.uploadIdentityDocument(sql, taFresh, { subject: { onboardingId: onb.id }, docType: "passport", declaredType: "image/jpeg", bytes: jpeg() }), /invalid_doc_type/);
  const pmo = await login("pmo", { stepUp: true });
  await assert.rejects(ID.uploadIdentityDocument(sql, pmo, { subject: { onboardingId: onb.id }, docType: "ktp", declaredType: "image/jpeg", bytes: jpeg() }), /out_of_scope/, "PMO cannot upload");

  const ktp = jpeg("onboarding");
  const { id } = await ID.uploadIdentityDocument(sql, taFresh, { subject: { onboardingId: onb.id }, docType: "ktp", declaredType: "image/jpeg", bytes: ktp });
  const [row] = await sql`SELECT * FROM identity_documents WHERE id = ${id}`;
  assert.match(row.object_key, /^id\/[0-9a-f]{32}$/, "opaque key");
  for (const leak of [onb.id, "ktp", SYNTHETIC_NIK, "ta.sec", "Synthetic"]) assert.ok(!row.object_key.includes(leak), `key contains no ${leak}`);
  assert.equal(row.kek_version, 1);

  // The stored object is ciphertext: pulled straight from storage with storage credentials.
  const s3c = new S3Client({ endpoint: process.env.S3_ENDPOINT, region: "us-east-1", forcePathStyle: true, credentials: { accessKeyId: "S3RVER", secretAccessKey: "S3RVER" } });
  const raw = Buffer.from(await (await s3c.send(new GetObjectCommand({ Bucket: "erp-sec-identity-documents", Key: row.object_key }))).Body!.transformToByteArray());
  assert.equal(raw.length, ktp.length + 28, "iv + ciphertext + tag");
  assert.ok(!raw.includes(Buffer.from(MARKER)) && !raw.includes(Buffer.from(SYNTHETIC_NIK)) && raw.subarray(0, 3).toString("hex") !== "ffd8ff", "raw object is not the file");
  const listed = await s3c.send(new ListObjectsV2Command({ Bucket: "erp-sec-identity-documents" }));
  assert.ok(listed.Contents?.every((o) => /^id\/[0-9a-f]{32}$/.test(o.Key!)), "listing reveals nothing about people");

  // Generic document route cannot name the identity bucket.
  const store = await import("../src/lib/object-store");
  await assert.rejects(store.readObject("identity-documents", row.object_key), /Invalid bucket/);
  const { objectModule } = await import("../src/lib/files/sources");
  assert.equal(await objectModule(sql, "identity-documents", row.object_key), null);

  const read = (claims: Parameters<typeof ID.readIdentityDocument>[1]) => ID.readIdentityDocument(sql, claims, id, { ipHash: "0123456789abcdef", device: "Test" });
  const denied = (claims: Parameters<typeof ID.readIdentityDocument>[1], status: number, code: string) =>
    assert.rejects(read(claims), (e: unknown) => e instanceof ID.IdentityDocError && e.status === status && e.code === code, code);

  assert.ok((await read(taFresh)).bytes.equals(ktp), "TA + capability + step-up, onboarding in progress: ALLOW, decrypted in memory");
  await denied(await login("ta"), 401, "step_up_required");
  await denied(await login("hr", { stepUp: true }), 404, "out_of_scope"); // onboarding still TA's
  await denied(pmo, 404, "out_of_scope");
  await denied(await login("finance", { stepUp: true }), 404, "out_of_scope");
  await denied(await login("owner", { stepUp: true }), 403, "missing_capability");
  await denied(await login("talentB", { stepUp: true, method: "talent_link" }), 404, "not_own_record");
  await assert.rejects(ID.readIdentityDocument(sql, taFresh, "00000000-0000-0000-0000-000000000000"), /not_found/, "IDOR on a random id");
  await assert.rejects(ID.readIdentityDocument(sql, taFresh, "../../etc/passwd"), /not_found/);

  // Promotion moves ownership to HR; TA keeps it for the grace period only.
  const [emp] = await sql`INSERT INTO employees (onboarding_request_id, employee_no) VALUES (${onb.id}, 'SYN-0001') RETURNING id`;
  const hrFresh = await login("hr", { stepUp: true });
  assert.ok((await read(hrFresh)).bytes.equals(ktp), "HR + capability + step-up after promotion: ALLOW");
  await denied(await login("hrNoCap", { stepUp: true }), 403, "missing_capability");
  await denied(await login("ta", { stepUp: true }), 403, "missing_capability"); // TA's capability is scoped to onboarding
  await sql`UPDATE user_capabilities SET scope = 'all' WHERE user_id = ${u.ta}`;
  assert.ok(await read(await login("ta", { stepUp: true })), "TA (all-scope) within the 14-day grace: ALLOW");
  await sql`UPDATE employees SET created_at = now() - interval '15 days' WHERE id = ${emp.id}`;
  await denied(await login("ta", { stepUp: true }), 404, "out_of_scope");

  // Revoked session: its claims never load again, so nothing reaches the document code.
  const doomed = await login("hr", { stepUp: true });
  await S.revokeSession(sql, doomed.sid, "user_revoked");
  assert.equal(await S.loadSession(sql, doomed.sid), null);

  // Verification needs the capability + step-up.
  await assert.rejects(ID.verifyIdentityDocument(sql, await login("hr"), id, "verified"), /step_up_required/);
  await ID.verifyIdentityDocument(sql, hrFresh, id, "verified");

  // Talent: own KTP only, with a recent WhatsApp link; another Talent gets nothing.
  await sql`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, linked_by_user_id, erp_employee_id) VALUES (${u.talentA}, 'SYN-A', 'NA', 'A', ${u.owner}, NULL)`;
  const talentA = await login("talentA", { method: "talent_link", stepUp: true });
  const own = await ID.uploadIdentityDocument(sql, talentA, { subject: { userId: u.talentA }, docType: "ktp", declaredType: "image/jpeg", bytes: jpeg("talent") });
  assert.ok((await ID.readIdentityDocument(sql, talentA, own.id)).bytes.includes(Buffer.from("talent")), "Talent A own KTP with recent link: ALLOW");
  await sql`UPDATE auth_sessions SET step_up_at = now() - interval '11 minutes' WHERE id = ${talentA.sid}`;
  await assert.rejects(ID.readIdentityDocument(sql, (await S.loadSession(sql, talentA.sid))!, own.id), /step_up_required/, "stale link");
  await assert.rejects(ID.readIdentityDocument(sql, await login("talentB", { method: "talent_link", stepUp: true }), own.id), /not_own_record/, "cross-Talent");
  await assert.rejects(ID.readIdentityDocument(sql, talentA, id), /not_own_record/, "Talent → someone's onboarding KTP");
  await assert.rejects(ID.uploadIdentityDocument(sql, talentA, { subject: { onboardingId: onb.id }, docType: "ktp", declaredType: "image/jpeg", bytes: jpeg() }), /not_own_record/);
  await assert.rejects(ID.readIdentityDocument(sql, hrFresh, own.id), /out_of_scope/, "a Talent's own upload with no ERP employee stays theirs");

  // Status metadata: what lists and the Agent see — never content, key or wrapped key.
  const status = await ID.identityDocumentStatus(sql, hrFresh, { employeeId: emp.id });
  assert.equal(status!.find((d) => d.doc_type === "ktp")!.status, "verified");
  assert.equal(status!.find((d) => d.doc_type === "kk")!.status, "absent");
  assert.equal(await ID.identityDocumentStatus(sql, pmo, { employeeId: emp.id }), null, "PMO gets no status either");
  const { readEntity } = await import("../src/lib/agent/reads");
  const { loadActor } = await import("../src/lib/agent/reads");
  const agentView = JSON.stringify(await readEntity(sql, await loadActor(sql, u.hr), "employee", emp.id));
  assert.match(agentView, /"name":"ktp_status","label":"Status KTP","value":"terverifikasi \(\d{4}-\d{2}-\d{2}\)"/);
  for (const leak of [id, row.object_key, row.wrapped_dek, MARKER, SYNTHETIC_NIK]) assert.ok(!agentView.includes(leak), "Agent payload carries metadata only");
  const filesSource = readFileSync("src/lib/files/sources.ts", "utf8");
  assert.ok(!/identity_documents|identity-documents/.test(filesSource), "never a Company File");

  // KEK rotation: v2 wraps new keys; v1 documents still open; nothing is re-encrypted.
  await writeFile(keyringFile, `${await readFile(keyringFile, "utf8")}v2:${randomBytes(32).toString("hex")}\n`);
  KEYS.resetKeyringForTests();
  const rotated = await ID.uploadIdentityDocument(sql, await login("hrNoCap"), { subject: { employeeId: emp.id }, docType: "npwp", declaredType: "image/jpeg", bytes: jpeg("v2") });
  assert.equal((await sql`SELECT kek_version FROM identity_documents WHERE id = ${rotated.id}`)[0].kek_version, 2);
  assert.ok((await read(hrFresh)).bytes.equals(ktp), "v1 document readable after rotation");

  // Audit: one row per allow and per deny; no content, NIK or key material in it; append-only.
  const log = await sql`SELECT * FROM sensitive_access_log WHERE resource_type = 'identity_document'`;
  assert.ok(log.filter((r) => r.action === "identity_document.read" && r.decision === "allow").length >= 4);
  for (const reason of ["step_up_required", "out_of_scope", "missing_capability", "not_own_record", "not_found"])
    assert.ok(log.some((r) => r.action === "identity_document.read" && r.decision === "deny" && r.reason === reason), `deny audited: ${reason}`);
  assert.ok(log.some((r) => r.action === "identity_document.upload" && r.decision === "deny" && r.reason === "unsupported_content"));
  assert.ok(log.some((r) => r.action === "identity_document.upload" && r.decision === "allow"));
  const allAudit = JSON.stringify(await sql`SELECT * FROM sensitive_access_log`);
  for (const leak of [SYNTHETIC_NIK, MARKER, "1234567890", row.wrapped_dek]) assert.ok(!allAudit.includes(leak), "audit holds no sensitive values");
  await assert.rejects(sql`UPDATE sensitive_access_log SET decision = 'allow'`, /append-only/);
  await assert.rejects(sql`DELETE FROM sensitive_access_log`, /append-only/);
});

test("identity numbers: masked everywhere, plaintext only through policy + step-up, audited; blank edit keeps value", async () => {
  const [onb] = await sql`INSERT INTO onboarding_requests (ta_pic_name, nik, npwp, bank_account_no) VALUES ('TA', ${encryptPII(SYNTHETIC_NIK)}, ${encryptPII("091234567890123")}, ${encryptPII("1234567890")}) RETURNING id`;
  await sql`INSERT INTO employees (onboarding_request_id, employee_no) VALUES (${onb.id}, 'SYN-0002')`;
  assert.equal(PEOPLE.maskIdentity(encryptPII(SYNTHETIC_NIK)), "••••••••••••0001");
  assert.equal(PEOPLE.maskIdentity(null), null);

  await assert.rejects(PEOPLE.revealIdentityField(sql, await login("hrNoCap", { stepUp: true }), onb.id, "nik"), /izin/);
  await assert.rejects(PEOPLE.revealIdentityField(sql, await login("hr"), onb.id, "nik"), (e: unknown) => e instanceof PEOPLE.RevealDenied && e.code === "step_up_required");
  const hr = await login("hr", { stepUp: true });
  assert.equal(await PEOPLE.revealIdentityField(sql, hr, onb.id, "nik"), SYNTHETIC_NIK);
  assert.equal(await PEOPLE.revealIdentityField(sql, hr, onb.id, "bank_account_no"), "1234567890", "bank.read capability");
  await assert.rejects(PEOPLE.revealIdentityField(sql, await login("finance", { stepUp: true }), onb.id, "bank_account_no"), /izin/, "Finance without bank.read");
  await assert.rejects(PEOPLE.revealIdentityField(sql, hr, onb.id, "password_hash" as never), /izin|invalid_field/);
  const reveals = await sql`SELECT reason, decision FROM sensitive_access_log WHERE resource_id = ${onb.id}`;
  assert.ok(reveals.some((r) => r.reason === "nik:capability" && r.decision === "allow"));
  assert.ok(reveals.some((r) => r.reason === "nik:missing_capability" && r.decision === "deny"));

  const form = new FormData();
  form.set("nik", "");
  form.set("npwp", "  ");
  form.set("bank_account_no", "");
  assert.deepEqual(await PEOPLE.identityWrites(sql, hr, onb.id, form), {}, "blank keeps stored values");
  form.set("nik", "3171019900000002");
  const writes = await PEOPLE.identityWrites(sql, hr, onb.id, form);
  assert.match(writes.nik!, /^enc:v1:/);
  form.set("bank_account_no", "9999999999");
  await assert.rejects(PEOPLE.identityWrites(sql, hr, onb.id, form), /izin/, "HR without bank.write cannot change a paid account");
  const [inProgress] = await sql`INSERT INTO onboarding_requests (ta_pic_name) VALUES ('TA') RETURNING id`;
  assert.ok((await PEOPLE.identityWrites(sql, await login("ta"), inProgress.id, form)).bank_account_no, "TA enters bank details during onboarding");

  // Generated documents: masked unless the user may reveal right now.
  const stored = { nik: encryptPII(SYNTHETIC_NIK), npwp: null, family_card_no: null, bank_account_no: encryptPII("1234567890") };
  assert.equal((await PEOPLE.identityForDocument(sql, await login("hrNoCap", { stepUp: true }), onb.id, stored)).nik, "••••••••••••0001");
  assert.equal((await PEOPLE.identityForDocument(sql, hr, onb.id, stored)).nik, SYNTHETIC_NIK);
  assert.equal((await PEOPLE.identityForDocument(sql, null, onb.id, stored)).bank_account_no, "••••••7890");
});

test("static boundaries: plaintext identity, identity bucket and Intelligence storage scope", async () => {
  const walk = async (d: string) => (await readdir(d, { recursive: true })).map((f) => path.join(d, f));
  const src = (await walk("src")).filter((f) => /\.tsx?$/.test(f));
  const decrypting = src.filter((f) => /\bdecryptPII\b/.test(readFileSync(f, "utf8")));
  assert.deepEqual(decrypting.sort(), ["src/lib/people/identity.ts", "src/lib/pii-crypto.ts"], "decryptPII only behind the policy module");
  const objectStore = readFileSync("src/lib/object-store.ts", "utf8");
  assert.match(objectStore, /const allowed = new Set\(\["candidate-documents", "automation-documents"\]\);/, "identity bucket is not in the generic route's set");
  for (const f of src.filter((f) => f.includes(`${path.sep}api${path.sep}identity-documents${path.sep}`)))
    for (const handler of readFileSync(f, "utf8").split(/export async function /).slice(1))
      assert.match(handler.split("\n").slice(1, 3).join("\n"), /const claims = await currentClaims\(\);\n\s+if \(!claims\)/, `${f}: every handler starts from the live session`);
  const auth = readFileSync("src/lib/auth.ts", "utf8");
  assert.ok(!/GoogleProvider|next-auth\/providers\/google/.test(auth), "Google OAuth removed");
  const middlewareSource = readFileSync("src/middleware.ts", "utf8");
  assert.match(middlewareSource, /\/api\/session-check/, "middleware asks the live session");
  assert.doesNotMatch(middlewareSource, /token\.(status|access|isOwner|accountType)/, "middleware never trusts cookie claims");
  const intelligence = (await walk("../../services/intelligence-api/cdi")).filter((f) => f.endsWith(".py"));
  for (const f of intelligence) assert.ok(!/identity[-_]documents|erp-identity/.test(readFileSync(f, "utf8")), `${f} never names the identity bucket`);
  // Fixture hygiene: no 16-digit NIK-shaped value outside the synthetic allow-list in tests.
  for (const f of (await readdir("tests")).map((n) => path.join("tests", n))) {
    const numbers = readFileSync(f, "utf8").match(/(?<![0-9])\d{16}(?![0-9])/g) ?? [];
    assert.deepEqual(numbers.filter((n) => !n.startsWith("317101990000")), [], `${f}: only synthetic 16-digit numbers`);
  }
});

test("nothing sensitive was logged", () => {
  const all = logged.join("\n");
  for (const leak of [SYNTHETIC_NIK, MARKER, "1234567890", ...outbox.map((m) => `Kode Anda: ${m.code}`)]) assert.ok(!all.includes(leak), `log contains ${leak}`);
  const keyring = readFileSync(keyringFile, "utf8").match(/[0-9a-f]{64}/g)!;
  for (const key of keyring) assert.ok(!all.includes(key), "no key material in logs");
});

test("QA page 12: sign-in page is bare, says 'expired' only for a refused cookie, and old builds reload", async () => {
  const mw = readFileSync("src/middleware.ts", "utf8");
  assert.match(mw, /path === "\/login"[\s\S]{0,300}pass\(req, "x-erp-bare"\)/);
  assert.match(mw, /token \? "\/login\?expired=1" : "\/login"/);
  assert.doesNotMatch(mw, /AccessDenied/);
  assert.match(readFileSync("src/app/login/login-form.tsx", "utf8"), /get\("expired"\) === "1"/);
  const { isStaleBuild } = await import("../src/lib/stale-build");
  assert.equal(isStaleBuild({ name: "ChunkLoadError", message: "Loading chunk 123 failed." }), true);
  assert.equal(isStaleBuild(new Error('Server Action "abc" was not found on the server.')), true);
  assert.equal(isStaleBuild(new Error("relation does not exist")), false);
  assert.ok(readFileSync("src/app/global-error.tsx", "utf8").includes("reloadOnce()"));
});

test("QA 2026-10-09: invitation email carries no secret, escapes names, and every invite path sends it", async () => {
  process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "https://ierp.example";
  const { inviteMessage, activationLink } = await import("../src/lib/invite-mail");
  const m = inviteMessage({ to: "tyas@celerates.co.id", name: "Tyas <b>", inviter: "Owner", access: "Sales · Editor" });
  assert.ok(m.text.includes(activationLink("tyas@celerates.co.id")));
  assert.match(activationLink("tyas@celerates.co.id"), /\/login\?aktivasi=tyas%40celerates\.co\.id$/);
  assert.ok(m.html.includes("Tyas &#60;b&#62;") && !m.html.includes("Tyas <b>"));
  assert.doesNotMatch(m.text + m.html, /token|password=|code=/i);
  const actions = readFileSync("src/app/access-management/actions.ts", "utf8");
  for (const fn of ["inviteUser", "inviteUsersBulk", "resendInvite"]) assert.match(actions, new RegExp(`export async function ${fn}\\([^)]*\\)[^{]*\\{\\n  await requireActor\\(\\);\\n  const owner = await requireOwner\\(\\);`), fn);
  assert.match(actions, /lines\.length > 50/);
  assert.match(actions, /u\.password_hash/);
  assert.match(readFileSync("src/app/login/login-form.tsx", "utf8"), /searchParams\.get\("aktivasi"\)/);
});
