// ADR-009 delegated reads. Called only after machine auth + ERP-verified delegation + a fresh DB reload of the
// user. Authorization is the user's current module access; sensitivity filtering happens here, before any
// value leaves ERP. All SQL identifiers come from the code-owned catalog; request values are bound.
import type { Sql } from "postgres";
import { canReadModule, MODULES, type Module, type OperationalActor } from "@/lib/operations/policy";
import { checkSignals } from "@/lib/operations/reader";
import { CATALOG, edgeSql, entity as catalogEntity, hrefFor, type CatalogEntity, type EntityType } from "./catalog";

const EDGE_SAMPLE = 5;
const SEARCH_PER_TYPE = 5;
const SEARCH_TOTAL = 40;
export type AgentActor = OperationalActor & { id: string; name: string };

export class AgentReadError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/** Reload the delegated user from ERP. Token claims are never trusted for authorization. */
export async function loadActor(sql: Sql, userId: string): Promise<AgentActor> {
  const [user] = await sql`SELECT id, status, is_owner, full_name, account_type FROM users WHERE id=${userId}`;
  if (!user || user.status !== "active") throw new AgentReadError(403, "USER_INACTIVE");
  const access = await sql`SELECT d.key AS "divisionKey", ua.level FROM user_access ua JOIN divisions d ON d.id=ua.division_id WHERE ua.user_id=${userId}`;
  return {
    id: user.id,
    name: user.full_name,
    status: user.status,
    isOwner: user.is_owner === true,
    accountType: user.account_type ?? "backoffice",
    access: access.map((a) => ({ divisionKey: a.divisionKey as string, level: a.level as string })),
  };
}

export function canReadEntityModule(actor: OperationalActor, module: Module): boolean {
  if (module !== "general") return canReadModule(actor, module);
  // Cross-module work items (tasks, feature requests): any active back-office user with ERP access.
  return actor.status === "active" && (actor.isOwner === true || (actor.accountType === "backoffice" && (actor.access ?? []).length > 0));
}

function authorizeType(actor: OperationalActor, type: string): CatalogEntity {
  const def = catalogEntity(type);
  if (!def) throw new AgentReadError(404, "UNKNOWN_ENTITY_TYPE");
  if (!canReadEntityModule(actor, def.module)) throw new AgentReadError(403, "MODULE_FORBIDDEN");
  return def;
}

function format(value: unknown, kind?: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (kind === "bool") return value ? "Ya" : "Tidak";
  if (value instanceof Date) return kind === "date" ? value.toISOString().slice(0, 10) : value.toISOString();
  return String(value).slice(0, 2000);
}

async function labels(tx: Sql, type: EntityType, ids: string[]) {
  if (!ids.length) return [];
  const def = CATALOG.get(type)!;
  const rows = await tx.unsafe<{ id: string; label: string }[]>(
    `SELECT ${def.alias}.id::text AS id, ${def.display} AS label FROM ${def.table} ${def.alias} WHERE ${def.alias}.id::text = ANY($1::text[]) ORDER BY 2, 1`,
    [ids],
  );
  return rows.map((r) => ({ id: r.id, label: r.label, href: hrefFor(type, r.id) }));
}

export async function readEntity(sql: Sql, actor: OperationalActor, type: string, id: string) {
  const def = authorizeType(actor, type);
  const visible = def.fields.filter((f) => f.sensitivity === "internal" || f.sensitivity === "commercial");
  const columns = visible.map((f) => `${def.alias}.${f.name} AS ${f.name}`);
  if (def.version) columns.push(`${def.alias}.${def.version} AS __version`);
  const asOf = new Date().toISOString();
  const row = await sql.begin("isolation level repeatable read read only", async (tx) => {
    const [found] = await tx.unsafe(
      `SELECT ${columns.join(", ")}, ${def.display} AS __label FROM ${def.table} ${def.alias} WHERE ${def.alias}.id = $1::uuid`,
      [id],
    );
    return found;
  });
  if (!row) throw new AgentReadError(404, "NOT_FOUND");
  return {
    schema_version: "1.0",
    as_of: asOf,
    entity: {
      type: def.type,
      type_label: def.label,
      id,
      label: row.__label as string,
      module: def.module,
      module_label: MODULES[def.module],
      href: hrefFor(def.type, id),
      record_version: def.version ? Number(row.__version) : null,
      as_of: asOf,
      fields: visible
        .filter((f) => f.sensitivity === "internal")
        .map((f) => ({ name: f.name, label: f.label, value: format(row[f.name], f.kind) })),
      commercial: visible
        .filter((f) => f.sensitivity === "commercial")
        .map((f) => ({ name: f.name, label: f.label, state: row[f.name] === null || row[f.name] === undefined ? "kosong" : "terisi" })),
      withheld: def.fields.filter((f) => f.sensitivity === "pii" || f.sensitivity === "restricted").map((f) => ({ name: f.label, sensitivity: f.sensitivity })),
      quality: { version_tracking: Boolean(def.version) },
    },
  };
}

