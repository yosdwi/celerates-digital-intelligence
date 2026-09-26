import { derivedSubmissionOverdue } from "./invoice-rule";
import type { Sql } from "postgres";
import {
  operationalContext,
  selectedModules,
  canReadModule,
  type OperationalActor,
  type OperationalContextResponse,
  type OperationalGroup,
  type Module,
} from "./policy";
// Source SQL is code-owned. Neither URL input nor AI can supply SQL, identifiers, roles or actor IDs.
const specs = [
  {
    key: "qualified-leads",
    module: "marketing",
    title: "Lead siap ditinjau Sales",
    unit: "lead",
    source: "Lead → Opportunity Tracker",
    href: "/marketing",
    action: "Buka Marketing",
    itemPath: "/marketing",
    rule: "Qualified = Ya dan belum memiliki Opportunity Tracker yang terhubung. Tinjau sebelum Convert.",
    query: `SELECT l.id, l.lead_no AS label FROM leads l WHERE l.is_qualified IS TRUE AND NOT EXISTS (SELECT 1 FROM sales_opportunity_trackers s WHERE s.lead_id=l.id)`,
  },
  {
    key: "qualified-trackers",
    module: "sales",
    title: "Opportunity belum diteruskan",
    unit: "opportunity tracker",
    source: "Opportunity Tracker → Requisition / PQ",
    href: "/sales/opportunity-tracker",
    action: "Tinjau Opportunity",
    itemPath: "/sales/opportunity-tracker",
    rule: "Sales Qualified, tidak Dropped, belum memiliki Requisition maupun PQ yang terhubung. Bukan pernyataan deal sudah Win.",
    query: `SELECT s.id, s.opty_no AS label FROM sales_opportunity_trackers s WHERE s.sales_qualified IS TRUE AND s.opty_status_code <> 'dropped' AND NOT EXISTS (SELECT 1 FROM requisitions r WHERE r.opportunity_id=s.id) AND NOT EXISTS (SELECT 1 FROM opportunities o WHERE o.opportunity_tracker_id=s.id)`,
  },
  {
    key: "unassigned-requisitions",
    module: "ta",
    title: "Requisition belum memiliki TA PIC",
    unit: "requisition",
    source: "Requisition · TA PIC",
    href: "/ta",
    action: "Tentukan TA PIC",
    itemPath: "/ta",
    rule: "TA PIC kosong atau Belum Ditentukan. Periksa status pekerjaan di Requisition sebelum menetapkan PIC.",
    query: `SELECT id, requisition_no AS label FROM requisitions WHERE trim(ta_pic_name)='' OR lower(trim(ta_pic_name))='belum ditentukan'`,
  },
  {
    key: "invoice-submission",
    module: "pmo",
    title: "Invoice perlu ditinjau untuk submission",
    unit: "invoice",
    source: "TM Invoice · Services Month",
    href: "/pmo/invoices",
    action: "Buka TM Invoice",
    itemPath: "/pmo/invoices",
    rule: "Status Overdue tersimpan, atau Planned/kosong melewati tanggal 15 bulan berikutnya pukul 00.00 WIB. Ini keterlambatan submission, bukan tagihan belum dibayar.",
    query: `SELECT pi.id, o.opty_no || ' · ' || coalesce(to_char(pi.services_month_start,'YYYY-MM'),'Tanpa Services Month') AS label FROM project_invoices pi JOIN opportunities o ON o.id=pi.opportunity_id WHERE pi.status_code='overdue' OR ${derivedSubmissionOverdue("pi.status_code", "pi.services_month_start", "(SELECT as_of FROM clock)")}`,
  },
  {
    key: "missing-invoices",
    module: "pmo",
    title: "Billing Schedule belum memiliki invoice",
    unit: "jadwal bulanan",
    source: "A.Contract → Billing Schedule → TM Invoice",
    href: "/pmo/invoices",
    action: "Tinjau & siapkan invoice",
    itemPath: null,
    rule: "Satu jadwal pada kombinasi PQ dan bulan, belum ada TM Invoice. Gunakan Siapkan dari Billing Schedule; tidak dibuat saat halaman dibuka.",
    query: `SELECT min(pmb.id::text)::uuid AS id, max(o.opty_no) || ' · ' || to_char(pmb.month,'YYYY-MM') AS label FROM project_monthly_billings pmb JOIN project_contracts pc ON pc.id=pmb.contract_id JOIN opportunities o ON o.id=pc.opportunity_id WHERE NOT EXISTS (SELECT 1 FROM project_invoices pi WHERE pi.opportunity_id=pc.opportunity_id AND pi.services_month_start=pmb.month) GROUP BY pc.opportunity_id,pmb.month HAVING count(*)=1`,
  },
  {
    key: "ambiguous-billing",
    module: "pmo",
    title: "Billing Schedule perlu diperiksa",
    unit: "kombinasi PQ / bulan",
    source: "A.Contract · Billing Schedule",
    href: "/pmo/contracts",
    action: "Periksa A.Contract",
    itemPath: null,
    rule: "Lebih dari satu jadwal pada PQ dan bulan yang sama. Pembuatan invoice otomatis melewati kombinasi ini; PMO perlu memeriksa sebelum input manual.",
    query: `SELECT min(pc.id::text)::uuid AS id, max(o.opty_no) || ' · ' || to_char(pmb.month,'YYYY-MM') AS label FROM project_monthly_billings pmb JOIN project_contracts pc ON pc.id=pmb.contract_id JOIN opportunities o ON o.id=pc.opportunity_id GROUP BY pc.opportunity_id,pmb.month HAVING count(*)>1`,
  },
  {
    key: "missing-documents",
    module: "pmo",
    title: "A.Contract belum ada di Document Tracker",
    unit: "PQ",
    source: "A.Contract → Document Tracker",
    href: "/pmo",
    action: "Tinjau Document Tracker",
    itemPath: null,
    rule: "PQ memiliki A.Contract tetapi belum memiliki baris Document Tracker. Tidak menyimpulkan kelengkapan BAST.",
    query: `SELECT DISTINCT o.id, o.opty_no AS label FROM project_contracts pc JOIN opportunities o ON o.id=pc.opportunity_id WHERE NOT EXISTS (SELECT 1 FROM project_documents pd WHERE pd.opportunity_id=pc.opportunity_id)`,
  },
  {
    key: "finance-review",
    module: "finance",
    title: "Dokumen menunggu verifikasi Finance",
    unit: "handoff per PQ",
    source: "PMO → Finance · Document Handoff",
    href: "/finance",
    action: "Verifikasi di Finance",
    itemPath: null,
    rule: "Status handoff Notified. Satu handoff per PQ, bukan per invoice; belum berarti dokumen diterima.",
    query: `SELECT h.id, o.opty_no AS label FROM finance_document_handoffs h JOIN opportunities o ON o.id=h.opportunity_id WHERE h.status_code='notified'`,
  },
  {
    key: "finance-revision",
    module: "pmo",
    title: "Dokumen dikembalikan Finance",
    unit: "handoff per PQ",
    source: "Finance → PMO · Document Handoff",
    href: "/pmo/invoices",
    action: "Periksa catatan Finance",
    itemPath: null,
    rule: "Status handoff Needs Revision. Buka ERP untuk membaca catatan dan memperbaiki dokumen.",
    query: `SELECT h.id, o.opty_no AS label FROM finance_document_handoffs h JOIN opportunities o ON o.id=h.opportunity_id WHERE h.status_code='needs_revision'`,
  },
] as const;
type Spec = (typeof specs)[number];
type Tx = Parameters<Parameters<Sql["begin"]>[1]>[0];
/** ADR-009: which catalog entity a rule's ids refer to. PMO/Finance rules stay unmapped until their
 * semantics are settled (ERP audit F13); their explanations use the rule and labels only. */
