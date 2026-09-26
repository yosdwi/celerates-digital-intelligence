// ADR-010: the ERP command allowlist the Agent may *propose*. Nothing here runs until the proposing user
// confirms an ERP-held proposal in an ERP session. Each command re-validates inside the confirming
// transaction, checks the user's current ERP authority, and applies a narrow, precondition-guarded effect.
// Semantics mirror the corresponding manual server actions (see tests for parity).
import type { Sql, TransactionSql } from "postgres";
import { operationalContext, type Module, type OperationalActor } from "@/lib/operations/policy";
import { entity as catalogEntity, nameKey } from "./catalog";
import { canReadEntityModule } from "./reads";

type Tx = Sql | TransactionSql;
export type Validation = { state: "ok" | "warning" | "needs_input" | "invalid"; messages: string[] };
export type Target = { type: string; id: string } | null;
export type ParamSpec = {
  name: string;
  label: string;
  kind: "text" | "longtext" | "int" | "date" | "enum" | "choice";
  required?: boolean;
  max?: number;
  enum?: readonly (readonly [string, string])[];
  aliases?: string[];
  /** "choice" values come from ERP reference data at validation time (e.g. PIC names). */
  choices?: "pics";
};
export type Actor = OperationalActor & { id: string; name: string };
type Applied = { target_type: string | null; target_id: string | null; message: string };
export type CommandSpec = {
  kind: string;
  label: string;
  module: Module;
  target?: string; // required target entity type, if any
  params: ParamSpec[];
  editable: string[];
  summary: (params: Record<string, unknown>, targetLabel: string | null) => string;
  /** Business preconditions beyond parameter validation. Must be re-checked at apply time. */
  check?: (tx: Tx, params: Record<string, unknown>, target: Target) => Promise<Validation | null>;
  apply: (tx: TransactionSql, actor: Actor, params: Record<string, unknown>, target: Target, proposalId: string) => Promise<Applied>;
  /** Outcome watch: has the intended effect held / resolved the situation? */
  outcome: (tx: Tx, receipt: { target_id: string | null }) => Promise<"resolved" | "open" | "unknown">;
};

const LEVELS = [["internship", "Internship"], ["entry_level", "Entry Level"], ["junior", "Junior"], ["middle", "Middle"], ["senior", "Senior"], ["lead", "Lead"], ["manager", "Manager"], ["vp", "VP"]] as const;
const SERVICE_TYPES = [["outsourcing", "Outsourcing"], ["headhunting", "Headhunting"], ["outplacement", "Outplacement"], ["managed_service", "Managed Service"], ["project_based", "Project Based"], ["rpo", "RPO"], ["training", "Training"], ["license", "License"], ["hardware", "Hardware"], ["replacement", "Replacement"]] as const;
const PRIORITIES = [["p0", "P0"], ["p1", "P1"], ["p2", "P2"], ["p3", "P3"]] as const;
const FR_TYPES = [["improvement", "Peningkatan / Improvement"], ["bug_fix", "Bug Fix"], ["data_fix", "Perbaikan Data"], ["new_feature", "Fitur Baru"]] as const;
const UNASSIGNED = "(trim(ta_pic_name)='' OR lower(trim(ta_pic_name))='belum ditentukan')";

export function canWriteModule(actor: OperationalActor, module: Module): boolean {
  if (!actor.id || actor.status !== "active") return false;
  if (actor.isOwner === true) return true;
  const levels = ["editor", "full"];
  if (module === "general") return actor.accountType === "backoffice" && (actor.access ?? []).some((a) => levels.includes(a.level));
  return actor.accountType === "backoffice" && (actor.access ?? []).some((a) => a.divisionKey === module && levels.includes(a.level));
}

async function log(tx: Tx, division: string, action: "create" | "update", label: string, actor: Actor) {
  await tx`INSERT INTO activity_logs (division_key,action_type,entity_label,page_label,actor_user_id,actor_name)
    VALUES (${division},${action},${label},'Celerates Agent',${actor.id},${actor.name + " (via Celerates Agent)"})`;
}

