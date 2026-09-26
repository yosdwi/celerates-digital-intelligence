import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { EventSchemas } from "@ag-ui/core/schemas";
import { CATALOG, entityTypes, hrefFor, publicCatalog, resolvePageEntity } from "../src/lib/agent/catalog";
import { DelegationError, mintDelegation, verifyDelegation } from "../src/lib/agent/delegation";
import { applyEvent, newRun, toThreadMessages } from "../src/lib/agent/run-state";
import { readEntity, readEntitySignals, readNeighbours, search, loadActor, AgentReadError } from "../src/lib/agent/reads";
import { readOperationalContext, readSignal, checkSignals } from "../src/lib/operations/reader";

const ID = "5b0f2c7e-1d2a-4f3b-9c8d-7e6f5a4b3c2d";
function keys() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  return {
    private: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    public: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}
const user = { id: ID, name: "Synthetic Owner", owner: true, access: [] };
const ctx = { path: "/sales", module: "sales", entity: null };

test("ERP delegation: Ed25519, short-lived, issuer/audience bound, rotation-aware", () => {
  const current = keys();
  const previous = keys();
  process.env.AGENT_DELEGATION_PRIVATE_KEY = current.private.replace(/\n/g, "\\n");
  process.env.AGENT_DELEGATION_KID = "k2";
  process.env.INTELLIGENCE_ENVIRONMENT = "unit";
  const token = mintDelegation(user, ctx);
  const claims = verifyDelegation(token);
  assert.equal(claims.sub, ID);
  assert.equal(claims.iss, "celerates-erp:unit");
  assert.equal(claims.aud, "celerates-intelligence");
  assert.ok(claims.exp - claims.iat <= 300);
  const [head, body, sig] = token.split(".");
  const forged = JSON.parse(Buffer.from(body, "base64url").toString());
  forged.sub = "6c1a3d8f-2e3b-4a4c-8d9e-8f7a6b5c4d3e";
  for (const bad of [
    `${head}.${Buffer.from(JSON.stringify(forged)).toString("base64url")}.${sig}`,
    `${Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: "k2" })).toString("base64url")}.${body}.`,
    "not.a.token",
    null,
  ])
    assert.throws(() => verifyDelegation(bad), DelegationError);
  assert.throws(() => verifyDelegation(token, Math.floor(Date.now() / 1000) + 3600), DelegationError, "expired");
  process.env.INTELLIGENCE_ENVIRONMENT = "other";
  assert.throws(() => verifyDelegation(token), DelegationError, "issuer bound to environment");
  process.env.INTELLIGENCE_ENVIRONMENT = "unit";
  // Rotation: a token from the previous key verifies only while that key is listed.
  process.env.AGENT_DELEGATION_PRIVATE_KEY = previous.private;
  process.env.AGENT_DELEGATION_KID = "k1";
  const old = mintDelegation(user, ctx);
  process.env.AGENT_DELEGATION_PRIVATE_KEY = current.private;
  process.env.AGENT_DELEGATION_KID = "k2";
  assert.throws(() => verifyDelegation(old), DelegationError);
  process.env.AGENT_DELEGATION_PREVIOUS_PUBLIC_KEYS = JSON.stringify({ k1: previous.public });
  assert.equal(verifyDelegation(old).sub, ID);
  delete process.env.AGENT_DELEGATION_PREVIOUS_PUBLIC_KEYS;
  delete process.env.AGENT_DELEGATION_PRIVATE_KEY;
  assert.throws(() => mintDelegation(user, ctx), DelegationError, "unconfigured fails closed");
});

