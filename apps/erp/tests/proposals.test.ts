// ADR-010: ERP-held Agent proposals. Governance invariants are tested against the real migrated schema.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { loadActor } from "../src/lib/agent/reads";
import { confirmProposal, createProposal, getProposal, listProposals, ProposalError, rejectProposal } from "../src/lib/agent/proposals";
import { publicCommands } from "../src/lib/agent/commands";
import { readSignal } from "../src/lib/operations/reader";

const status = (code: number) => (e: unknown) => e instanceof ProposalError && e.status === code;

test("Agent proposals: validated for the user, confirmed only by them, re-validated, applied once, with receipts and outcomes", async () => {
  // @ts-expect-error JS runner
  const { migrate } = await import("../scripts/migrate.mjs");
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, port: 55443, host: "127.0.0.1" });
  await server.start();
  const url = process.env.PROPOSALS_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:55443/postgres";
  const sql = postgres(url, { max: process.env.PROPOSALS_DATABASE_URL ? 4 : 1, prepare: false });
  try {
    await migrate(url);
    const [ownerRow] = await sql`INSERT INTO users (email,full_name,status,is_owner) VALUES ('owner@example.test','Owner','active',true) RETURNING id`;
    const [viewerRow] = await sql`INSERT INTO users (email,full_name,status,is_owner,account_type) VALUES ('viewer@example.test','TA Viewer','active',false,'backoffice') RETURNING id`;
    const [editorRow] = await sql`INSERT INTO users (email,full_name,status,is_owner,account_type) VALUES ('editor@example.test','TA Editor','active',false,'backoffice') RETURNING id`;
    const [ta] = await sql`SELECT id FROM divisions WHERE key='ta'`;
    await sql`INSERT INTO user_access (user_id,division_id,level) VALUES (${viewerRow.id},${ta.id},'viewer'), (${editorRow.id},${ta.id},'editor')`;
    await sql`INSERT INTO pics (name) VALUES ('Rina'), ('Budi')`;
    const [a] = await sql`INSERT INTO requisitions (requisition_no,client_name,position_name,ta_pic_name) VALUES ('REQ-A','PT Satu','Engineer','') RETURNING id`;
    const [b] = await sql`INSERT INTO requisitions (requisition_no,client_name,position_name,ta_pic_name) VALUES ('REQ-B','PT Dua','Analyst','Belum ditentukan') RETURNING id`;
    const owner = await loadActor(sql, ownerRow.id);
    const viewer = await loadActor(sql, viewerRow.id);
    const editor = await loadActor(sql, editorRow.id);

    // The remedy for a signal is declared by ERP, next to the rule.
    const signal = await readSignal(sql, owner, "unassigned-requisitions", new Date(), 10);
    assert.equal(signal?.remedy, "requisition.assign_ta_pic");
    assert.equal(signal?.count, 2);
    assert.ok(publicCommands().some((c) => c.kind === "requisition.create" && c.params.some((p) => p.aliases.includes("klien"))));

    const assign = (id: string, params = {}) => ({ kind: "requisition.assign_ta_pic", target: { type: "requisition", id }, params });
    const input = {
      title: "Tindak lanjut: Requisition tanpa TA PIC",
      run_id: "0f0e0d0c-0b0a-4908-8706-050403020100",
      context_path: "/ta",
      items: [assign(a.id), assign(b.id, { ta_pic_name: "Siapa" }), { kind: "requisition.delete", params: {} }, { kind: "requisition.assign_ta_pic", target: { type: "lead", id: a.id } }],
    };
    const created = await createProposal(sql, editor, "run:key-0001", input);
    assert.equal(created.state, "pending");
    assert.deepEqual(created.counts, { ok: 0, warning: 0, needs_input: 2, invalid: 2 });
    assert.match(created.items[1].validation.messages.join(), /tidak ada di daftar PIC/);
    assert.equal(created.items[2].validation.messages[0], "Perintah tidak ada dalam daftar yang diizinkan.");
    assert.equal((await createProposal(sql, editor, "run:key-0001", input)).id, created.id, "idempotent by key");
    await assert.rejects(createProposal(sql, editor, "run:key-0001", { ...input, title: "Lain" }), status(409));
    await assert.rejects(createProposal(sql, editor, "run:key-0002", { ...input, items: [] }), status(422));

    // A viewer can receive a proposal preview but it can never apply: no write authority.
    const viewed = await createProposal(sql, viewer, "run:key-0003", { ...input, items: [assign(a.id, { ta_pic_name: "Rina" })] });
    assert.equal(viewed.items[0].validation.state, "invalid");
    assert.match(viewed.items[0].validation.messages[0], /hak ubah/);

    // Only the proposing user; only against the stored digest.
    await assert.rejects(getProposal(sql, owner, created.id), status(404));
    await assert.rejects(confirmProposal(sql, owner, created.id, { sha256: created.sha256 }), status(404));
    await assert.rejects(confirmProposal(sql, editor, created.id, { sha256: "0".repeat(64) }), status(412));
    const pending = await getProposal(sql, editor, created.id);
    assert.deepEqual(pending.items[0].fields[0].options?.map((o) => o.value), ["Budi", "Rina"], "choices are ERP reference data");

    // Someone assigns REQ-B manually meanwhile: confirmation re-validates and never overwrites.
    await sql`UPDATE requisitions SET ta_pic_name='Budi' WHERE id=${b.id}`;
    const decisions = [
      { index: 0, include: true, params: { ta_pic_name: "Rina", requisition_no: "HACK" } },
      { index: 1, include: true, params: { ta_pic_name: "Rina" } },
      { index: 2, include: true },
    ];
    const done = await confirmProposal(sql, editor, created.id, { sha256: created.sha256, decisions });
    assert.equal(done.state, "partially_applied");
    assert.deepEqual(done.receipts, { applied: 1, skipped: 3, failed: 0 });
    assert.match(done.items[1].receipt!.message!, /Sudah memiliki TA PIC: Budi/);
    assert.equal(done.items[2].receipt!.state, "skipped", "unknown command never runs, even if included");
    const [rows] = [await sql`SELECT requisition_no, ta_pic_name FROM requisitions ORDER BY requisition_no`];
    assert.deepEqual(rows.map((r) => [r.requisition_no, r.ta_pic_name]), [["REQ-A", "Rina"], ["REQ-B", "Budi"]], "non-editable params ignored");
    assert.deepEqual(done.outcome, { resolved: 1, open: 0, unknown: 0 });
    const [log] = await sql`SELECT actor_user_id, actor_name, entity_label FROM activity_logs WHERE division_key='ta' ORDER BY created_at DESC LIMIT 1`;
    assert.equal(log.actor_user_id, editorRow.id);
    assert.equal(log.actor_name, "TA Editor (via Celerates Agent)");

    // Replay (double click, retry) returns the same receipts and has no second effect.
    const replay = await confirmProposal(sql, editor, created.id, { sha256: created.sha256, decisions });
    assert.deepEqual(replay.receipts, done.receipts);
    assert.equal((await sql`SELECT count(*)::int AS n FROM agent_action_receipts WHERE proposal_id=${created.id}`)[0].n, 4);
    assert.equal((await rejectProposal(sql, editor, created.id)).state, "partially_applied", "decided proposals cannot be rejected");

    // Expiry and rejection.
    const late = await createProposal(sql, owner, "run:key-0004", { ...input, items: [assign(a.id)] });
    await sql`UPDATE agent_proposals SET expires_at=now()-interval '1 minute' WHERE id=${late.id}`;
    await assert.rejects(confirmProposal(sql, owner, late.id, { sha256: late.sha256 }), status(409));
    const rejected = await createProposal(sql, owner, "run:key-0005", { ...input, items: [assign(a.id)] });
    assert.equal((await rejectProposal(sql, owner, rejected.id)).state, "rejected");
    await assert.rejects(confirmProposal(sql, owner, rejected.id, { sha256: rejected.sha256 }), status(409));

    // Import: requisition.create mirrors the manual TA action (tracker + opportunity + requisition) per row.
    const rowsIn = [
      { kind: "requisition.create", params: { client_name: "PT Tiga", position_name: "Designer", headcount_target: "2", level_code: "Senior", opty_request_date: "2026-10-03", ta_pic_name: "rina" } },
      { kind: "requisition.create", params: { client_name: "PT Satu", position_name: "Engineer" } },
      { kind: "requisition.create", params: { client_name: "PT Empat", position_name: "QA", level_code: "Wizard" } },
      { kind: "requisition.create", params: { position_name: "Tanpa client" } },
    ];
    const imported = await createProposal(sql, owner, "run:key-0006", { title: "Impor kebutuhan.csv", items: rowsIn });
    assert.deepEqual(imported.items.map((i) => i.validation.state), ["ok", "warning", "invalid", "invalid"]);
    assert.match(imported.items[1].validation.messages[0], /duplikat dengan REQ-A/);
    assert.equal(imported.items[0].params.ta_pic_name, "Rina", "choices are canonicalised to ERP names");
    const applied = await confirmProposal(sql, owner, imported.id, { sha256: imported.sha256 });
    assert.equal(applied.state, "applied", "defaults: only items ERP marked ok");
    const [req] = await sql`SELECT r.*, t.opty_no, t.headcount_target AS tracker_headcount FROM requisitions r JOIN sales_opportunity_trackers t ON t.id=r.opportunity_id WHERE r.client_name='PT Tiga'`;
    assert.equal(req.level_code, "senior");
    assert.equal(req.headcount_target, 2);
    assert.equal(req.tracker_headcount, 2);
    assert.equal(String(req.opty_request_date instanceof Date ? req.opty_request_date.toISOString().slice(0, 10) : req.opty_request_date), "2026-10-03");
    const [opp] = await sql`SELECT pipeline_stage_code, project_name, priority_code FROM opportunities WHERE opty_no=${req.opty_no}`;
    assert.deepEqual({ ...opp }, { pipeline_stage_code: "on_going", project_name: "Designer", priority_code: "p2" });
    assert.equal((await sql`SELECT count(*)::int AS n FROM requisitions WHERE client_name='PT Satu'`)[0].n, 1, "warned duplicate not applied by default");

    // Follow-up task linked to a record; outcome tracks the task through to done.
    const task = await createProposal(sql, owner, "run:key-0007", {
      title: "Tindak lanjut",
      items: [{ kind: "task.create", target: { type: "requisition", id: b.id }, params: { title: "Cek REQ-B", due_date: "2026-10-01" } }],
    });
    const taskDone = await confirmProposal(sql, owner, task.id, { sha256: task.sha256 });
    const [kt] = await sql`SELECT task_no, source_type, source_id, created_by_user_id, tags FROM kanban_tasks WHERE title='Cek REQ-B'`;
    assert.equal(kt.source_type, "requisition");
    assert.equal(kt.source_id, b.id);
    assert.equal(kt.created_by_user_id, ownerRow.id);
    assert.match(kt.task_no, /^TASK-\d+$/);
    assert.deepEqual(taskDone.outcome, { resolved: 0, open: 1, unknown: 0 });
    await sql`UPDATE kanban_tasks SET status_code='done' WHERE task_no=${kt.task_no}`;
    const follow = await listProposals(sql, owner);
    const listed = follow.items.find((p) => p.id === task.id)!;
    assert.deepEqual(listed.outcome, { resolved: 1, open: 0, unknown: 0 }, "outcome is computed from current ERP state");
    assert.ok(follow.items.every((p) => p.items === undefined));
    assert.equal(follow.items.find((p) => p.id === late.id)?.state, "expired");

    // Feature request via the same path notifies owners like the Masukan form does.
    const fr = await createProposal(sql, editor, "run:key-0008", {
      title: "Masukan",
      items: [{ kind: "feature_request.create", params: { title: "Filter PIC", description: "Butuh filter PIC", request_type_code: "improvement", context_path: "/ta" } }],
    });
    assert.equal((await confirmProposal(sql, editor, fr.id, { sha256: fr.sha256 })).state, "applied");
    const [note] = await sql`SELECT user_id FROM notifications WHERE title='Feature Request Baru'`;
    assert.equal(note.user_id, ownerRow.id);

    // Leads (Marketing): same substrate, parity with createLead (number format, defaults), legal-form duplicate check.
    await sql`INSERT INTO leads (lead_no,client_name,contact_name,service_type_code,lead_source_code,category_code,sales_pic_name) VALUES ('OLD-1','PT Nusantara Data Tbk','A','outsourcing','ads','it','-')`;
    const leadsIn = await createProposal(sql, owner, "run:key-0010", {
      title: "Impor leads",
      items: [
        { kind: "lead.create", params: { client_name: "Maju Bersama", contact_name: "Sari", lead_source_code: "LinkedIn", service_type_code: "Headhunting", category_code: "Non IT", headcount_target: "3" } },
        { kind: "lead.create", params: { client_name: "Nusantara Data", contact_name: "Budi", lead_source_code: "ads", service_type_code: "outsourcing", category_code: "it" } },
        { kind: "lead.create", params: { client_name: "Tanpa Sumber", contact_name: "C" } },
      ],
    });
    assert.deepEqual(leadsIn.items.map((i) => i.validation.state), ["ok", "warning", "needs_input"]);
    assert.match(leadsIn.items[1].validation.messages[0], /duplikat dengan lead OLD-1/);
    assert.deepEqual(leadsIn.items[2].fields.map((f) => f.name).sort(), ["category_code", "contact_name", "lead_source_code", "sales_pic_name", "service_type_code"]);
    const leadsDone = await confirmProposal(sql, owner, leadsIn.id, {
      sha256: leadsIn.sha256,
      decisions: [{ index: 0, include: true }, { index: 1, include: false }, { index: 2, include: true, params: { lead_source_code: "referral", service_type_code: "rpo", category_code: "it" } }],
    });
    assert.equal(leadsDone.state, "applied");
    const made = await sql`SELECT lead_no, lead_source_code, service_type_code, category_code, headcount_target, price_period_code, sales_pic_name FROM leads WHERE client_name IN ('Maju Bersama','Tanpa Sumber') ORDER BY client_name`;
    assert.match(made[0].lead_no, /^MAJUBERSAM-LINK-\d{4}-\d{3}$/);
    assert.deepEqual({ ...made[0], lead_no: undefined }, { lead_no: undefined, lead_source_code: "linkedin", service_type_code: "headhunting", category_code: "non_it", headcount_target: 3, price_period_code: "monthly", sales_pic_name: "-" });
    assert.equal(made[1].lead_source_code, "referral", "user-completed fields applied");
    assert.deepEqual(leadsDone.outcome, { resolved: 0, open: 2, unknown: 0 }, "open until qualified or disqualified");

    // A revoked user loses the ability to confirm even their own pending proposal.
    const lastOne = await createProposal(sql, editor, "run:key-0009", { title: "Tugas", items: [{ kind: "task.create", params: { title: "X" } }] });
    await sql`DELETE FROM user_access WHERE user_id=${editorRow.id}`;
    const revoked = await confirmProposal(sql, await loadActor(sql, editorRow.id), lastOne.id, { sha256: lastOne.sha256, decisions: [{ index: 0, include: true }] });
    assert.equal(revoked.state, "failed");
    assert.match(revoked.items[0].receipt!.message!, /hak ubah/);
  } finally {
    await sql.end();
    await server.stop();
    await pg.close();
  }
});
