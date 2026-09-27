import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import postgres from "postgres";
import { loadActor } from "../src/lib/agent/reads";
import { reviewQueue, signatureReview, timeOffReview } from "../src/lib/review/queue";

// Tinjau (doc 18 §17): only records waiting for *this* user's decision, with division-level visibility for
// the handoff/timesheet sources, and compensation withheld from signers outside TM.
test("review queue: my signatures, my time-off step, handoffs by division, my pending proposals", async () => {
  // @ts-expect-error JS runner
  const { migrate } = await import("../scripts/migrate.mjs");
  const pg = await PGlite.create();
  const server = new PGLiteSocketServer({ db: pg, port: 55448, host: "127.0.0.1" });
  await server.start();
  const url = process.env.REVIEW_DATABASE_URL || "postgres://postgres:postgres@127.0.0.1:55448/postgres";
  const sql = postgres(url, { max: process.env.REVIEW_DATABASE_URL ? 4 : 1, prepare: false });
  try {
    await migrate(url);
    const user = async (email: string, name: string, owner = false) =>
      (await sql`INSERT INTO users (email,full_name,status,is_owner,account_type) VALUES (${email},${name},'active',${owner},'backoffice') RETURNING id`)[0].id as string;
    const grant = async (id: string, division: string, level: string) =>
      sql`INSERT INTO user_access (user_id,division_id,level) SELECT ${id}, d.id, ${level} FROM divisions d WHERE d.key=${division}`;
    const owner = await user("owner@example.test", "Owner", true);
    const finance = await user("finance@example.test", "Fina");
    const financeViewer = await user("finview@example.test", "Vina");
    const pmo = await user("pmo@example.test", "Pamo");
    const signer = await user("signer@example.test", "Sigit");
    const talent = await user("talent@example.test", "Tari");
    await grant(finance, "finance", "editor");
    await grant(financeViewer, "finance", "viewer");
    await grant(pmo, "pmo", "editor");
    await grant(signer, "tm", "editor");

    // Extension request journey: approval_1 is waiting for the signer.
    const [emp] = await sql`INSERT INTO employees (employee_no, position_name) VALUES ('EMP-7','Engineer') RETURNING id`;
    const [ext] = await sql`INSERT INTO extension_increment_requests (employee_id, requester_name, requester_user_id, approver_1_user_id, acknowledger_user_id, propose_start_date, propose_end_date, proposed_position_name, proposed_basic_salary_amount)
                            VALUES (${emp.id}, 'Rara Synthetic', ${owner}, ${signer}, ${finance}, '2026-10-01', '2027-09-30', 'Senior Engineer', 17000000) RETURNING id`;
    await sql`INSERT INTO signature_requests (document_title, requested_by_user_id, signer_user_id, status_code, source_type, source_id, step_code, step_order) VALUES
      ('Extension Rara', ${owner}, ${owner}, 'signed', 'extension_increment_request', ${ext.id}, 'requester', 0)`;
    const [sig] = await sql`INSERT INTO signature_requests (document_title, requested_by_user_id, signer_user_id, source_type, source_id, step_code, step_order)
                            VALUES ('Extension Rara', ${owner}, ${signer}, 'extension_increment_request', ${ext.id}, 'approval_1', 1) RETURNING id`;
    await sql`INSERT INTO signature_requests (document_title, requested_by_user_id, signer_user_id, status_code) VALUES ('Sudah', ${owner}, ${signer}, 'signed')`;

    // Time off: step 1 (pmo) approved, step 2 (signer) is current; step 3 (finance) later.
    const [lt] = await sql`INSERT INTO leave_types (name) VALUES ('Cuti tahunan') RETURNING id`;
    const [off] = await sql`INSERT INTO time_off_requests (user_id, leave_type_id, start_date, end_date, reason) VALUES (${talent}, ${lt.id}, '2026-10-05', '2026-10-07', 'Keluarga') RETURNING id`;
    await sql`INSERT INTO time_off_approval_steps (request_id, step_order, approver_user_id, status_code) VALUES
      (${off.id}, 1, ${pmo}, 'approved'), (${off.id}, 2, ${signer}, 'pending'), (${off.id}, 3, ${finance}, 'pending')`;

    // Finance handoffs: one notified (Finance decides), one returned (PMO fixes).
    const opty = async (no: string) => (await sql`INSERT INTO opportunities (opty_no,client_name,project_name,service_type_code,sales_pic_name) VALUES (${no},'PT Synthetic '||${no},'P','outsourcing','S') RETURNING id`)[0].id as string;
    const o1 = await opty("OPTY-1");
    const o2 = await opty("OPTY-2");
    await sql`INSERT INTO project_invoices (opportunity_id, services_month_start) VALUES (${o1}, '2026-07-01')`;
    const [latest] = await sql`INSERT INTO project_invoices (opportunity_id, services_month_start) VALUES (${o1}, '2026-08-01') RETURNING id`;
    await sql`INSERT INTO finance_document_handoffs (opportunity_id, status_code, notified_at, notified_by_name, doc_url) VALUES (${o1}, 'notified', now(), 'Pamo', 'https://drive.example/x')`;
    await sql`INSERT INTO finance_document_handoffs (opportunity_id, status_code, finance_notes) VALUES (${o2}, 'needs_revision', 'BAST belum ditandatangani')`;

    // Proposals: pending (shown), expired (hidden), other user's (hidden).
    await sql`INSERT INTO agent_proposals (user_id, request_key, request_hash, title, items, sha256) VALUES (${pmo}, 'k1', 'h', 'Buat 2 task', '[{"index":0},{"index":1}]'::jsonb, 's')`;
    await sql`INSERT INTO agent_proposals (user_id, request_key, request_hash, title, items, sha256, expires_at) VALUES (${pmo}, 'k2', 'h', 'Lama', '[]'::jsonb, 's', now() - interval '1 minute')`;
    await sql`INSERT INTO agent_proposals (user_id, request_key, request_hash, title, items, sha256) VALUES (${finance}, 'k3', 'h', 'Punya Fina', '[]'::jsonb, 's')`;
    await sql`INSERT INTO timesheet_submissions (user_id, client_name, period_start, period_end) VALUES (${talent}, 'PT Synthetic', '2026-09-01', '2026-09-30')`;

    const queue = async (id: string) => reviewQueue(sql, await loadActor(sql, id));
    const kinds = async (id: string) => (await queue(id)).map((i) => i.kind).sort();

    assert.deepEqual(await kinds(signer), ["signature", "time_off"], "signer: own pending signature + current time-off step only");
    assert.deepEqual(await kinds(finance), ["finance_verify", "proposal"], "finance editor verifies; a later time-off step is not yet theirs");
    assert.deepEqual(await kinds(financeViewer), [], "viewer cannot act on a handoff, so it is not queued");
    assert.deepEqual(await kinds(pmo), ["finance_revise", "proposal"], "pmo editor fixes returned handoffs; expired proposals are gone");
    assert.deepEqual(await kinds(owner), ["finance_revise", "finance_verify", "timesheet"], "owner: handoffs and timesheets by level, never others' signatures");

    const verify = (await queue(finance)).find((i) => i.kind === "finance_verify")!;
    assert.equal(verify.href, `/pmo/invoices/${latest.id}`, "handoff opens the latest invoice record of the project");
    const revise = (await queue(pmo)).find((i) => i.kind === "finance_revise")!;
    assert.match(revise.href, /^\/pmo\/invoices\?q=OPTY-2$/, "no invoice yet → invoice list filtered by opty");
    assert.equal(revise.meta.notes, "BAST belum ditandatangani");
    assert.equal((await queue(pmo)).find((i) => i.kind === "proposal")!.meta.items, 2);
    const signerSig = (await queue(signer)).find((i) => i.kind === "signature")!;
    assert.deepEqual([signerSig.module, signerSig.meta.step, signerSig.href], ["tm", "approval_1", `/review/signature/${sig.id}`]);
    assert.equal(signerSig.title, "Rara Synthetic", "an extension step reads as the talent it concerns");

    // Signature record: signer only; TM sees compensation, a non-TM signer does not.
    const review = await signatureReview(sql, await loadActor(sql, signer), sig.id);
    assert.ok(review?.extension);
    assert.equal(review!.extension!.talent, "Rara Synthetic");
    assert.deepEqual(review!.extension!.steps.map((s) => [s.code, s.status]), [["requester", "signed"], ["approval_1", "pending"], ["acknowledge", "not_started"]]);
    assert.equal(review!.extension!.compensation?.basic_salary, 17000000);
    assert.equal(review!.has_signature, false);
    assert.equal(await signatureReview(sql, await loadActor(sql, owner), sig.id), null, "not the signer → no review page, even for Owner");
    await sql`UPDATE signature_requests SET signer_user_id=${finance} WHERE id=${sig.id}`;
    const nonTm = await signatureReview(sql, await loadActor(sql, finance), sig.id);
    assert.equal(nonTm!.extension!.compensation, null, "compensation stays with TM");
    assert.doesNotMatch(JSON.stringify(nonTm), /17000000/);

    // Time-off record: visible to the chain's approvers; only the current approver may act.
    const mine = await timeOffReview(sql, await loadActor(sql, signer), off.id);
    assert.equal(mine!.my_turn, true);
    assert.equal(mine!.leave_type, "Cuti tahunan");
    assert.equal((await timeOffReview(sql, await loadActor(sql, finance), off.id))!.my_turn, false);
    assert.equal(await timeOffReview(sql, await loadActor(sql, owner), off.id), null, "outside the chain → not found");
  } finally {
    await sql.end();
    await server.stop();
    await pg.close();
  }
});