async function uniqueNumber(tx: Tx, table: string, column: string, make: () => string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const candidate = make();
    const [hit] = await tx.unsafe(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [candidate]);
    if (!hit) return candidate;
  }
  return make() + "-" + Date.now();
}
const rand = (lo: number, hi: number) => Math.floor(lo + Math.random() * (hi - lo));

const taskCreate: CommandSpec = {
  kind: "task.create",
  label: "Buat task tindak lanjut",
  module: "general",
  params: [
    { name: "title", label: "Judul", kind: "text", required: true, max: 200, aliases: ["judul", "task", "tugas", "pekerjaan", "action item"] },
    { name: "description", label: "Deskripsi", kind: "longtext", max: 2000, aliases: ["deskripsi", "keterangan", "catatan", "notes", "detail"] },
    { name: "due_date", label: "Jatuh tempo", kind: "date", aliases: ["due", "deadline", "tenggat", "due date", "jatuh tempo"] },
    { name: "assignee_name", label: "Assignee", kind: "choice", choices: "pics", aliases: ["assignee", "penanggung jawab", "owner", "pic"] },
  ],
  editable: ["title", "due_date", "assignee_name"],
  summary: (p, label) => `Task: ${String(p.title ?? "")}${label ? ` — terhubung ke ${label}` : ""}`,
  async apply(tx, actor, p, target) {
    await tx`SELECT pg_advisory_xact_lock(hashtext('kanban_task_no'))`;
    const [{ next }] = await tx`SELECT coalesce(max((regexp_match(task_no,'^TASK-(\\d+)$'))[1]::int),0)+1 AS next FROM kanban_tasks`;
    const [{ position }] = await tx`SELECT coalesce(max(position),-1)+1 AS position FROM kanban_tasks WHERE status_code='todo'`;
    const [task] = await tx`INSERT INTO kanban_tasks (task_no,title,description,priority_code,assignee_name,due_date,status_code,position,created_by_name,created_by_user_id,source_type,source_id,tags)
      VALUES (${"TASK-" + next},${p.title as string},${(p.description as string) ?? null},'medium',${(p.assignee_name as string) ?? null},${(p.due_date as string) ?? null},'todo',${position},${actor.name},${actor.id},${target?.type ?? null},${target?.id ?? null},${["celerates-agent"]})
      RETURNING id, task_no`;
    await log(tx, "tasks", "create", `Task: ${p.title} (${task.task_no})`, actor);
    return { target_type: "task", target_id: task.id, message: `${task.task_no} dibuat` };
  },
  async outcome(tx, r) {
    if (!r.target_id) return "unknown";
    const [task] = await tx`SELECT status_code FROM kanban_tasks WHERE id=${r.target_id}`;
    return !task ? "unknown" : task.status_code === "done" ? "resolved" : "open";
  },
};

const assignTaPic: CommandSpec = {
  kind: "requisition.assign_ta_pic",
  label: "Tetapkan TA PIC",
  module: "ta",
  target: "requisition",
  params: [{ name: "ta_pic_name", label: "TA PIC", kind: "choice", choices: "pics", required: true }],
  editable: ["ta_pic_name"],
  summary: (p, label) => `Tetapkan TA PIC ${p.ta_pic_name ? `"${p.ta_pic_name}"` : "(pilih)"} untuk ${label ?? "requisition"}`,
  async check(tx, _p, target) {
    const [row] = await tx.unsafe(`SELECT ta_pic_name, ${UNASSIGNED} AS unassigned FROM requisitions WHERE id=$1`, [target!.id]);
    if (!row) return { state: "invalid", messages: ["Requisition tidak ditemukan."] };
    if (!row.unassigned) return { state: "invalid", messages: [`Sudah memiliki TA PIC: ${row.ta_pic_name}.`] };
    return null;
  },
  async apply(tx, actor, p, target) {
    const rows = await tx.unsafe(`UPDATE requisitions SET ta_pic_name=$1 WHERE id=$2 AND ${UNASSIGNED} RETURNING requisition_no`, [String(p.ta_pic_name), target!.id]);
    if (!rows.length) throw new CommandConflict("TA PIC sudah terisi oleh perubahan lain; tidak ditimpa.");
    await log(tx, "ta", "update", `Requisition ${rows[0].requisition_no}: TA PIC → ${p.ta_pic_name}`, actor);
    return { target_type: "requisition", target_id: target!.id, message: `TA PIC ${rows[0].requisition_no} = ${p.ta_pic_name}` };
  },
  async outcome(tx, r) {
    if (!r.target_id) return "unknown";
    const [row] = await tx.unsafe(`SELECT ${UNASSIGNED} AS unassigned FROM requisitions WHERE id=$1`, [r.target_id]);
    return !row ? "unknown" : row.unassigned ? "open" : "resolved";
  },
};

