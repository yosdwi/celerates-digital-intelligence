// Workflow runs (QA doc pages 18–19, 2026-10-09). A run executes a template's work as the workflow's owner and records
// every step with its outcome, so the Runs tab shows what happened and why.
// - Scheduled runs: a one-minute ticker started with the server (instrumentation.ts). A run is claimed by moving its
//   next_run_at forward first, so it never runs twice.
// - Manual runs: "Jalankan sekarang".
// Workflows only notify inside the ERP and run the Sheet import; they send no email, so the pilot's
// integrationDisabled policy (no outside messages) still holds.
import { and, desc, eq, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  attendanceLogs, divisions, notifications, salesOpportunityTrackers, timesheetSubmissions, userAccess, users, workflowRuns, workflows,
} from "@/db/schema";
import { runImportCommit } from "@/features/sales-v2/sheet-import-core";
import { cleanConfig, nextRun, templateOf, type WorkflowConfig } from "./templates";

export type StepLog = { id: string; title: string; status: "ok" | "skipped" | "failed"; message: string; at: string };
type Ctx = { workflowId: string; config: WorkflowConfig; owner: { id: string; name: string; isOwner: boolean; divisions: Record<string, string> } };
type Outcome = { steps: StepLog[]; summary: string };

const step = (id: string, title: string, status: StepLog["status"], message: string): StepLog => ({ id, title, status, message, at: new Date().toISOString() });
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); // Asia/Jakarta date

async function notifyDivisionUsers(divisionKey: string, title: string, body: string, link: string): Promise<number> {
  const rows = await db.select({ id: users.id }).from(userAccess).innerJoin(divisions, eq(divisions.id, userAccess.division_id)).innerJoin(users, eq(users.id, userAccess.user_id))
    .where(and(eq(divisions.key, divisionKey), eq(users.status, "active")));
  const ids = [...new Set(rows.map((r) => r.id))];
  if (ids.length) await db.insert(notifications).values(ids.map((user_id) => ({ user_id, title, body, link })));
  return ids.length;
}