test("Entity Catalog v1: routes resolve, sensitivity is declared, forbidden fields absent", () => {
  assert.equal(entityTypes().length, 8);
  assert.deepEqual(resolvePageEntity(`/sales/opportunity-tracker/${ID}/edit?x=1`), { type: "sales_opportunity", id: ID });
  assert.deepEqual(resolvePageEntity(`/marketing/${ID}/edit`), { type: "lead", id: ID });
  assert.deepEqual(resolvePageEntity(`/sales/${ID}/edit`), { type: "commercial_pq", id: ID });
  assert.deepEqual(resolvePageEntity(`/ta/${ID}/edit`), { type: "requisition", id: ID });
  assert.deepEqual(resolvePageEntity(`/sales/accounts/${ID}`), { type: "crm_client", id: ID });
  assert.deepEqual(resolvePageEntity(`/tm/employee/${ID}`), { type: "employee", id: ID });
  for (const path of ["/sales", `/pmo/invoices/${ID}/edit`, `/sales/opportunity-tracker/${ID}/edit/extra`, `/sales/not-a-uuid/edit`, "//evil"])
    assert.equal(resolvePageEntity(path), null, path);
  assert.equal(hrefFor("task", ID), "/tasks");
  const forbidden = /salary|allowance|religion|ptkp|npwp|nik|bank|password|token|gender|marital|bpjs|signature/i;
  for (const def of CATALOG.values()) {
    for (const field of def.fields) assert.doesNotMatch(field.name, forbidden, `${def.type}.${field.name}`);
    for (const name of def.search) assert.equal(def.fields.find((f) => f.name === name)?.sensitivity, "internal", `${def.type} search ${name}`);
    for (const edge of def.edges) assert.ok(CATALOG.has(edge.target), `${def.type} → ${edge.target}`);
    for (const field of def.fields.filter((f) => /price|amount|deal/.test(f.name))) assert.equal(field.sensitivity, "commercial");
  }
  assert.doesNotMatch(JSON.stringify(publicCatalog()), /SELECT|FROM |WHERE /, "no SQL leaves ERP");
});

