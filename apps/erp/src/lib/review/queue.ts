// Tinjau (doc 18 §17): the "menunggu saya" queue. Every item is an ERP record that is waiting for a decision by
// the signed-in user — never an inferred task. Sources are the existing ERP approval flows; each one keeps its
// own server action and guard, and this module only decides what to *show* (division-level checks, MS3 scope).
import type { Sql } from "postgres";
import { divisionLevel, type AccessClaims } from "@/lib/module-access";

export type ReviewKind = "signature" | "time_off" | "timesheet" | "finance_verify" | "finance_revise" | "proposal";
export type ReviewActor = AccessClaims & { id: string };
export type ReviewItem = {
  key: string;
  kind: ReviewKind;
  id: string;
  /** Where the decision is taken (a mobile-native review or record page). */
  href: string;
  module: string;
  title: string;
  subtitle: string | null;
  requester: string | null;
  /** When the item started waiting for this user (ISO). */
  since: string;
  /** Kind-specific extra facts (step code, period, item count …). */
  meta: Record<string, string | number | null>;
};

const EXTENSION_SOURCE = "extension_increment_request";
const PQ_SOURCE = "opportunity_pq";
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v ?? ""));
const day = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : null);
const writes = (level: string | null) => level === "editor" || level === "full";

/** The signed-in user's review queue, oldest waiting first. */
export async function reviewQueue(sql: Sql, actor: ReviewActor): Promise<ReviewItem[]> {
  const pmo = divisionLevel(actor, "pmo");
  const finance = divisionLevel(actor, "finance");
  const handoffStates = [...(writes(finance) ? ["notified"] : []), ...(writes(pmo) ? ["needs_revision"] : [])];

  const [signatures, timeOff, timesheets, handoffs, proposals] = await Promise.all([
    sql`SELECT sr.id, sr.document_title, sr.source_type, sr.step_code, sr.created_at, u.full_name AS requester,
               coalesce(c.candidate_name, e.requester_name) AS talent
          FROM signature_requests sr LEFT JOIN users u ON u.id = sr.requested_by_user_id
          LEFT JOIN extension_increment_requests e ON sr.source_type = ${EXTENSION_SOURCE} AND e.id = sr.source_id
          LEFT JOIN employees emp ON emp.id = e.employee_id
          LEFT JOIN onboarding_requests ob ON ob.id = emp.onboarding_request_id
          LEFT JOIN candidates c ON c.id = ob.candidate_id
         WHERE sr.signer_user_id = ${actor.id} AND sr.status_code = 'pending'
         ORDER BY sr.created_at LIMIT 100`,
    sql`SELECT r.id, r.start_date, r.end_date, r.created_at, u.full_name AS requester, lt.name AS leave_type, cur.step_order
          FROM time_off_requests r
          JOIN LATERAL (SELECT s.approver_user_id, s.step_order FROM time_off_approval_steps s
                         WHERE s.request_id = r.id AND s.status_code = 'pending' ORDER BY s.step_order LIMIT 1) cur ON true
          JOIN users u ON u.id = r.user_id
          LEFT JOIN leave_types lt ON lt.id = r.leave_type_id
         WHERE r.status_code = 'pending' AND cur.approver_user_id = ${actor.id}
         ORDER BY r.created_at LIMIT 100`,
    // Approving a timesheet is PMO-full/Owner only (timesheet/actions.ts); divisionLevel maps Owner to full.
    pmo === "full"
      ? sql`SELECT ts.id, ts.client_name, ts.period_start, ts.period_end, ts.created_at, u.full_name AS requester
              FROM timesheet_submissions ts JOIN users u ON u.id = ts.user_id
             WHERE ts.status_code = 'review' ORDER BY ts.created_at LIMIT 100`
      : Promise.resolve([]),
    handoffStates.length
      ? sql`SELECT h.id, h.opportunity_id, h.status_code, h.notified_at, h.notified_by_name, h.finance_notes, h.created_at,
                   o.client_name, o.opty_no,
                   (SELECT pi.id FROM project_invoices pi WHERE pi.opportunity_id = h.opportunity_id
                     ORDER BY pi.services_month_start DESC NULLS LAST, pi.created_at DESC LIMIT 1) AS invoice_id
              FROM finance_document_handoffs h LEFT JOIN opportunities o ON o.id = h.opportunity_id
             WHERE h.status_code = ANY(${handoffStates})
             ORDER BY coalesce(h.notified_at, h.created_at) LIMIT 100`
      : Promise.resolve([]),
    sql`SELECT id, title, context_path, created_at, expires_at, jsonb_array_length(items::jsonb) AS item_count
          FROM agent_proposals
         WHERE user_id = ${actor.id} AND state = 'pending' AND expires_at > now()
         ORDER BY created_at LIMIT 20`,
  ]);

  const items: ReviewItem[] = [];
  for (const s of signatures)
    items.push({
      key: `signature:${s.id}`,
      kind: "signature",
      id: s.id,
      href: `/review/signature/${s.id}`,
      module: s.source_type === EXTENSION_SOURCE ? "tm" : s.source_type === PQ_SOURCE ? "sales" : "ttd",
      // An Extension/Increment step reads as the talent it concerns; other requests by their document title.
      title: s.talent ?? s.document_title,
      subtitle: s.talent ? s.document_title : null,
      requester: s.requester ?? null,
      since: iso(s.created_at),
      meta: { source: s.source_type ?? null, step: s.step_code ?? null, extension: s.talent ? 1 : 0 },
    });
  for (const r of timeOff)
    items.push({
      key: `time_off:${r.id}`,
      kind: "time_off",
      id: r.id,
      href: `/review/time-off/${r.id}`,
      module: "attendance",
      title: r.requester,
      subtitle: r.leave_type ?? null,
      requester: null,
      since: iso(r.created_at),
      meta: { start: day(r.start_date), end: day(r.end_date), step: Number(r.step_order) },
    });
  for (const t of timesheets)
    items.push({
      key: `timesheet:${t.id}`,
      kind: "timesheet",
      id: t.id,
      href: `/review?open=timesheet:${t.id}`,
      module: "timesheet",
      title: t.requester,
      subtitle: t.client_name,
      requester: null,
      since: iso(t.created_at),
      meta: { start: day(t.period_start), end: day(t.period_end) },
    });
  for (const h of handoffs) {
    const verify = h.status_code === "notified";
    items.push({
      key: `${verify ? "finance_verify" : "finance_revise"}:${h.id}`,
      kind: verify ? "finance_verify" : "finance_revise",
      id: h.id,
      href: h.invoice_id ? `/pmo/invoices/${h.invoice_id}` : `/pmo/invoices?q=${encodeURIComponent(h.opty_no ?? "")}`,
      module: verify ? "finance" : "pmo",
      title: h.client_name ?? h.opty_no ?? "—",
      subtitle: h.opty_no ?? null,
      requester: verify ? h.notified_by_name ?? null : null,
      since: iso(h.notified_at ?? h.created_at),
      meta: { invoice: h.invoice_id ?? null, notes: verify ? null : h.finance_notes ?? null },
    });
  }
  for (const p of proposals)
    items.push({
      key: `proposal:${p.id}`,
      kind: "proposal",
      id: p.id,
      href: `/review/proposal/${p.id}`,
      module: "agent",
      title: p.title,
      subtitle: p.context_path ?? null,
      requester: null,
      since: iso(p.created_at),
      meta: { items: Number(p.item_count), expires: iso(p.expires_at) },
    });
  return items.sort((a, b) => a.since.localeCompare(b.since));
}