export async function readNeighbours(sql: Sql, actor: OperationalActor, type: string, id: string) {
  const def = authorizeType(actor, type);
  const asOf = new Date().toISOString();
  const edges = await sql.begin("isolation level repeatable read read only", async (tx) => {
    const [exists] = await tx.unsafe(`SELECT 1 FROM ${def.table} WHERE id = $1::uuid`, [id]);
    if (!exists) throw new AgentReadError(404, "NOT_FOUND");
    const out = [];
    for (const edge of def.edges) {
      const target = CATALOG.get(edge.target)!;
      if (!canReadEntityModule(actor, target.module)) {
        out.push({ name: edge.name, label: edge.label, kind: edge.kind, target_type: edge.target, count: null, items: [], withheld: "MODULE_FORBIDDEN" });
        continue;
      }
      const rows = await tx.unsafe<{ id: string }[]>(`SELECT DISTINCT x.id::text AS id FROM (${edgeSql(def, edge)}) x WHERE x.id IS NOT NULL`, [id]);
      const ids = rows.map((r) => r.id);
      out.push({
        name: edge.name,
        label: edge.label,
        kind: edge.kind,
        target_type: edge.target,
        count: ids.length,
        items: await labels(tx as unknown as Sql, edge.target, ids.slice(0, EDGE_SAMPLE)),
      });
    }
    return out;
  });
  return { schema_version: "1.0", as_of: asOf, edges };
}

export async function readEntitySignals(sql: Sql, actor: OperationalActor, type: string, id: string) {
  authorizeType(actor, type);
  const rules = await checkSignals(sql, actor, type, [id]);
  return {
    schema_version: "1.0",
    as_of: new Date().toISOString(),
    signals: rules.map((r) => ({ key: r.key, title: r.title, rule: r.rule, href: r.href, matches: r.matches.includes(id) })),
  };
}

/** Search terms: whitespace-separated, edge punctuation stripped, de-duplicated, at most six. */
export function searchTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .split(" ")
    .map((t) => t.replace(/^[^\p{L}\p{N}%_]+|[^\p{L}\p{N}%_]+$/gu, ""))
    .filter((t) => t.length >= 2);
  return [...new Set(terms)].slice(0, 6);
}

/**
 * Catalog search over non-sensitive fields. `all` (default): every term must match some field of the record.
 * `any`: records matching at least one term, ranked by how many terms matched (for questions phrased loosely).
 */
export async function search(sql: Sql, actor: OperationalActor, raw: string, mode: "all" | "any" = "all") {
  const query = raw.replace(/\s+/g, " ").trim().slice(0, 100);
  if (query.length < 2) throw new AgentReadError(422, "QUERY_TOO_SHORT");
  const terms = searchTerms(query);
  if (!terms.length) throw new AgentReadError(422, "QUERY_TOO_SHORT");
  const patterns = terms.map((t) => "%" + t.replace(/[\\%_]/g, (c) => "\\" + c) + "%");
  const readable = [...CATALOG.values()].filter((d) => canReadEntityModule(actor, d.module));
  type Result = { type: string; type_label: string; id: string; label: string; href: string; module: string; matched_field: string; score: number };
  const results: Result[] = [];
  let truncated = false;
  await sql.begin("isolation level repeatable read read only", async (tx) => {
    for (const def of readable) {
      const fields = def.search.filter((name) => def.fields.find((f) => f.name === name)?.sensitivity === "internal");
      if (!fields.length) continue;
      const hit = (i: number) => "(" + fields.map((name) => `${def.alias}.${name} ILIKE $${i + 1}`).join(" OR ") + ")";
      const score = terms.map((_, i) => `(CASE WHEN ${hit(i)} THEN 1 ELSE 0 END)`).join("+");
      const where = terms.map((_, i) => hit(i)).join(mode === "all" ? " AND " : " OR ");
      const matched = `CASE ${terms.flatMap((_, i) => fields.map((name) => `WHEN ${def.alias}.${name} ILIKE $${i + 1} THEN '${def.fields.find((f) => f.name === name)!.label.replace(/'/g, "")}'`)).join(" ")} END`;
      const rows = await tx.unsafe<{ id: string; label: string; matched: string; score: number }[]>(
        `SELECT ${def.alias}.id::text AS id, ${def.display} AS label, ${matched} AS matched, (${score})::int AS score FROM ${def.table} ${def.alias} WHERE ${where} ORDER BY 4 DESC, 2, 1 LIMIT ${SEARCH_PER_TYPE + 1}`,
        patterns,
      );
      if (rows.length > SEARCH_PER_TYPE) truncated = true;
      for (const row of rows.slice(0, SEARCH_PER_TYPE))
        results.push({ type: def.type, type_label: def.label, id: row.id, label: row.label, href: hrefFor(def.type, row.id), module: def.module, matched_field: row.matched, score: row.score });
    }
  });
  results.sort((a, b) => b.score - a.score);
  if (results.length > SEARCH_TOTAL) truncated = true;
  return { schema_version: "1.0", as_of: new Date().toISOString(), query, terms, mode, results: results.slice(0, SEARCH_TOTAL), truncated, types_searched: readable.map((d) => d.type) };
}