const featureRequestCreate: CommandSpec = {
  kind: "feature_request.create",
  label: "Kirim Feature Request",
  module: "general",
  params: [
    { name: "title", label: "Judul", kind: "text", required: true, max: 200 },
    { name: "description", label: "Kendala / kebutuhan", kind: "longtext", required: true, max: 5000 },
    { name: "request_type_code", label: "Jenis masukan", kind: "enum", enum: FR_TYPES, required: true },
    { name: "expected_behavior", label: "Hasil yang diharapkan", kind: "longtext", max: 3000 },
    { name: "context_path", label: "Halaman asal", kind: "text", max: 300 },
  ],
  editable: ["title", "description", "request_type_code", "expected_behavior"],
  summary: (p) => `Feature Request: ${String(p.title ?? "")}`,
  async apply(tx, actor, p) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const requestNo = await uniqueNumber(tx, "feature_requests", "request_no", () => `FR-${ymd}-${String(rand(1, 1000)).padStart(3, "0")}`);
    const context = operationalContext(p.context_path);
    const moduleArea = ["timesheet", "attendance", "school", "automation"].includes(context.module) ? "general" : context.module;
    const [user] = await tx`SELECT email FROM users WHERE id=${actor.id}`;
    const [fr] = await tx`INSERT INTO feature_requests (request_no,title,module_area_code,request_type_code,priority_code,description,expected_behavior,context_path,release_sha,environment,requested_by_user_id,requested_by_name,requested_by_email)
      VALUES (${requestNo},${p.title as string},${moduleArea},${p.request_type_code as string},'medium',${p.description as string},${(p.expected_behavior as string) ?? null},${context.path},${process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RELEASE_SHA || "local"},${process.env.APP_ENV || "erp-pilot"},${actor.id},${actor.name},${user?.email ?? null})
      RETURNING id`;
    await tx`INSERT INTO notifications (user_id,title,body,link) SELECT id,'Feature Request Baru',${`${actor.name} mengajukan request "${p.title}" (${requestNo}) melalui Celerates Agent.`},'/feature-requests' FROM users WHERE is_owner AND status='active'`;
    await log(tx, "feature-requests", "create", `Feature Request: ${p.title} (${requestNo})`, actor);
    return { target_type: "feature_request", target_id: fr.id, message: `${requestNo} dibuat` };
  },
  async outcome(tx, r) {
    if (!r.target_id) return "unknown";
    const [fr] = await tx`SELECT status_code FROM feature_requests WHERE id=${r.target_id}`;
    return !fr ? "unknown" : ["done", "rejected"].includes(fr.status_code) ? "resolved" : "open";
  },
};