/** Detail for a signature review: the request, and — for an Extension/Increment step — the request context. */
export async function signatureReview(sql: Sql, actor: ReviewActor, id: string) {
  const [s] = await sql`SELECT sr.*, u.full_name AS requester FROM signature_requests sr
                          LEFT JOIN users u ON u.id = sr.requested_by_user_id WHERE sr.id = ${id}`;
  // Only the designated signer sees the review page (the sign/reject actions enforce the same rule).
  if (!s || s.signer_user_id !== actor.id) return null;
  const [hasSignature] = await sql`SELECT 1 FROM signatures WHERE user_id = ${actor.id}`;
  const attachments = await sql`SELECT id, file_name, coalesce(file_path, link_url) AS file_path FROM attachments
                                 WHERE source_type = 'signature_request_document' AND source_id = ${id} ORDER BY created_at`;
  let extension = null;
  if (s.source_type === EXTENSION_SOURCE && s.source_id) {
    const [e] = await sql`SELECT e.id, e.propose_start_date, e.propose_end_date, e.proposed_position_name, e.proposed_grade_level_code,
                                 e.proposed_employment_type_code, e.proposed_increment_amount_deal, e.proposed_increment_percent_deal,
                                 e.proposed_basic_salary_amount, e.requester_name, e.status_code, e.notes,
                                 e.requester_user_id, e.approver_1_user_id, e.approver_2_user_id, e.approver_3_user_id, e.acknowledger_user_id,
                                 emp.employee_no, emp.position_name AS current_position, c.candidate_name, o.opty_no
                            FROM extension_increment_requests e
                            LEFT JOIN employees emp ON emp.id = e.employee_id
                            LEFT JOIN onboarding_requests ob ON ob.id = emp.onboarding_request_id
                            LEFT JOIN candidates c ON c.id = ob.candidate_id
                            LEFT JOIN opportunities o ON o.id = e.pq_tracker_id
                           WHERE e.id = ${s.source_id}`;
    if (e) {
      const sigs = await sql`SELECT step_code, status_code FROM signature_requests
                              WHERE source_type = ${EXTENSION_SOURCE} AND source_id = ${e.id} ORDER BY created_at`;
      const byStep = new Map(sigs.map((r) => [r.step_code as string, r.status_code as string]));
      const people = [e.requester_user_id, e.approver_1_user_id, e.approver_2_user_id, e.approver_3_user_id, e.acknowledger_user_id].filter(Boolean);
      const names = new Map((people.length ? await sql`SELECT id, full_name FROM users WHERE id = ANY(${people})` : []).map((u) => [u.id as string, u.full_name as string]));
      const steps = (
        [
          ["requester", e.requester_user_id],
          ["approval_1", e.approver_1_user_id],
          ["approval_2", e.approver_2_user_id],
          ["approval_3", e.approver_3_user_id],
          ["acknowledge", e.acknowledger_user_id],
        ] as const
      )
        .filter(([, user]) => user)
        .map(([code, user]) => ({ code, name: names.get(user as string) ?? null, status: byStep.get(code) ?? "not_started" }));
      // Compensation stays with TM: a signer outside TM sees the request, not the pay figures.
      const tm = divisionLevel(actor, "tm");
      extension = {
        id: e.id as string,
        talent: (e.candidate_name ?? e.requester_name) as string,
        employee_no: e.employee_no as string | null,
        current_position: e.current_position as string | null,
        position: e.proposed_position_name as string | null,
        grade: e.proposed_grade_level_code as string | null,
        employment_type: e.proposed_employment_type_code as string | null,
        start: day(e.propose_start_date),
        end: day(e.propose_end_date),
        opty_no: e.opty_no as string | null,
        status: e.status_code as string,
        notes: e.notes as string | null,
        compensation: tm
          ? { increment_amount: e.proposed_increment_amount_deal as number | null, increment_percent: e.proposed_increment_percent_deal as number | null, basic_salary: e.proposed_basic_salary_amount as number | null }
          : null,
        steps,
      };
    }
  }
  return {
    id: s.id as string,
    title: s.document_title as string,
    document_url: s.document_url as string | null,
    notes: s.notes as string | null,
    status: s.status_code as string,
    step: s.step_code as string | null,
    source: s.source_type as string | null,
    requester: s.requester as string | null,
    created_at: iso(s.created_at),
    reject_reason: s.reject_reason as string | null,
    has_signature: Boolean(hasSignature),
    attachments: attachments.map((a) => ({ id: a.id as string, name: a.file_name as string, path: a.file_path as string | null })),
    extension,
  };
}