test("AG-UI conformance of the event shapes the panel consumes, and the pure run reducer", () => {
  const events = [
    { type: "RUN_STARTED", threadId: "thread-1", runId: "r1" },
    { type: "STEP_STARTED", stepName: "Membaca sinyal ERP" },
    { type: "TOOL_CALL_START", toolCallId: "t1", toolCallName: "erp_signal_detail" },
    { type: "TOOL_CALL_ARGS", toolCallId: "t1", delta: '{"signal_key":"qualified-trackers"}' },
    { type: "TOOL_CALL_END", toolCallId: "t1" },
    { type: "TOOL_CALL_RESULT", messageId: "t1:result", toolCallId: "t1", role: "tool", content: "{}" },
    { type: "STEP_FINISHED", stepName: "Membaca sinyal ERP" },
    { type: "CUSTOM", name: "celerates.evidence", value: { items: [{ type: "signal", title: "S", detail: ["rule"] }, { type: "made_up", title: "x", detail: [] }] } },
    { type: "TEXT_MESSAGE_START", messageId: "m1", role: "assistant" },
    { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Ringkasan" },
    { type: "TEXT_MESSAGE_END", messageId: "m1" },
    { type: "RUN_FINISHED", threadId: "thread-1", runId: "r1", result: { ok: true } },
  ];
  for (const event of events) EventSchemas.parse(event);
  let run = newRun("r1", "Tanyakan");
  events.forEach((event, i) => (run = applyEvent(run, event, String(i + 1))));
  assert.equal(run.status, "succeeded");
  assert.equal(run.text, "Ringkasan");
  assert.deepEqual(run.evidence.map((e) => e.type), ["signal"], "unknown evidence types dropped");
  const replayed = events.reduce((r, event, i) => applyEvent(r, event, String(i + 1)), run);
  assert.equal(replayed.text, "Ringkasan", "resume replay is idempotent");
  const [userMessage, assistant] = toThreadMessages([run]);
  assert.equal(userMessage.role, "user");
  const kinds = (assistant.content as { type: string }[]).map((p) => p.type);
  assert.deepEqual(kinds, ["data-progress", "data-evidence", "text", "tool-call"]);
  // ERP-held proposals are first-class parts; malformed or repeated proposal events are ignored.
  const proposalId = "0f0e0d0c-0b0a-4908-8706-050403020100";
  let proposed = newRun("r3", "Tindak lanjuti");
  for (const value of [{ id: proposalId, title: "Usulan" }, { id: proposalId, title: "Usulan" }, { id: "not-a-uuid" }])
    proposed = applyEvent(proposed, { type: "CUSTOM", name: "celerates.proposal", value });
  proposed = applyEvent(proposed, { type: "CUSTOM", name: "celerates.evidence", value: { items: [{ type: "document", title: "f.csv", detail: [] }] } });
  assert.deepEqual(proposed.proposals, [{ id: proposalId, title: "Usulan" }]);
  const parts = (toThreadMessages([proposed])[1].content as { type: string; data?: { id?: string } }[]);
  assert.deepEqual(parts.map((p) => p.type), ["data-progress", "data-evidence", "data-proposal"]);
  assert.equal(parts[2].data?.id, proposalId);
  let failed = applyEvent(newRun("r2", "x"), { type: "RUN_ERROR", message: "Tidak boleh", code: "ERP_403" });
  failed = applyEvent(failed, { type: "TEXT_MESSAGE_CONTENT", delta: "late" });
  assert.equal(failed.status, "failed");
  assert.equal(failed.text, "", "no content after terminal error");
});

test("delegated catalog reads: sensitivity, relationships, search, signal parity and module authorization", async () => {
  // @ts-expect-error JS runner
  const { migrate } = await import("../scripts/migrate.mjs");
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, port: 55442, host: "127.0.0.1" });
  await server.start();
  const url = process.env.AGENT_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:55442/postgres";
  const sql = postgres(url, { max: process.env.AGENT_DATABASE_URL ? 4 : 1, prepare: false });
  try {
    await migrate(url);
    const [owner] = await sql`INSERT INTO users (email,full_name,status,is_owner) VALUES ('agent-owner@example.test','Owner','active',true) RETURNING id`;
    const [member] = await sql`INSERT INTO users (email,full_name,status,is_owner,account_type) VALUES ('ta@example.test','TA Viewer','active',false,'backoffice') RETURNING id`;
    const [ta] = await sql`SELECT id FROM divisions WHERE key='ta'`;
    await sql`INSERT INTO user_access (user_id,division_id,level) VALUES (${member.id},${ta.id},'viewer')`;
    const [lead] = await sql`INSERT INTO leads (lead_no,client_name,contact_name,service_type_code,lead_source_code,category_code,sales_pic_name,is_qualified,contact_email,price_amount,notes) VALUES ('LEAD-9','PT Astra Synthetic','PRIVATE PERSON','outsourcing','inbound','new','Sales',true,'PRIVATE@EMAIL',99999999,'PRIVATE NOTE') RETURNING id`;
    const [tracker] = await sql`INSERT INTO sales_opportunity_trackers (lead_id,opty_no,client_name,sales_pic_name,sales_qualified,price_amount,progress_notes) VALUES (${lead.id},'OPTY-9','PT Astra Synthetic','Sales',true,123456789,'PRIVATE PROGRESS') RETURNING id`;
    await sql`INSERT INTO crm_clients (name,status_code) VALUES ('pt astra synthetic','active')`;
    const [req] = await sql`INSERT INTO requisitions (requisition_no,client_name,position_name,ta_pic_name) VALUES ('REQ-9','PT Astra Synthetic','Engineer','') RETURNING id`;
    const ownerActor = await loadActor(sql, owner.id);
    const taActor = await loadActor(sql, member.id);

    const read = await readEntity(sql, ownerActor, "sales_opportunity", tracker.id);
    const text = JSON.stringify(read);
    assert.doesNotMatch(text, /PRIVATE|123456789/, "pii/free text and commercial values never leave ERP");
    assert.equal(read.entity.record_version, 1);
    assert.deepEqual(read.entity.commercial.find((c) => c.name === "price_amount"), { name: "price_amount", label: "Harga", state: "terisi" });
    assert.ok(read.entity.withheld.some((w) => w.name.startsWith("Catatan progres")));
    assert.equal(read.entity.fields.find((f) => f.name === "sales_qualified")?.value, "Ya");
    assert.doesNotMatch(JSON.stringify(await readEntity(sql, ownerActor, "lead", lead.id)), /PRIVATE|99999999/);

    const edges = (await readNeighbours(sql, ownerActor, "sales_opportunity", tracker.id)).edges;
    const edge = (name: string) => edges.find((e) => e.name === name)!;
    assert.equal(edge("lead").count, 1);
    assert.equal(edge("requisitions").count, 0, "absence is evidence");
    assert.equal(edge("pqs").count, 0);
    assert.equal(edge("account").kind, "name_match");
    assert.equal(edge("account").count, 1, "case/whitespace-normalized name match");

    const found = await search(sql, ownerActor, "astra");
    assert.deepEqual(new Set(found.results.map((r) => r.type)), new Set(["lead", "sales_opportunity", "requisition", "crm_client"]));
    assert.doesNotMatch(JSON.stringify(found), /PRIVATE/);
    assert.equal((await search(sql, ownerActor, "100%_")).results.length, 0, "LIKE wildcards are literal");

    await assert.rejects(readEntity(sql, taActor, "sales_opportunity", tracker.id), (e: AgentReadError) => e.status === 403);
    assert.equal((await readEntity(sql, taActor, "requisition", req.id)).entity.id, req.id);
    const taEdges = (await readNeighbours(sql, taActor, "requisition", req.id)).edges;
    assert.equal(taEdges.find((e) => e.name === "tracker")?.withheld, "MODULE_FORBIDDEN", "no cross-module leak via relations");
    assert.deepEqual(new Set((await search(sql, taActor, "astra")).results.map((r) => r.type)), new Set(["requisition"]));
    await assert.rejects(readEntity(sql, ownerActor, "salary", tracker.id), (e: AgentReadError) => e.status === 404);
    await assert.rejects(readEntity(sql, ownerActor, "lead", ID), (e: AgentReadError) => e.status === 404);

    // Signal parity: the Agent reads exactly what `Perlu perhatian` shows.
    const now = new Date("2026-09-26T03:00:00Z");
    const panel = await readOperationalContext(sql, { ...ownerActor }, "/", now);
    for (const group of panel.groups) {
      const signal = await readSignal(sql, ownerActor, group.key, now);
      assert.ok(signal);
      const { entity_type, remedy, as_of, ...same } = signal;
      assert.deepEqual(same, group, `signal ${group.key} equals panel group`);
      assert.equal(as_of, now.toISOString());
      assert.ok(remedy === "task.create" || remedy === "requisition.assign_ta_pic", "every rule has an ERP-declared remedy");
      void entity_type;
    }
    assert.equal(await readSignal(sql, taActor, "qualified-trackers", now), null, "module-gated");
    const matches = await readEntitySignals(sql, ownerActor, "sales_opportunity", tracker.id);
    assert.deepEqual(matches.signals.map((s) => [s.key, s.matches]), [["qualified-trackers", true]]);
    const unassigned = await checkSignals(sql, ownerActor, "requisition", [req.id]);
    assert.deepEqual(unassigned[0].matches, [req.id]);

    // `Perlu perhatian` wording/links snapshot: any change here must be deliberate.
    const metadata = panel.groups.map(({ key, module, title, rule, source, unit, href, action }) => ({ key, module, title, rule, source, unit, href, action }));
    assert.equal(createHash("sha256").update(JSON.stringify(metadata)).digest("hex"), "08eeb5fd7a4b55ef15ae6b64a1c518fe6f08a2b5fc08ef10ff9983c28ebd970a");

    await sql`UPDATE users SET status='rejected' WHERE id=${member.id}`;
    await assert.rejects(loadActor(sql, member.id), (e: AgentReadError) => e.status === 403, "revoked user loses delegated reads");
  } finally {
    await sql.end();
    await server.stop();
    await pg.close();
  }
});