const requisitionCreate: CommandSpec = {
  kind: "requisition.create",
  label: "Buat Requisition",
  module: "ta",
  params: [
    { name: "client_name", label: "Client", kind: "text", required: true, max: 200, aliases: ["client", "klien", "customer", "perusahaan", "company", "nama client", "nama klien"] },
    { name: "position_name", label: "Posisi", kind: "text", required: true, max: 200, aliases: ["position", "posisi", "role", "jabatan", "job title", "title"] },
    { name: "headcount_target", label: "Headcount", kind: "int", max: 500, aliases: ["headcount", "hc", "jumlah", "qty", "quantity", "kebutuhan", "jumlah kebutuhan", "manpower", "total"] },
    { name: "level_code", label: "Level", kind: "enum", enum: LEVELS, aliases: ["level", "grade", "seniority", "jenjang"] },
    { name: "service_type_code", label: "Jenis layanan", kind: "enum", enum: SERVICE_TYPES, aliases: ["service", "service type", "layanan", "jenis layanan"] },
    { name: "priority_code", label: "Prioritas", kind: "enum", enum: PRIORITIES, aliases: ["priority", "prioritas"] },
    { name: "estimated_duration_months", label: "Durasi (bulan)", kind: "int", max: 120, aliases: ["duration", "durasi", "bulan", "months", "kontrak (bulan)"] },
    { name: "opty_request_date", label: "Tanggal request", kind: "date", aliases: ["date", "tanggal", "request date", "tanggal request", "start"] },
    { name: "ta_pic_name", label: "TA PIC", kind: "choice", choices: "pics", aliases: ["ta pic", "pic ta", "recruiter", "pic"] },
    { name: "sales_pic_name", label: "Sales PIC", kind: "text", max: 100, aliases: ["sales pic", "pic sales", "sales", "account manager"] },
  ],
  editable: ["ta_pic_name", "headcount_target"],
  summary: (p) => `Requisition: ${p.client_name ?? "?"} — ${p.position_name ?? "?"} (${p.headcount_target ?? 1} orang)`,
  async check(tx, p) {
    if (!p.client_name || !p.position_name) return null;
    const [dup] = await tx`SELECT requisition_no FROM requisitions WHERE lower(trim(client_name))=lower(trim(${p.client_name as string})) AND lower(trim(position_name))=lower(trim(${p.position_name as string})) AND created_at > now() - interval '180 days' LIMIT 1`;
    return dup ? { state: "warning", messages: [`Kemungkinan duplikat dengan ${dup.requisition_no} (client dan posisi sama, 180 hari terakhir).`] } : null;
  },
  async apply(tx, actor, p) {
    // Mirrors app/ta/actions.ts createRequisition: a direct TA requisition also gets a minimal tracker + PQ.
    const year = new Date().getFullYear();
    const optyNo = await uniqueNumber(tx, "sales_opportunity_trackers", "opty_no", () => `OPTY${year}-${rand(100, 1000)}`);
    const requisitionNo = await uniqueNumber(tx, "requisitions", "requisition_no", () => `REQ-${year}-${rand(1000, 10000)}`);
    const headcount = (p.headcount_target as number) ?? 1;
    const date = (p.opty_request_date as string) ?? new Date().toISOString().slice(0, 10);
    const [tracker] = await tx`INSERT INTO sales_opportunity_trackers (opty_no,client_name,position_name,service_type_code,level_code,headcount_target,estimated_duration_months,sales_pic_name)
      VALUES (${optyNo},${p.client_name as string},${p.position_name as string},${(p.service_type_code as string) ?? null},${(p.level_code as string) ?? null},${headcount},${(p.estimated_duration_months as number) ?? null},${(p.sales_pic_name as string) || "-"}) RETURNING id`;
    await tx`INSERT INTO opportunities (opty_no,opty_request_date,client_name,project_name,position_name,service_type_code,level_code,headcount_target,priority_code,estimated_duration_months,sales_pic_name,pipeline_stage_code,opportunity_tracker_id)
      VALUES (${optyNo},${date},${p.client_name as string},${p.position_name as string},${p.position_name as string},${(p.service_type_code as string) || "outsourcing"},${(p.level_code as string) ?? null},${headcount},${(p.priority_code as string) || "p2"},${(p.estimated_duration_months as number) ?? null},${(p.sales_pic_name as string) || "-"},'on_going',${tracker.id})`;
    const [req] = await tx`INSERT INTO requisitions (requisition_no,opportunity_id,client_name,position_name,service_type_code,level_code,headcount_target,priority_code,estimated_duration_months,opty_request_date,ta_pic_name,sales_pic_name)
      VALUES (${requisitionNo},${tracker.id},${p.client_name as string},${p.position_name as string},${(p.service_type_code as string) ?? null},${(p.level_code as string) ?? null},${headcount},${(p.priority_code as string) || "p2"},${(p.estimated_duration_months as number) ?? null},${date},${(p.ta_pic_name as string) ?? ""},${(p.sales_pic_name as string) ?? null})
      RETURNING id`;
    await log(tx, "ta", "create", `Requisition: ${p.client_name} — ${p.position_name} (${requisitionNo})`, actor);
    return { target_type: "requisition", target_id: req.id, message: `${requisitionNo} dibuat` };
  },
  async outcome(tx, r) {
    if (!r.target_id) return "unknown";
    const [row] = await tx`SELECT 1 FROM requisitions WHERE id=${r.target_id}`;
    return row ? "resolved" : "unknown";
  },
};