const RUNNERS: Record<string, (ctx: Ctx) => Promise<Outcome>> = {
  async attendance_missing({ config }) {
    const talents = await db.select({ id: users.id, name: users.full_name }).from(users).where(and(eq(users.account_type, "talent"), eq(users.status, "active")));
    const checked = new Set((await db.select({ id: attendanceLogs.user_id }).from(attendanceLogs).where(eq(attendanceLogs.work_date, today()))).map((r) => r.id));
    const missing = talents.filter((t) => !checked.has(t.id));
    const s1 = step("s1", "Cari talent belum check-in", "ok", `${missing.length} dari ${talents.length} talent aktif belum check-in (${today()}).`);
    if (!missing.length) return { steps: [s1, step("a1", "Notifikasi ke divisi", "skipped", "Semua sudah check-in.")], summary: "Semua talent sudah check-in." };
    const names = missing.slice(0, 15).map((t) => t.name).join(", ") + (missing.length > 15 ? `, +${missing.length - 15} lainnya` : "");
    const n = await notifyDivisionUsers(String(config.notify ?? "hr"), `${missing.length} talent belum check-in hari ini`, names, "/hr/attendance");
    return { steps: [s1, step("a1", "Notifikasi ke divisi", "ok", `Dikirim ke ${n} orang di divisi ${config.notify}.`)], summary: `${missing.length} talent belum check-in; ${n} orang diberi tahu.` };
  },

  async timesheet_missing({ config }) {
    const days = Number(config.days ?? 30);
    const since = new Date(Date.now() - days * 86_400_000);
    const talents = await db.select({ id: users.id, name: users.full_name }).from(users).where(and(eq(users.account_type, "talent"), eq(users.status, "active")));
    const sent = new Set((await db.select({ id: timesheetSubmissions.user_id }).from(timesheetSubmissions).where(sql`${timesheetSubmissions.created_at} >= ${since}`)).map((r) => r.id));
    const missing = talents.filter((t) => !sent.has(t.id));
    const s1 = step("s1", "Cari timesheet belum masuk", "ok", `${missing.length} dari ${talents.length} talent tanpa timesheet ${days} hari terakhir.`);
    if (!missing.length) return { steps: [s1, step("a1", "Notifikasi ke divisi", "skipped", "Semua sudah mengirim.")], summary: "Semua talent sudah mengirim timesheet." };
    const names = missing.slice(0, 15).map((t) => t.name).join(", ") + (missing.length > 15 ? `, +${missing.length - 15} lainnya` : "");
    const n = await notifyDivisionUsers(String(config.notify ?? "pmo"), `${missing.length} talent belum kirim timesheet`, names, "/timesheet");
    return { steps: [s1, step("a1", "Notifikasi ke divisi", "ok", `Dikirim ke ${n} orang di divisi ${config.notify}.`)], summary: `${missing.length} talent belum kirim timesheet; ${n} orang diberi tahu.` };
  },

  async sheet_sync({ config, owner }) {
    // The owner's own right to sync Sales sheets, checked at every run (access can change after the workflow was made).
    const level = owner.divisions.sales;
    if (!owner.isOwner && level !== "editor" && level !== "full") throw new Error("Pemilik workflow tidak lagi punya akses Editor Sales.");
    const kind = config.tracker === "pq" ? "pq" : "ot";
    const r = await runImportCommit(kind, { id: owner.id, name: `${owner.name} (workflow)` });
    if (!r.ok) {
      return { steps: [step("s1", "Baca Google Sheet", "failed", r.error)], summary: `Gagal: ${r.error}` };
    }
    const steps = [
      step("s1", "Baca Google Sheet", "ok", `Tab "${r.tab}".`),
      step("s2", "Import baris valid", "ok", `${r.created} baru, ${r.updated} diubah, ${r.same} sama, ${r.skipped} dilewati, ${r.failed.length} error.`),
    ];
    if (r.failed.length) {
      await db.insert(notifications).values({
        user_id: owner.id, title: `Sheet sync: ${r.failed.length} baris error`,
        body: r.failed.slice(0, 5).map((f) => `Baris ${f.row}: ${f.issues[0]}`).join(" · "), link: kind === "ot" ? "/sales/v2/opportunity-tracker" : "/sales/v2/pq-tracker",
      });
      steps.push(step("a1", "Kabari pemilik bila ada error", "ok", `${r.failed.length} baris error dilaporkan ke pemilik.`));
    } else steps.push(step("a1", "Kabari pemilik bila ada error", "skipped", "Tidak ada error."));
    return { steps, summary: `${r.created} baru, ${r.updated} diubah, ${r.failed.length} error.` };
  },

  async stale_deals({ config }) {
    const days = Number(config.days ?? 14);
    const before = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const deals = await db.select({ id: salesOpportunityTrackers.id, client: salesOpportunityTrackers.client_name, pic: salesOpportunityTrackers.sales_pic_name })
      .from(salesOpportunityTrackers)
      .where(and(
        inArray(salesOpportunityTrackers.opty_status_code, ["cv_submission", "solutioning", "proposal_sent", "need_action"]),
        or(isNull(salesOpportunityTrackers.last_communication_date), lt(salesOpportunityTrackers.last_communication_date, before)),
      ));
    const s1 = step("s1", "Cari deal macet", "ok", `${deals.length} deal terbuka tanpa komunikasi ${days} hari.`);
    if (!deals.length) return { steps: [s1, step("a1", "Notifikasi ke Sales PIC", "skipped", "Tidak ada deal macet.")], summary: "Tidak ada deal macet." };
    const accounts = await db.select({ id: users.id, name: users.full_name }).from(users).where(eq(users.status, "active"));
    const byName = new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a.id]));
    const perPic = new Map<string, typeof deals>();
    for (const d of deals) { const k = d.pic.trim().toLowerCase(); perPic.set(k, [...(perPic.get(k) ?? []), d]); }
    let notified = 0, unmatched = 0;
    const rows: { user_id: string; title: string; body: string; link: string }[] = [];
    for (const [pic, list] of perPic) {
      const id = byName.get(pic);
      if (!id) { unmatched += list.length; continue; }
      rows.push({ user_id: id, title: `${list.length} deal Anda tanpa komunikasi ${days} hari`, body: list.slice(0, 8).map((d) => d.client).join(", "), link: "/sales/v2/opportunity-tracker?sv=mine" });
      notified++;
    }
    if (rows.length) await db.insert(notifications).values(rows);
    return {
      steps: [s1, step("a1", "Notifikasi ke Sales PIC", "ok", `${notified} PIC diberi tahu${unmatched ? `; ${unmatched} deal dengan PIC yang bukan akun dilewati` : ""}.`)],
      summary: `${deals.length} deal macet; ${notified} PIC diberi tahu.`,
    };
  },
};

