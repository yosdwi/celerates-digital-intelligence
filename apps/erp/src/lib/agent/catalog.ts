// ADR-009: ERP Entity Catalog v1. The single declaration of what the Agent may know about ERP records.
// Every identifier and SQL fragment here is code-owned. Request values are only ever bound parameters.
// Sensitivity: internal = returned; commercial = presence only; pii / restricted = withheld (name listed).
// Fields that are not declared (salary, religion, tax, bank, documents, credentials, …) are never read.
import type { Module } from "@/lib/operations/policy";

export type Sensitivity = "internal" | "commercial" | "pii" | "restricted";
export type FieldKind = "text" | "bool" | "date" | "number";
export type CatalogField = { name: string; label: string; sensitivity: Sensitivity; kind?: FieldKind };
export type CatalogEdge = {
  name: string;
  label: string;
  target: EntityType;
  kind: "fk" | "name_match";
  // Returns ids of the target entity for source record $1. Code-owned.
  sql: string;
};
export type CatalogEntity = {
  type: EntityType;
  label: string;
  module: Module;
  table: string;
  alias: string;
  display: string; // SQL expression over alias
  version?: string; // column that increments on update, if any
  fields: CatalogField[];
  search: string[]; // internal text fields only
  routes: string[]; // "/segment/{id}/edit"
  listHref: string;
  edges: CatalogEdge[];
};
export type EntityType =
  | "lead"
  | "sales_opportunity"
  | "commercial_pq"
  | "requisition"
  | "crm_client"
  | "employee"
  | "task"
  | "feature_request";

const f = (name: string, label: string, sensitivity: Sensitivity = "internal", kind: FieldKind = "text"): CatalogField => ({
  name,
  label,
  sensitivity,
  kind,
});
/** Legal forms ignored when names are compared or searched ("PT Astra Tbk" ~ "astra"). */
export const LEGAL_FORMS = ["pt", "tbk", "cv", "persero", "ud", "ltd", "inc", "corp", "co", "llc", "plc", "gmbh", "bv"];
/** SQL key for comparing organisation names: lower-case, legal forms and punctuation/spaces removed. */
export const nameKey = (expr: string) => `regexp_replace(lower(${expr}), '\\m(${LEGAL_FORMS.join("|")})\\M|[^a-z0-9]+', '', 'g')`;
const byName = (target: EntityType, table: string, column: string, label: string, name: string): CatalogEdge => ({
  name,
  label,
  target,
  kind: "name_match",
  sql: `SELECT t.id FROM ${table} t, (SELECT ${nameKey("%NAME%")} AS n FROM %SELF%) s WHERE s.n <> '' AND ${nameKey(`t.${column}`)}=s.n`,
});