const LEAD_SOURCES = [["linkedin", "LinkedIn"], ["ads", "Ads"], ["referral", "Referral"], ["existing", "Existing"], ["website", "Website"]] as const;
const LEAD_SERVICES = [...SERVICE_TYPES, ["corporate_training", "Corporate Training"], ["software_development", "Software Development"]] as const;
const LEAD_CATEGORIES = [["it", "IT"], ["non_it", "Non IT"]] as const;

const leadCreate: CommandSpec = {
  kind: "lead.create",
  label: "Buat Lead",
  module: "marketing",
  params: [
    { name: "client_name", label: "Client", kind: "text", required: true, max: 200, aliases: ["client", "klien", "company", "perusahaan", "nama perusahaan", "account", "prospek", "prospect"] },
    { name: "contact_name", label: "Kontak", kind: "text", required: true, max: 120, aliases: ["contact", "kontak", "nama kontak", "pic client", "contact person", "cp"] },
    { name: "contact_email", label: "Email kontak", kind: "text", max: 200, aliases: ["email", "e-mail", "email kontak"] },
    { name: "contact_phone", label: "Telepon kontak", kind: "text", max: 40, aliases: ["phone", "telepon", "hp", "no hp", "whatsapp", "wa"] },
    { name: "service_type_code", label: "Jenis layanan", kind: "enum", enum: LEAD_SERVICES, required: true, aliases: ["service", "service type", "layanan", "jenis layanan", "kebutuhan"] },
    { name: "lead_source_code", label: "Sumber lead", kind: "enum", enum: LEAD_SOURCES, required: true, aliases: ["source", "sumber", "lead source", "sumber lead", "channel"] },
    { name: "category_code", label: "Kategori", kind: "enum", enum: LEAD_CATEGORIES, required: true, aliases: ["category", "kategori"] },
    { name: "industry_code", label: "Industri", kind: "text", max: 100, aliases: ["industry", "industri", "sektor", "sector"] },
    { name: "company_size", label: "Ukuran perusahaan", kind: "int", max: 1000000, aliases: ["company size", "ukuran", "jumlah karyawan", "employees"] },
    { name: "position_name", label: "Posisi", kind: "text", max: 200, aliases: ["position", "posisi", "role", "jabatan"] },
    { name: "headcount_target", label: "Headcount", kind: "int", max: 500, aliases: ["headcount", "hc", "jumlah", "qty"] },
    { name: "sales_pic_name", label: "Sales PIC", kind: "text", max: 100, aliases: ["sales pic", "pic sales", "sales", "account manager", "am"] },
    { name: "notes", label: "Catatan", kind: "longtext", max: 3000, aliases: ["notes", "catatan", "keterangan", "remarks"] },
  ],
  editable: ["contact_name", "service_type_code", "lead_source_code", "category_code", "sales_pic_name"],
  summary: (p) => `Lead: ${p.client_name ?? "?"}${p.contact_name ? ` — ${p.contact_name}` : ""}`,
  async check(tx, p) {
    if (!p.client_name) return null;
    const [dup] = await tx.unsafe<{ lead_no: string }[]>(
      `SELECT lead_no FROM leads WHERE ${nameKey("client_name")} = ${nameKey("$1")} AND created_at > now() - interval '180 days' LIMIT 1`,
      [String(p.client_name)],
    );
    return dup ? { state: "warning", messages: [`Kemungkinan duplikat dengan lead ${dup.lead_no} (client sama, 180 hari terakhir).`] } : null;
  },
  async apply(tx, actor, p) {
    // Mirrors app/marketing/actions.ts createLead (lead number format, defaults) with Agent attribution.
    const client = String(p.client_name);
    const slug = client.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "CLIENT";
    const source = String(p.lead_source_code).toUpperCase().slice(0, 4);
    const leadNo = await uniqueNumber(tx, "leads", "lead_no", () => `${slug}-${source}-${new Date().getFullYear()}-${String(rand(1, 1000)).padStart(3, "0")}`);
    const [lead] = await tx`INSERT INTO leads (lead_no,client_name,contact_name,contact_email,contact_phone,company_size,industry_code,service_type_code,lead_source_code,category_code,sales_pic_name,notes,price_period_code,position_name,headcount_target)
      VALUES (${leadNo},${client},${p.contact_name as string},${(p.contact_email as string) ?? null},${(p.contact_phone as string) ?? null},${(p.company_size as number) ?? null},${(p.industry_code as string) ?? null},${p.service_type_code as string},${p.lead_source_code as string},${p.category_code as string},${(p.sales_pic_name as string) || "-"},${(p.notes as string) ?? null},'monthly',${(p.position_name as string) ?? null},${(p.headcount_target as number) ?? null})
      RETURNING id`;
    await log(tx, "marketing", "create", `Lead: ${client} (${leadNo})`, actor);
    return { target_type: "lead", target_id: lead.id, message: `${leadNo} dibuat` };
  },
  async outcome(tx, r) {
    if (!r.target_id) return "unknown";
    const [row] = await tx`SELECT is_qualified FROM leads WHERE id=${r.target_id}`;
    return !row ? "unknown" : row.is_qualified === null ? "open" : "resolved";
  },
};