/** Runs one workflow now and records the run. Returns the run id. */
export async function runWorkflow(workflowId: string, trigger: "schedule" | "manual"): Promise<string> {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) throw new Error("Workflow tidak ditemukan.");
  const template = templateOf(wf.template);
  const [last] = await db.select({ n: workflowRuns.number }).from(workflowRuns).where(eq(workflowRuns.workflow_id, wf.id)).orderBy(desc(workflowRuns.number)).limit(1);
  const [run] = await db.insert(workflowRuns).values({ workflow_id: wf.id, number: (last?.n ?? 0) + 1, trigger, status: "running" }).returning({ id: workflowRuns.id });
  let status: "succeeded" | "failed" = "succeeded";
  let outcome: Outcome = { steps: [], summary: "" };
  let error: string | null = null;
  try {
    if (!template) throw new Error(`Template "${wf.template}" tidak dikenal.`);
    const [owner] = wf.owner_user_id ? await db.select().from(users).where(and(eq(users.id, wf.owner_user_id), eq(users.status, "active"))) : [];
    if (!owner) throw new Error("Pemilik workflow tidak aktif; workflow tidak dijalankan.");
    const access = await db.select({ key: divisions.key, level: userAccess.level }).from(userAccess).innerJoin(divisions, eq(divisions.id, userAccess.division_id)).where(eq(userAccess.user_id, owner.id));
    const config = cleanConfig(template, wf.config);
    outcome = await RUNNERS[template.key]({
      workflowId: wf.id, config,
      owner: { id: owner.id, name: owner.full_name, isOwner: owner.is_owner === true, divisions: Object.fromEntries(access.map((a) => [a.key, a.level])) },
    });
    if (outcome.steps.some((s) => s.status === "failed")) status = "failed";
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message.slice(0, 300) : "Gagal";
  }
  await db.update(workflowRuns).set({ status, finished_at: new Date(), steps: outcome.steps, summary: outcome.summary || error, error }).where(eq(workflowRuns.id, run.id));
  await db.update(workflows).set({ last_run_at: new Date() }).where(eq(workflows.id, wf.id));
  return run.id;
}

/** The next scheduled time for an enabled workflow (null when off). */
export function scheduleFor(templateKey: string, config: unknown, enabled: boolean, from = new Date()): Date | null {
  const t = templateOf(templateKey);
  return enabled && t ? nextRun(cleanConfig(t, config).schedule, from) : null;
}

let started = false;
/** Every minute: run each enabled workflow whose time has come, once (the claim moves next_run_at forward first). */
export function startWorkflowScheduler() {
  if (started || process.env.WORKFLOWS_DISABLED === "1") return;
  started = true;
  const tick = async () => {
    try {
      const due = await db.select().from(workflows).where(and(eq(workflows.enabled, true), lte(workflows.next_run_at, new Date())));
      for (const wf of due) {
        const next = scheduleFor(wf.template, wf.config, true);
        // Claim atomically: only the update that still finds the run due wins (no equality on timestamps, whose
        // microseconds JavaScript can't carry).
        const claimed = await db.update(workflows).set({ next_run_at: next }).where(and(eq(workflows.id, wf.id), eq(workflows.enabled, true), lte(workflows.next_run_at, sql`now()`))).returning({ id: workflows.id });
        if (claimed.length) await runWorkflow(wf.id, "schedule").catch(() => { /* recorded on the run */ });
      }
    } catch {
      console.warn("[workflows] scheduler tick failed");
    }
  };
  setInterval(tick, 60_000).unref();
}
