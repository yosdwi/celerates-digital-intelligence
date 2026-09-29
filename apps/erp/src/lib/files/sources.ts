// Company Files (doc 17, ADR-018): what ERP declares about its own files, and ERP's decisions about who may read them.
// ERP owns these files (attachments and legacy file columns); Intelligence indexes them. ERP is the authority for
// which files are indexable, which access class they carry, and whether a given user may read them.
// Identity documents (KTP, NPWP, KK, BPJS, selfies, signatures, …) are never declared here, so they never leave ERP.
import type { Sql } from "postgres";
import { canReadModule, MODULES, type Module, type OperationalActor } from "@/lib/operations/policy";
import { canReadEntityModule } from "@/lib/agent/reads";
import { objectUrl, validateObjectPath } from "@/lib/object-store";

export type AccessClass = "general" | "division" | "commercial" | "personal";
export const CLASS_RANK: Record<AccessClass, number> = { general: 0, division: 1, commercial: 2, personal: 3 };
const LEVELS = ["viewer", "editor", "full"];

/** Kinds a user may choose for an upload to Company Files, with the default (minimum) access class. */
export const FILE_KINDS: { kind: string; label: string; access_class: AccessClass }[] = [
  { kind: "sop", label: "SOP / prosedur", access_class: "general" },
  { kind: "policy", label: "Kebijakan", access_class: "general" },
  { kind: "template", label: "Template", access_class: "general" },
  { kind: "admin", label: "Dokumen administratif", access_class: "general" },
  { kind: "proposal", label: "Proposal", access_class: "division" },
  { kind: "manpower", label: "Manpower planning", access_class: "division" },
  { kind: "report", label: "Laporan", access_class: "division" },
  { kind: "contract", label: "Kontrak / PKS", access_class: "commercial" },
  { kind: "po", label: "Purchase Order", access_class: "commercial" },
  { kind: "bast", label: "BAST", access_class: "commercial" },
  { kind: "invoice", label: "Invoice", access_class: "commercial" },
  { kind: "cv", label: "CV", access_class: "personal" },
  { kind: "appraisal", label: "Penilaian kinerja", access_class: "personal" },
  { kind: "other", label: "Lainnya", access_class: "division" },
];

type LinkType = { table: string; alias: string; join?: string; label: string; href: (id: string) => string; module: Module };
/** Records ERP files hang off. Labels are ERP's own display; SQL identifiers are code-owned constants. */
export const LINK_TYPES: Record<string, LinkType> = {
  candidate: { table: "candidates", alias: "c", label: "coalesce(c.candidate_no,'') || ' · ' || coalesce(c.candidate_name,'')", href: (id) => `/ta/candidates/${id}/edit`, module: "ta" },
  application: { table: "applications", alias: "a", join: "LEFT JOIN candidates c ON c.id=a.candidate_id", label: "'Pipeline · ' || coalesce(c.candidate_name,'')", href: (id) => `/ta/pipeline/${id}/edit`, module: "ta" },
  opportunity: { table: "opportunities", alias: "o", label: "coalesce(o.opty_no,'') || ' · ' || coalesce(o.client_name,'')", href: (id) => `/sales/${id}/edit`, module: "sales" },
  project_document: { table: "project_documents", alias: "pd", join: "LEFT JOIN opportunities o ON o.id=pd.opportunity_id", label: "'Dokumen proyek · ' || coalesce(o.client_name,'') || coalesce(' · ' || o.project_name,'')", href: (id) => `/pmo/${id}/edit`, module: "pmo" },
  invoice: { table: "project_invoices", alias: "pi", join: "LEFT JOIN opportunities o ON o.id=pi.opportunity_id", label: "'Invoice · ' || coalesce(o.client_name,'') || coalesce(' · ' || to_char(pi.services_month_start,'YYYY-MM'),'')", href: (id) => `/pmo/invoices/${id}/edit`, module: "pmo" },
};

type Source = { kind: string; access_class: AccessClass; module: Module; link: keyof typeof LINK_TYPES };
/** `attachments.source_type` values ERP offers for indexing. Anything not listed (onboarding identity documents,
 * selfies, signatures, timesheets, LMS media, task/feature-request attachments) is not a Company File. */