export class CommandConflict extends Error {}

export const COMMANDS: ReadonlyMap<string, CommandSpec> = new Map([taskCreate, assignTaPic, featureRequestCreate, requisitionCreate, leadCreate].map((c) => [c.kind, c]));

export async function choices(tx: Tx): Promise<Record<string, string[]>> {
  const pics = await tx`SELECT name FROM pics ORDER BY name LIMIT 500`;
  return { pics: pics.map((p) => p.name as string) };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
function coerce(spec: ParamSpec, raw: unknown, refs: Record<string, string[]>): { value?: unknown; error?: string } {
  if (raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")) return {};
  switch (spec.kind) {
    case "text":
    case "longtext": {
      const text = String(raw).trim();
      return text.length > (spec.max ?? 2000) ? { error: `${spec.label} melebihi ${spec.max} karakter.` } : { value: text };
    }
    case "int": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[^\d.-]/g, ""));
      if (!Number.isInteger(n) || n < 1 || n > (spec.max ?? 100000)) return { error: `${spec.label} harus bilangan bulat 1–${spec.max}.` };
      return { value: n };
    }
    case "date": {
      const text = String(raw).trim().slice(0, 10);
      if (!ISO_DATE.test(text) || Number.isNaN(Date.parse(text))) return { error: `${spec.label} harus tanggal YYYY-MM-DD.` };
      return { value: text };
    }
    case "enum": {
      const text = String(raw).trim().toLowerCase();
      const hit = spec.enum!.find(([code, label]) => code === text || label.toLowerCase() === text || code.replace(/_/g, " ") === text);
      return hit ? { value: hit[0] } : { error: `${spec.label} "${raw}" tidak dikenal.` };
    }
    case "choice": {
      const text = String(raw).trim();
      const hit = (refs[spec.choices!] ?? []).find((c) => c.toLowerCase() === text.toLowerCase());
      return hit ? { value: hit } : { error: `${spec.label} "${raw}" tidak ada di daftar PIC ERP.` };
    }
  }
}

export type NormalizedItem = {
  index: number;
  kind: string;
  target: Target;
  target_label: string | null;
  params: Record<string, unknown>;
  summary: string;
  editable: string[];
  validation: Validation;
};