/** Detail for a time-off review: visible to the requester's approvers (any step) — the action checks the current step. */
export async function timeOffReview(sql: Sql, actor: ReviewActor, id: string) {
  const [r] = await sql`SELECT r.*, u.full_name AS requester, lt.name AS leave_type, d.full_name AS delegate
                          FROM time_off_requests r JOIN users u ON u.id = r.user_id
                          LEFT JOIN leave_types lt ON lt.id = r.leave_type_id
                          LEFT JOIN users d ON d.id = r.delegate_user_id
                         WHERE r.id = ${id}`;
  if (!r) return null;
  const steps = await sql`SELECT s.step_order, s.status_code, s.acted_at, s.notes, s.approver_user_id, u.full_name
                            FROM time_off_approval_steps s JOIN users u ON u.id = s.approver_user_id
                           WHERE s.request_id = ${id} ORDER BY s.step_order`;
  if (!steps.some((s) => s.approver_user_id === actor.id)) return null;
  const current = steps.find((s) => s.status_code === "pending") ?? null;
  const attachments = await sql`SELECT id, file_name, coalesce(file_path, link_url) AS file_path FROM attachments
                                 WHERE source_type = 'time_off_request' AND source_id = ${id} ORDER BY created_at`;
  return {
    id: r.id as string,
    requester: r.requester as string,
    leave_type: r.leave_type as string | null,
    start: day(r.start_date)!,
    end: day(r.end_date)!,
    reason: r.reason as string | null,
    delegate: r.delegate as string | null,
    status: r.status_code as string,
    created_at: iso(r.created_at),
    my_turn: r.status_code === "pending" && current?.approver_user_id === actor.id,
    steps: steps.map((s) => ({ order: Number(s.step_order), name: s.full_name as string, status: s.status_code as string, acted_at: s.acted_at ? iso(s.acted_at) : null, notes: s.notes as string | null })),
    attachments: attachments.map((a) => ({ id: a.id as string, name: a.file_name as string, path: a.file_path as string | null })),
  };
}