export const SIGNAL_ENTITY: Record<string, string | null> = {
  "qualified-leads": "lead",
  "qualified-trackers": "sales_opportunity",
  "unassigned-requisitions": "requisition",
  "invoice-submission": null,
  "missing-invoices": null,
  "ambiguous-billing": null,
  "missing-documents": "commercial_pq",
  "finance-review": null,
  "finance-revision": null,
};
/** ADR-010: the ERP-declared remedy command for each rule's records. Unlisted rules default to a follow-up
 * task linked to the record (or unlinked, for rules whose records are outside the catalog). */
export const SIGNAL_REMEDY: Record<string, string> = {
  "unassigned-requisitions": "requisition.assign_ta_pic",
};
async function evaluate(tx: Tx, spec: Spec, asOf: string, sample = 5): Promise<OperationalGroup> {
  // A single aggregate per rule returns an exact count and at most `sample` records (5 for the panel).
  const [row] = await tx.unsafe<{ count: number; items: { id: string; label: string }[] }[]>(
    `WITH clock AS (SELECT $1::timestamptz AS as_of), matches AS (${spec.query}) SELECT (SELECT count(*)::int FROM matches) AS count, coalesce((SELECT jsonb_agg(sample) FROM (SELECT id,label FROM matches ORDER BY label,id LIMIT ${sample}) sample),'[]'::jsonb) AS items`,
    [asOf],
  );
  return {
    key: spec.key,
    module: spec.module,
    title: spec.title,
    rule: spec.rule,
    source: spec.source,
    unit: spec.unit,
    count: row.count,
    href: spec.href,
    action: spec.action,
    items: row.items.map((item) => ({
      ...item,
      href: spec.itemPath ? `${spec.itemPath}/${item.id}/edit` : spec.href,
    })),
  };
}
/** One rule by key, if the actor may read its module. Same SQL, wording and links as the panel. */
export async function readSignal(sql: Sql, actor: OperationalActor, key: string, now = new Date(), sample = 5) {
  const spec = specs.find((s) => s.key === key);
  if (!spec || !canReadModule(actor, spec.module as Module)) return null;
  const asOf = now.toISOString();
  const size = Math.max(1, Math.min(50, Math.floor(sample)));
  const group = await sql.begin("isolation level repeatable read read only", (tx) => evaluate(tx, spec, asOf, size));
  return { ...group, entity_type: SIGNAL_ENTITY[spec.key] ?? null, remedy: SIGNAL_REMEDY[spec.key] ?? "task.create", as_of: asOf };
}
/** Restricted-id evaluation ("check" mode): which readable rules for this entity type match these ids now. */
export async function checkSignals(sql: Sql, actor: OperationalActor, entityType: string, ids: string[], now = new Date()) {
  const selected = specs.filter((s) => SIGNAL_ENTITY[s.key] === entityType && canReadModule(actor, s.module as Module));
  const asOf = now.toISOString();
  return sql.begin("isolation level repeatable read read only", async (tx) => {
    const out: { key: string; title: string; rule: string; href: string; matches: string[] }[] = [];
    for (const spec of selected) {
      const rows = await tx.unsafe<{ id: string }[]>(
        `WITH clock AS (SELECT $1::timestamptz AS as_of), matches AS (${spec.query}) SELECT id::text AS id FROM matches WHERE id::text = ANY($2::text[])`,
        [asOf, ids],
      );
      out.push({ key: spec.key, title: spec.title, rule: spec.rule, href: spec.href, matches: rows.map((r) => r.id) });
    }
    return out;
  });
}
export async function readOperationalContext(
  sql: Sql,
  actor: OperationalActor,
  path: unknown,
  now = new Date(),
): Promise<OperationalContextResponse> {
  const context = operationalContext(path);
  const allowed = selectedModules(actor, context);
  const asOf = now.toISOString();
  const selected = specs.filter((s) => allowed.includes(s.module as Module));
  const coverage = selected.length
    ? "Ringkasan tingkat modul dari kondisi yang sudah didukung. Maksimal 5 record per kondisi; jumlah tetap mencakup semua record yang sesuai. Bukan seluruh pekerjaan atau SLA."
    : "Belum ada kondisi operasional terverifikasi untuk konteks dan akses ini. Gunakan Feature Request untuk menyampaikan kebutuhan dari halaman ini.";
  if (!selected.length)
    return { version: 1, context, asOf, groups: [], coverage };
  const groups = await sql.begin(
    "isolation level repeatable read read only",
    async (tx) => {
      const result: OperationalContextResponse["groups"] = [];
      for (const spec of selected) result.push(await evaluate(tx, spec, asOf));
      return result;
    },
  );
  return { version: 1, context, asOf, groups, coverage };
}