const ENTITIES: CatalogEntity[] = [
  {
    type: "lead",
    label: "Lead",
    module: "marketing",
    table: "leads",
    alias: "l",
    display: "l.lead_no || ' · ' || l.client_name",
    fields: [
      f("lead_no", "No. Lead"),
      f("client_name", "Client"),
      f("project_name", "Proyek"),
      f("service_type_code", "Jenis layanan"),
      f("lead_source_code", "Sumber lead"),
      f("category_code", "Kategori"),
      f("industry_code", "Industri"),
      f("company_size", "Ukuran perusahaan", "internal", "number"),
      f("position_name", "Posisi"),
      f("level_code", "Level"),
      f("headcount_target", "Target headcount", "internal", "number"),
      f("estimated_duration_months", "Estimasi durasi (bulan)", "internal", "number"),
      f("sales_pic_name", "Sales PIC"),
      f("is_qualified", "Qualified", "internal", "bool"),
      f("disqualify_reason", "Alasan diskualifikasi"),
      f("created_at", "Dibuat", "internal", "date"),
      f("price_amount", "Harga", "commercial"),
      f("contact_name", "Nama kontak", "pii"),
      f("contact_email", "Email kontak", "pii"),
      f("contact_phone", "Telepon kontak", "pii"),
      f("notes", "Catatan (teks bebas)", "pii"),
    ],
    search: ["lead_no", "client_name", "project_name"],
    routes: ["/marketing/{id}/edit"],
    listHref: "/marketing",
    edges: [
      { name: "trackers", label: "Opportunity Tracker", target: "sales_opportunity", kind: "fk", sql: "SELECT id FROM sales_opportunity_trackers WHERE lead_id=$1" },
      { name: "pqs", label: "PQ komersial", target: "commercial_pq", kind: "fk", sql: "SELECT id FROM opportunities WHERE lead_id=$1" },
      byName("crm_client", "crm_clients", "name", "Akun CRM", "account"),
    ],
  },
  {
    type: "sales_opportunity",
    label: "Opportunity",
    module: "sales",
    table: "sales_opportunity_trackers",
    alias: "s",
    display: "s.opty_no || ' · ' || s.client_name",
    version: "intelligence_version",
    fields: [
      f("opty_no", "No. Opportunity"),
      f("client_name", "Client"),
      f("client_type_code", "Tipe client"),
      f("service_type_code", "Jenis layanan"),
      f("sales_qualified", "Sales Qualified", "internal", "bool"),
      f("opty_status_code", "Status"),
      f("requirement_summary", "Ringkasan kebutuhan"),
      f("detail_requirement", "Detail kebutuhan"),
      f("position_name", "Posisi"),
      f("level_code", "Level"),
      f("headcount_target", "Target headcount", "internal", "number"),
      f("estimated_duration_months", "Estimasi durasi (bulan)", "internal", "number"),
      f("sales_pic_name", "Sales PIC"),
      f("last_communication_date", "Komunikasi terakhir", "internal", "date"),
      f("bante_score", "Skor BANTE", "internal", "number"),
      f("dropped_reason", "Alasan dropped"),
      f("created_at", "Dibuat", "internal", "date"),
      f("estimated_deal_amount", "Estimasi nilai deal", "commercial"),
      f("price_amount", "Harga", "commercial"),
      f("progress_notes", "Catatan progres (teks bebas)", "pii"),
    ],
    search: ["opty_no", "client_name", "requirement_summary", "position_name"],
    routes: ["/sales/opportunity-tracker/{id}/edit"],
    listHref: "/sales/opportunity-tracker",
    edges: [
      { name: "lead", label: "Lead asal", target: "lead", kind: "fk", sql: "SELECT lead_id AS id FROM sales_opportunity_trackers WHERE id=$1 AND lead_id IS NOT NULL" },
      { name: "requisitions", label: "Requisition", target: "requisition", kind: "fk", sql: "SELECT id FROM requisitions WHERE opportunity_id=$1" },
      { name: "pqs", label: "PQ komersial", target: "commercial_pq", kind: "fk", sql: "SELECT id FROM opportunities WHERE opportunity_tracker_id=$1" },
      byName("crm_client", "crm_clients", "name", "Akun CRM", "account"),
    ],
  },
  {
    type: "commercial_pq",
    label: "PQ komersial",
    module: "sales",
    table: "opportunities",
    alias: "o",
    display: "o.opty_no || coalesce(' · ' || o.pq_no, '') || ' · ' || o.client_name",
    fields: [
      f("opty_no", "No. Opportunity"),
      f("pq_no", "No. PQ"),
      f("client_name", "Client"),
      f("client_type_code", "Tipe client"),
      f("project_name", "Proyek"),
      f("position_name", "Posisi"),
      f("service_type_code", "Jenis layanan"),
      f("business_unit_code", "Business unit"),
      f("level_code", "Level"),
      f("headcount_target", "Target headcount", "internal", "number"),
      f("priority_code", "Prioritas"),
      f("bant_score", "Skor BANT", "internal", "number"),
      f("pipeline_stage_code", "Tahap pipeline"),
      f("opty_status_code", "Status"),
      f("sales_pic_name", "Sales PIC"),
      f("opty_request_date", "Tanggal request", "internal", "date"),
      f("approval_date", "Tanggal approval", "internal", "date"),
      f("start_date", "Mulai", "internal", "date"),
      f("end_date", "Selesai", "internal", "date"),
      f("estimated_duration_months", "Estimasi durasi (bulan)", "internal", "number"),
      f("price_amount", "Harga", "commercial"),
    ],
    search: ["opty_no", "pq_no", "client_name", "project_name"],
    routes: ["/sales/{id}/edit"],
    listHref: "/sales",
    edges: [
      { name: "tracker", label: "Opportunity Tracker", target: "sales_opportunity", kind: "fk", sql: "SELECT opportunity_tracker_id AS id FROM opportunities WHERE id=$1 AND opportunity_tracker_id IS NOT NULL" },
      { name: "lead", label: "Lead asal", target: "lead", kind: "fk", sql: "SELECT lead_id AS id FROM opportunities WHERE id=$1 AND lead_id IS NOT NULL" },
      byName("crm_client", "crm_clients", "name", "Akun CRM", "account"),
    ],
  },
  {
    type: "requisition",
    label: "Requisition",
    module: "ta",
    table: "requisitions",
    alias: "r",
    display: "r.requisition_no || ' · ' || r.position_name",
    fields: [
      f("requisition_no", "No. Requisition"),
      f("client_name", "Client"),
      f("position_name", "Posisi"),
      f("service_type_code", "Jenis layanan"),
      f("level_code", "Level"),
      f("opty_status_code", "Status"),
      f("headcount_target", "Target headcount", "internal", "number"),
      f("priority_code", "Prioritas"),
      f("estimated_duration_months", "Estimasi durasi (bulan)", "internal", "number"),
      f("ta_pic_name", "TA PIC"),
      f("sales_pic_name", "Sales PIC"),
      f("opty_request_date", "Tanggal request", "internal", "date"),
      f("created_at", "Dibuat", "internal", "date"),
      f("price_amount", "Harga", "commercial"),
      f("notes", "Catatan (teks bebas)", "pii"),
    ],
    search: ["requisition_no", "client_name", "position_name"],
    routes: ["/ta/{id}/edit"],
    listHref: "/ta",
    edges: [
      { name: "tracker", label: "Opportunity Tracker", target: "sales_opportunity", kind: "fk", sql: "SELECT opportunity_id AS id FROM requisitions WHERE id=$1 AND opportunity_id IS NOT NULL" },
      { name: "employees", label: "Talent ditugaskan", target: "employee", kind: "fk", sql: "SELECT DISTINCT employee_id AS id FROM talent_assignments WHERE requisition_id=$1" },
      byName("crm_client", "crm_clients", "name", "Akun CRM", "account"),
    ],
  },
  {
    type: "crm_client",
    label: "Akun CRM",
    module: "sales",
    table: "crm_clients",
    alias: "c",
    display: "c.name",
    fields: [
      f("name", "Nama akun"),
      f("industry", "Industri"),
      f("status_code", "Status"),
      f("created_at", "Dibuat", "internal", "date"),
      f("notes", "Catatan (teks bebas)", "pii"),
    ],
    search: ["name", "industry"],
    routes: ["/sales/accounts/{id}"],
    listHref: "/sales/accounts",
    edges: [
      byName("lead", "leads", "client_name", "Lead", "leads"),
      byName("sales_opportunity", "sales_opportunity_trackers", "client_name", "Opportunity Tracker", "trackers"),
      byName("commercial_pq", "opportunities", "client_name", "PQ komersial", "pqs"),
      byName("requisition", "requisitions", "client_name", "Requisition", "requisitions"),
    ],
  },
  {
    type: "employee",
    label: "Karyawan",
    module: "hr",
    table: "employees",
    alias: "e",
    display: "e.employee_no || coalesce(' · ' || e.position_name, '')",
    fields: [
      f("employee_no", "No. Karyawan"),
      f("position_name", "Posisi"),
      f("job_level_code", "Level jabatan"),
      f("employee_category_code", "Kategori"),
      f("join_date", "Tanggal bergabung", "internal", "date"),
      f("company_email", "Email kantor", "pii"),
    ],
    search: ["employee_no", "position_name"],
    routes: ["/hr/{id}", "/tm/employee/{id}"],
    listHref: "/hr",
    edges: [
      { name: "requisitions", label: "Requisition penugasan", target: "requisition", kind: "fk", sql: "SELECT DISTINCT requisition_id AS id FROM talent_assignments WHERE employee_id=$1 AND requisition_id IS NOT NULL" },
    ],
  },
  {
    type: "task",
    label: "Task",
    module: "general",
    table: "kanban_tasks",
    alias: "k",
    display: "k.task_no || ' · ' || k.title",
    fields: [
      f("task_no", "No. Task"),
      f("title", "Judul"),
      f("status_code", "Status"),
      f("priority_code", "Prioritas"),
      f("assignee_name", "Assignee"),
      f("start_date", "Mulai", "internal", "date"),
      f("due_date", "Jatuh tempo", "internal", "date"),
      f("created_by_name", "Dibuat oleh"),
      f("created_at", "Dibuat", "internal", "date"),
      f("description", "Deskripsi (teks bebas)", "pii"),
    ],
    search: ["task_no", "title"],
    routes: [],
    listHref: "/tasks",
    edges: [],
  },
  {
    type: "feature_request",
    label: "Feature Request",
    module: "general",
    table: "feature_requests",
    alias: "fr",
    display: "fr.request_no || ' · ' || fr.title",
    fields: [
      f("request_no", "No. Request"),
      f("title", "Judul"),
      f("module_area_code", "Modul"),
      f("request_type_code", "Jenis"),
      f("priority_code", "Prioritas"),
      f("status_code", "Status"),
      f("context_path", "Halaman asal"),
      f("release_sha", "Rilis"),
      f("requested_by_name", "Pengaju"),
      f("target_date", "Target", "internal", "date"),
      f("created_at", "Dibuat", "internal", "date"),
      f("description", "Deskripsi (teks bebas)", "pii"),
      f("requested_by_email", "Email pengaju", "pii"),
    ],
    search: ["request_no", "title"],
    routes: ["/feature-requests/{id}/edit"],
    listHref: "/feature-requests",
    edges: [],
  },
];

