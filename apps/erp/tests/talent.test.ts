import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { activeLinkForUser, issueGrant, issueGrantForEmployee, linkTalentAccount, peekGrant, redeemGrant, revokeTalentLink, TalentLinkError } from "../src/lib/talent/identity";
import { cycleLabelFor } from "../src/lib/conform/pmo";

// ADR-019 §4, doc 22 R3.2: WhatsApp reminders reach Celerates only through single-use, user-bound grants (no time
// expiry by default; a newer grant supersedes older unused ones), and only for an active Talent account with an
// active identity link. Backoffice accounts are never converted.
test("talent identity links and deep-link grants", async () => {
  // @ts-expect-error JS runner
  const { migrate } = await import("../scripts/migrate.mjs");
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, port: 55450, host: "127.0.0.1" });
  await server.start();
  const url = process.env.TALENT_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:55450/postgres";
  const sql = postgres(url, { max: process.env.TALENT_DATABASE_URL ? 4 : 1, prepare: false });
  try {
    await migrate(url);
    const [owner] = await sql`INSERT INTO users (email,full_name,status,is_owner) VALUES ('owner@example.test','Owner','active',true) RETURNING id`;
    await sql`INSERT INTO users (email,full_name,status,is_owner,account_type) VALUES ('pmo@example.test','PMO','active',false,'backoffice')`;

    const linked = await linkTalentAccount(sql, { email: "Rina@Example.test", conformEmployeeId: "MTG-TF/1", nrp: "N1", name: "Rina Synthetic", linkedBy: owner.id });
    assert.equal(linked.created, true);
    const [user] = await sql`SELECT id, account_type, status, password_hash FROM users WHERE email='rina@example.test'`;
    assert.deepEqual([user.account_type, user.status, user.password_hash], ["talent", "active", null], "a passwordless active Talent account");
    assert.equal((await linkTalentAccount(sql, { email: "rina@example.test", conformEmployeeId: "MTG-TF/1", nrp: "N1", name: "Rina Synthetic", linkedBy: owner.id })).created, false, "idempotent");
    for (const [email, id, code] of [
      ["pmo@example.test", "MTG-TF/2", "not_talent_account"],
      ["owner@example.test", "MTG-TF/2", "not_talent_account"],
      ["other@example.test", "MTG-TF/1", "employee_already_linked"],
      ["rina@example.test", "MTG-TF/9", "user_already_linked"],
    ] as const)
      await assert.rejects(linkTalentAccount(sql, { email, conformEmployeeId: id, nrp: "N", name: "X", linkedBy: owner.id }), (e: unknown) => e instanceof TalentLinkError && e.code === code);

    await assert.rejects(issueGrant(sql, { userId: user.id, targetPath: "/pmo/readiness", purpose: "manual" }), TalentLinkError, "targets stay under /me");
    const grant = await issueGrant(sql, { userId: user.id, targetPath: "/me?year=2026&month=9", purpose: "campaign", campaignRef: "c1", createdBy: owner.id });
    assert.match(grant.code, /^[A-Za-z0-9_-]{43}$/);
    const stored = await sql`SELECT token_sha256 FROM talent_link_grants`;
    assert.notEqual(stored[0].token_sha256, grant.code, "only the hash is stored");
    assert.equal(grant.expiresAt, null, "no time expiry by default");

    assert.deepEqual(await peekGrant(sql, grant.code), { userId: user.id, targetPath: "/me?year=2026&month=9" }, "peek does not consume");
    assert.ok(await peekGrant(sql, grant.code), "still unused after peeking twice");
    assert.equal(await redeemGrant(sql, grant.code, owner.id), null, "bound to its user: another user cannot redeem");
    const redeemed = await redeemGrant(sql, grant.code);
    assert.equal(redeemed?.userId, user.id);
    assert.equal(redeemed?.email, "rina@example.test");
    assert.equal(await redeemGrant(sql, grant.code), null, "single-use");
    assert.equal(await peekGrant(sql, grant.code), null);
    assert.equal(await redeemGrant(sql, "not-a-code"), null);

    const older = await issueGrant(sql, { userId: user.id, targetPath: "/me", purpose: "direct" });
    const newer = await issueGrant(sql, { userId: user.id, targetPath: "/me", purpose: "whatsapp" });
    assert.equal(await peekGrant(sql, older.code), null, "a newer grant supersedes the older unused one");
    assert.equal(await redeemGrant(sql, older.code), null);
    assert.ok(await peekGrant(sql, newer.code), "only the latest link works");
    const viaEmployee = await issueGrantForEmployee(sql, { employeeId: "MTG-TF/1", targetPath: "/me", purpose: "whatsapp" });
    assert.equal(viaEmployee?.userId, user.id, "a linked employee gets a grant for its Talent account");
    assert.equal(await peekGrant(sql, newer.code), null, "and that supersedes the previous link");
    assert.equal(await issueGrantForEmployee(sql, { employeeId: "MTG-TF/404", targetPath: "/me", purpose: "whatsapp" }), null, "no account, no grant");

    const expired = await issueGrant(sql, { userId: user.id, targetPath: "/me", purpose: "manual", ttlSeconds: 3600 });
    assert.ok(expired.expiresAt, "an explicit TTL still bounds a grant");
    await sql`UPDATE talent_link_grants SET created_at = now() - interval '2 hours', expires_at = now() - interval '1 second' WHERE token_sha256 = encode(sha256(${expired.code}::bytea), 'hex')`;
    assert.equal(await redeemGrant(sql, expired.code), null, "expired");

    const revoked = await issueGrant(sql, { userId: user.id, targetPath: "/me", purpose: "manual" });
    assert.equal(await revokeTalentLink(sql, user.id), true);
    assert.equal(await activeLinkForUser(sql, user.id), null);
    assert.equal(await redeemGrant(sql, revoked.code), null, "an unlinked Talent cannot start a session");
    await sql`INSERT INTO talent_identity_links (user_id, conform_employee_id, nrp, display_name, linked_by_user_id) VALUES (${user.id}, 'MTG-TF/1', 'N1', 'Rina', ${owner.id})`;
    await sql`UPDATE users SET status='rejected' WHERE id=${user.id}`;
    assert.equal(await redeemGrant(sql, revoked.code), null, "an inactive account cannot start a session");
    await assert.rejects(sql`INSERT INTO talent_link_grants (token_sha256, user_id, target_path, purpose, expires_at) VALUES (${"a".repeat(64)}, ${user.id}, '/pmo', 'manual', NULL)`, "targets stay under /me in the schema");
    await assert.rejects(sql`INSERT INTO talent_link_grants (token_sha256, user_id, target_path, purpose, expires_at) VALUES (${"b".repeat(64)}, ${user.id}, '/me', 'other', NULL)`, "known purposes only");
  } finally {
    await sql.end();
    await server.stop();
    await pg.close();
  }
});

test("payroll cycle label for a business date (closing day 20)", () => {
  assert.deepEqual(cycleLabelFor("2026-09-20"), { year: 2026, month: 9 });
  assert.deepEqual(cycleLabelFor("2026-09-21"), { year: 2026, month: 10 });
  assert.deepEqual(cycleLabelFor("2026-12-28"), { year: 2027, month: 1 });
});