export type SignalTrend = {
  /** The last earlier day with a snapshot (YYYY-MM-DD, Asia/Jakarta). */
  since: string;
  previous: number;
  delta: number;
  /** Records matching now that did not match then (and vice versa), from up to 500 ids per snapshot. */
  added: number;
  resolved: number;
  added_items: { id: string; label: string; href: string }[];
};
const SNAPSHOT_IDS = 500;
const SNAPSHOT_REFRESH_MINUTES = 15;
const jakartaDay = (now: Date) => new Date(now.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);

/**
 * Signal history for the given evaluated groups: refresh today's snapshot (at most every 15 minutes) and compare
 * with the last earlier day observed. Best effort: callers must treat a failure as "no trend", never as an error.
 */
export async function signalTrends(sql: Sql, groups: OperationalGroup[], now = new Date()): Promise<Record<string, SignalTrend>> {
  if (!groups.length) return {};
  const day = jakartaDay(now);
  const keys = groups.map((g) => g.key);
  // jsonb arrives parsed from PostgreSQL but as text through some drivers (e.g. PGlite socket).
  const list = (value: unknown): string[] => (typeof value === "string" ? JSON.parse(value) : (value as string[])) ?? [];
  const fresh = await sql<{ rule_key: string; count: number; ids: unknown }[]>`SELECT rule_key, count, ids FROM operational_signal_snapshots
    WHERE day=${day} AND rule_key IN ${sql(keys)} AND captured_at > now() - ${SNAPSHOT_REFRESH_MINUTES} * interval '1 minute'`;
  // A recent snapshot is reused only while its count still equals the live count, so "new"/"resolved" stay
  // consistent with the delta shown next to them.
  const live = new Map(groups.map((g) => [g.key, g.count]));
  const today = new Map(fresh.filter((r) => r.count === live.get(r.rule_key)).map((r) => [r.rule_key, list(r.ids)]));
  for (const group of groups) {
    if (today.has(group.key)) continue;
    const spec = specs.find((s) => s.key === group.key);
    if (!spec) continue;
    const rows = await sql.unsafe<{ id: string }[]>(
      `WITH clock AS (SELECT $1::timestamptz AS as_of), matches AS (${spec.query}) SELECT id::text AS id FROM matches ORDER BY id LIMIT ${SNAPSHOT_IDS}`,
      [now.toISOString()],
    );
    const ids = rows.map((r) => r.id);
    await sql`INSERT INTO operational_signal_snapshots (day, rule_key, count, ids) VALUES (${day}, ${group.key}, ${group.count}, ${JSON.stringify(ids)}::jsonb)
      ON CONFLICT (day, rule_key) DO UPDATE SET count=EXCLUDED.count, ids=EXCLUDED.ids, captured_at=now()`;
    today.set(group.key, ids);
  }
  const previous = await sql<{ rule_key: string; day: string; count: number; ids: unknown }[]>`
    SELECT DISTINCT ON (rule_key) rule_key, to_char(day,'YYYY-MM-DD') AS day, count, ids FROM operational_signal_snapshots
    WHERE rule_key IN ${sql(keys)} AND day < ${day} ORDER BY rule_key, day DESC`;
  const out: Record<string, SignalTrend> = {};
  for (const prev of previous) {
    const group = groups.find((g) => g.key === prev.rule_key)!;
    const now_ = new Set(today.get(prev.rule_key) ?? []);
    const then = new Set(list(prev.ids));
    const added = [...now_].filter((id) => !then.has(id));
    const addedSet = new Set(added);
    out[prev.rule_key] = {
      since: prev.day,
      previous: prev.count,
      delta: group.count - prev.count,
      added: added.length,
      resolved: [...then].filter((id) => !now_.has(id)).length,
      added_items: group.items.filter((i) => addedSet.has(i.id)).slice(0, 3),
    };
  }
  return out;
}