export const CATALOG_VERSION = "entity-catalog-v1";
export const CATALOG: ReadonlyMap<EntityType, CatalogEntity> = new Map(ENTITIES.map((e) => [e.type, e]));
export const entityTypes = () => [...CATALOG.keys()];
export function entity(type: string): CatalogEntity | undefined {
  return CATALOG.get(type as EntityType);
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const ROUTES = ENTITIES.flatMap((e) =>
  e.routes.map((route) => ({
    type: e.type,
    pattern: new RegExp("^" + route.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace("{id}", "(" + UUID + ")") + "$", "i"),
  })),
);

/** Page → entity from catalog routes only. Unknown paths resolve to no entity. */
export function resolvePageEntity(path: string): { type: EntityType; id: string } | null {
  const clean = path.split(/[?#]/)[0];
  for (const route of ROUTES) {
    const match = route.pattern.exec(clean);
    if (match) return { type: route.type, id: match[1].toLowerCase() };
  }
  return null;
}

export function hrefFor(type: EntityType, id: string): string {
  const e = CATALOG.get(type)!;
  return e.routes.length ? e.routes[0].replace("{id}", id) : e.listHref;
}

/** Name-match edges are templated against the source entity's own name column. */
export function edgeSql(source: CatalogEntity, edge: CatalogEdge): string {
  if (edge.kind === "fk") return edge.sql;
  const nameColumn = source.type === "crm_client" ? "name" : "client_name";
  return edge.sql
    .replace("%NAME%", nameColumn)
    .replace("%SELF%", `${source.table} WHERE id=$1`);
}

/** Public, SQL-free description for Intelligence and the Console. */
export function publicCatalog() {
  return {
    schema_version: "1.0",
    catalog_version: CATALOG_VERSION,
    entities: ENTITIES.map((e) => ({
      type: e.type,
      label: e.label,
      module: e.module,
      versioned: Boolean(e.version),
      fields: e.fields.map(({ name, label, sensitivity }) => ({ name, label, sensitivity })),
      search: e.search,
      routes: e.routes,
      edges: e.edges.map(({ name, label, target, kind }) => ({ name, label, target, kind })),
    })),
  };
}