export const ATTACHMENT_SOURCES: Record<string, Source> = {
  candidate_cv_asli: { kind: "cv", access_class: "personal", module: "ta", link: "candidate" },
  application_cv_celerates: { kind: "cv", access_class: "personal", module: "ta", link: "application" },
  opportunity_po_doc: { kind: "po", access_class: "commercial", module: "sales", link: "opportunity" },
  opportunity_pq_doc: { kind: "proposal", access_class: "commercial", module: "sales", link: "opportunity" },
  project_doc_pks: { kind: "contract", access_class: "commercial", module: "pmo", link: "project_document" },
  project_doc_po: { kind: "po", access_class: "commercial", module: "pmo", link: "project_document" },
  project_doc_cr: { kind: "contract", access_class: "commercial", module: "pmo", link: "project_document" },
  project_doc_other: { kind: "other", access_class: "commercial", module: "pmo", link: "project_document" },
  invoice_bast_doc: { kind: "bast", access_class: "commercial", module: "pmo", link: "invoice" },
};
/** Legacy single file columns: each holds an object key in `candidate-documents`, or a pasted URL. */
export const COLUMN_SOURCES: Record<string, Source & { table: string; column: string; name: string }> = {
  "candidates.cv_asli_url": { table: "candidates", column: "cv_asli_url", name: "CV asli", kind: "cv", access_class: "personal", module: "ta", link: "candidate" },
  "applications.cv_asli_url": { table: "applications", column: "cv_asli_url", name: "CV asli", kind: "cv", access_class: "personal", module: "ta", link: "application" },
  "applications.cv_celerates_url": { table: "applications", column: "cv_celerates_url", name: "CV Celerates", kind: "cv", access_class: "personal", module: "ta", link: "application" },
  "opportunities.po_doc_url": { table: "opportunities", column: "po_doc_url", name: "Dokumen PO", kind: "po", access_class: "commercial", module: "sales", link: "opportunity" },
  "project_documents.pks_url": { table: "project_documents", column: "pks_url", name: "PKS", kind: "contract", access_class: "commercial", module: "pmo", link: "project_document" },
  "project_documents.po_url": { table: "project_documents", column: "po_url", name: "PO", kind: "po", access_class: "commercial", module: "pmo", link: "project_document" },
  "project_documents.cr_url": { table: "project_documents", column: "cr_url", name: "Change Request", kind: "contract", access_class: "commercial", module: "pmo", link: "project_document" },
  "project_documents.other_doc_url": { table: "project_documents", column: "other_doc_url", name: "Dokumen lain", kind: "other", access_class: "commercial", module: "pmo", link: "project_document" },
  "project_invoices.bast_support_doc_url": { table: "project_invoices", column: "bast_support_doc_url", name: "BAST", kind: "bast", access_class: "commercial", module: "pmo", link: "invoice" },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUCKET = "candidate-documents";
export type FileRef = { ref: string; source: Source; value: string; name: string; entityId: string; createdAt: Date | null };

export type ClassSettings = Record<AccessClass, { model_visibility: "none" | "excerpt" | "full"; indexing: "none" | "lexical" | "semantic"; retention_days: number }>;
export async function classSettings(sql: Sql): Promise<ClassSettings> {
  const rows = await sql`SELECT access_class, model_visibility, indexing, retention_days FROM file_class_settings`;
  return Object.fromEntries(rows.map((r) => [r.access_class, { model_visibility: r.model_visibility, indexing: r.indexing, retention_days: r.retention_days }])) as ClassSettings;
}

/** What a user may see, by class: ERP-side policy (`file_class_grants`, Owner-editable) over the user's current access. */
export async function fileAccess(sql: Sql, actor: OperationalActor & { id: string }) {
  const grants = await sql`SELECT access_class, division_key, min_level FROM file_class_grants`;
  const levelOf = (division: string) => (actor.access ?? []).find((a) => a.divisionKey === division)?.level;
  const qualifies = (cls: "commercial" | "personal") =>
    grants
      .filter((g) => g.access_class === cls)
      .filter((g) => actor.isOwner === true || (actor.accountType === "backoffice" && LEVELS.indexOf(levelOf(g.division_key) ?? "") >= LEVELS.indexOf(g.min_level)))
      .map((g) => g.division_key as string);
  const readable = (Object.keys(MODULES) as Module[]).filter((m) => m !== "general" && canReadModule(actor, m));
  return {
    owner: actor.isOwner === true,
    general: canReadEntityModule(actor, "general"),
    divisions: readable,
    commercial: qualifies("commercial"),
    personal: qualifies("personal"),
    settings: await classSettings(sql),
  };
}

export function classGrant(access: Awaited<ReturnType<typeof fileAccess>>, cls: AccessClass, division: string | null): boolean {
  if (access.owner) return true;
  if (cls === "general") return access.general;
  if (!division) return false;
  if (cls === "division") return access.divisions.includes(division as Module);
  return (cls === "commercial" ? access.commercial : access.personal).includes(division);
}

/** Resolve a file ref to its current ERP row. null when it no longer exists or is not a declared Company File. */
export async function resolveRef(sql: Sql, ref: string): Promise<FileRef | null> {
  const [type, rest] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (type === "attachment" && UUID.test(rest)) {
    const [row] = await sql`SELECT id, source_type, source_id::text AS source_id, kind, file_name, file_path, link_url, created_at FROM attachments WHERE id=${rest}`;
    const source = row && ATTACHMENT_SOURCES[row.source_type];
    if (!source) return null;
    return { ref, source, value: row.kind === "link" ? row.link_url : row.file_path, name: row.file_name, entityId: row.source_id, createdAt: row.created_at };
  }
  if (type === "column") {
    const at = rest.lastIndexOf(":");
    const key = rest.slice(0, at);
    const id = rest.slice(at + 1);
    const source = COLUMN_SOURCES[key];
    if (!source || !UUID.test(id)) return null;
    const [row] = await sql.unsafe(`SELECT ${source.column} AS value, created_at FROM ${source.table} WHERE id=$1`, [id]);
    if (!row?.value) return null;
    return { ref, source, value: row.value, name: source.name, entityId: id, createdAt: row.created_at };
  }
  return null;
}

const isUrl = (value: string) => /^https?:\/\//i.test(value);
function isKey(value: string) {
  try {
    validateObjectPath(value);
    return !isUrl(value);
  } catch {
    return false;
  }
}

/** Machine feed for the indexer: every declared file ERP currently holds, ordered by ref (full-snapshot paging;
 * refs absent from a complete pass were deleted). Content never travels in the feed. */
export async function fileFeed(sql: Sql, after: string, limit: number) {
  const parts: string[] = [];
  const types = Object.keys(ATTACHMENT_SOURCES);
  parts.push(
    `SELECT 'attachment:' || a.id AS ref, a.source_type AS key, a.source_id::text AS entity_id, a.kind AS storage, a.file_name AS name,
            coalesce(a.file_path, a.link_url) AS value, a.created_at FROM attachments a
      WHERE a.source_type = ANY($3::text[]) AND coalesce(a.file_path, a.link_url) IS NOT NULL`,
  );
  for (const [key, s] of Object.entries(COLUMN_SOURCES))
    parts.push(
      `SELECT 'column:${key}:' || t.id AS ref, '${key}' AS key, t.id::text AS entity_id, 'column' AS storage, '${s.name}' AS name,
              t.${s.column} AS value, t.created_at FROM ${s.table} t WHERE coalesce(t.${s.column},'') <> ''`,
    );
  const rows = await sql.unsafe(
    `SELECT * FROM (${parts.join(" UNION ALL ")}) f WHERE f.ref > $1 ORDER BY f.ref LIMIT $2`,
    [after, limit, types],
  );
  const labels = await entityLabels(
    sql,
    rows.map((r) => ({ type: sourceOf(r.key).link, id: r.entity_id as string })),
  );
  const items = rows
    .map((r) => {
      const source = sourceOf(r.key);
      const value = String(r.value);
      const external = isUrl(value);
      if (!external && !isKey(value)) return null;
      const entity = { type: source.link, id: r.entity_id as string, label: labels.get(`${source.link}:${r.entity_id}`) ?? null, href: LINK_TYPES[source.link].href(r.entity_id) };
      return {
        ref: r.ref as string,
        origin: external ? "external" : "erp",
        kind: source.kind,
        access_class: source.access_class,
        owner_division: source.module,
        // Column labels ("BAST") get the stored object's extension so the indexer can read the right format.
        name: (r.storage === "column" && !external ? `${r.name}${(value.match(/\.[a-z0-9]{2,5}$/i) ?? [""])[0]}` : String(r.name)).slice(0, 200),
        // An object key is immutable once written (keys carry a UUID), so the key itself versions the content.
        etag: value,
        url: external ? value : null,
        open_url: external ? value : objectUrl(BUCKET, value),
        entity,
        created_at: r.created_at,
      };
    })
    .filter(Boolean);
  return { items, next: rows.length === limit ? rows[rows.length - 1].ref : null };
}
const sourceOf = (key: string): Source => ATTACHMENT_SOURCES[key] ?? COLUMN_SOURCES[key];

async function entityLabels(sql: Sql, items: { type: string; id: string }[]) {
  const out = new Map<string, string>();
  const byType = new Map<string, string[]>();
  for (const i of items) if (UUID.test(i.id)) byType.set(i.type, [...(byType.get(i.type) ?? []), i.id]);
  for (const [type, ids] of byType) {
    const t = LINK_TYPES[type];
    if (!t) continue;
    const rows = await sql.unsafe(`SELECT ${t.alias}.id::text AS id, ${t.label} AS label FROM ${t.table} ${t.alias} ${t.join ?? ""} WHERE ${t.alias}.id::text = ANY($1::text[])`, [[...new Set(ids)]]);
    for (const r of rows) out.set(`${type}:${r.id}`, String(r.label).slice(0, 200));
  }
  return out;
}

/** Bytes of one declared ERP file, for the indexer (machine) or for the user's own open/preview. */
export async function fileObject(sql: Sql, ref: string): Promise<{ bucket: string; path: string; name: string; source: Source } | null> {
  const file = await resolveRef(sql, ref);
  if (!file || isUrl(file.value) || !isKey(file.value)) return null;
  return { bucket: BUCKET, path: file.value, name: file.name, source: file.source };
}

/** Which of these files and records the user may read now. ERP decides; Intelligence only asks. */
export async function readable(
  sql: Sql,
  actor: OperationalActor & { id: string },
  refs: string[],
  entities: { type: string; id: string }[],
) {
  const access = await fileAccess(sql, actor);
  const okRefs: string[] = [];
  for (const ref of refs.slice(0, 100)) {
    const file = await resolveRef(sql, ref);
    if (file && canReadModule(actor, file.source.module) && classGrant(access, file.source.access_class, file.source.module)) okRefs.push(ref);
  }
  const okEntities: string[] = [];
  const { entity: catalogEntity } = await import("@/lib/agent/catalog");
  for (const e of entities.slice(0, 100)) {
    const module = LINK_TYPES[e.type]?.module ?? catalogEntity(e.type)?.module;
    if (module && UUID.test(e.id) && canReadEntityModule(actor, module)) okEntities.push(`${e.type}:${e.id}`);
  }
  return { refs: okRefs, entities: okEntities };
}

/** `/api/documents`: the module of the record an object key belongs to, or null when no declared row references it. */
export async function objectModule(sql: Sql, bucket: string, path: string): Promise<Module | null> {
  if (bucket === "automation-documents") {
    const [hit] = await sql`SELECT 1 FROM automation_document_templates WHERE storage_path=${path} UNION ALL SELECT 1 FROM automation_generated_documents WHERE storage_path=${path} LIMIT 1`;
    return hit ? "automation" : null;
  }
  const [attachment] = await sql`SELECT source_type FROM attachments WHERE file_path=${path} LIMIT 1`;
  if (attachment) {
    const declared = ATTACHMENT_SOURCES[attachment.source_type];
    if (declared) return declared.module;
    const prefix = String(attachment.source_type).split("_")[0];
    return ({ onboarding: "ta", signature: "general", extension: "tm", kanban: "general", timesheet: "timesheet", school: "school", time: "attendance", feature: "general", opportunity: "sales", project: "pmo", invoice: "pmo", candidate: "ta", application: "ta" } as Record<string, Module>)[prefix] ?? "general";
  }
  for (const s of Object.values(COLUMN_SOURCES)) {
    const [hit] = await sql.unsafe(`SELECT 1 FROM ${s.table} WHERE ${s.column}=$1 LIMIT 1`, [path]);
    if (hit) return s.module;
  }
  return null;
}