/** Validate one proposed item for this actor. Never throws for business problems: they become `validation`. */
export async function validateItem(tx: Tx, actor: Actor, index: number, input: unknown, refs: Record<string, string[]>): Promise<NormalizedItem> {
  const raw = (input && typeof input === "object" ? input : {}) as { kind?: unknown; target?: unknown; params?: unknown };
  const spec = COMMANDS.get(String(raw.kind));
  const base = { index, kind: String(raw.kind ?? ""), target: null as Target, target_label: null as string | null, params: {} as Record<string, unknown>, summary: "", editable: [] as string[] };
  if (!spec) return { ...base, summary: "Perintah tidak dikenal", validation: { state: "invalid", messages: ["Perintah tidak ada dalam daftar yang diizinkan."] } };
  if (!canWriteModule(actor, spec.module)) return { ...base, summary: spec.label, validation: { state: "invalid", messages: ["Anda tidak memiliki hak ubah untuk modul ini."] } };
  const messages: string[] = [];
  let state = "ok" as Validation["state"];
  let target: Target = null;
  let targetLabel: string | null = null;
  const t = raw.target as { type?: unknown; id?: unknown } | null | undefined;
  if (t && typeof t === "object") {
    const def = catalogEntity(String(t.type));
    const id = String(t.id ?? "");
    if (!def || !/^[0-9a-f-]{36}$/i.test(id) || (spec.target && spec.target !== def.type)) return { ...base, summary: spec.label, validation: { state: "invalid", messages: ["Target tidak valid."] } };
    if (!canReadEntityModule(actor, def.module)) return { ...base, summary: spec.label, validation: { state: "invalid", messages: ["Target di luar akses Anda."] } };
    const [row] = await tx.unsafe<{ label: string }[]>(`SELECT ${def.display} AS label FROM ${def.table} ${def.alias} WHERE ${def.alias}.id=$1::uuid`, [id]);
    if (!row) return { ...base, summary: spec.label, validation: { state: "invalid", messages: ["Target tidak ditemukan."] } };
    target = { type: def.type, id: id.toLowerCase() };
    targetLabel = row.label;
  } else if (spec.target) return { ...base, summary: spec.label, validation: { state: "invalid", messages: ["Perintah ini membutuhkan target."] } };
  const given = (raw.params && typeof raw.params === "object" ? raw.params : {}) as Record<string, unknown>;
  const params: Record<string, unknown> = {};
  for (const key of Object.keys(given)) if (!spec.params.some((p) => p.name === key)) messages.push(`Kolom "${key}" diabaikan.`);
  for (const p of spec.params) {
    const { value, error } = coerce(p, given[p.name], refs);
    if (error) {
      messages.push(error);
      state = spec.editable.includes(p.name) && state !== "invalid" ? "needs_input" : "invalid";
    } else if (value === undefined && p.required) {
      messages.push(`${p.label} wajib diisi.`);
      state = spec.editable.includes(p.name) && state !== "invalid" ? "needs_input" : "invalid";
    } else if (value !== undefined) params[p.name] = value;
  }
  if (state !== "invalid" && spec.check) {
    const extra = await spec.check(tx, params, target);
    if (extra) {
      messages.push(...extra.messages);
      if (extra.state === "invalid") state = "invalid";
      else if (extra.state === "warning" && state === "ok") state = "warning";
    }
  }
  if (messages.some((m) => m.endsWith("diabaikan.")) && state === "ok") state = "warning";
  return { index, kind: spec.kind, target, target_label: targetLabel, params, summary: spec.summary(params, targetLabel), editable: spec.editable, validation: { state, messages } };
}

export function publicCommands() {
  return [...COMMANDS.values()].map((c) => ({
    kind: c.kind,
    label: c.label,
    module: c.module,
    target: c.target ?? null,
    editable: c.editable,
    params: c.params.map(({ name, label, kind, required, max, enum: values, aliases, choices }) => ({
      name,
      label,
      kind,
      required: Boolean(required),
      max: max ?? null,
      enum: values ? values.map(([code, text]) => ({ code, label: text })) : null,
      aliases: aliases ?? [],
      choices: choices ?? null,
    })),
  }));
}

