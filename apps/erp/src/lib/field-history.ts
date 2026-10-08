// Field-level edit history (Sales V2 "View edit history", QA 2026-10-08). The Sales update actions save through
// `updateWithHistory`, which reads the row, applies the change and records each field whose value changed, so the
// history is complete whichever screen made the edit (V2 cell or panel, Edit form, Kanban, V1 pages).
import { desc, eq, and, gte, asc } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { crmClients, opportunities, projectDocuments, recordFieldChanges, salesOpportunityTrackers } from "@/db/schema";

export type HistoryRecordType = "opportunity_tracker" | "commercial_pq" | "crm_client";
export type FieldChange = { field: string; old: string | null; new: string | null };

const asText = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (v instanceof Date) return v.toISOString();
  return String(v);
};

/** The fields of `changes` whose value differs from `before` (blank and null are the same "not set"; `undefined`
 *  means "not written", as in drizzle's set). Pure. */
export function fieldDiffs(before: Record<string, unknown>, changes: Record<string, unknown>): FieldChange[] {
  return Object.entries(changes)
    .filter(([, value]) => value !== undefined)
    .map(([field, value]) => ({ field, old: asText(before[field]), new: asText(value) }))
    .filter((c) => c.old !== c.new);
}

/** Store the changes, attributed to the signed-in user. */
export async function recordChanges(recordType: HistoryRecordType, recordId: string, changes: FieldChange[]) {
  if (!changes.length) return;
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string; fullName?: string; name?: string; email?: string } | undefined;
  const actorName = user?.fullName ?? user?.name ?? user?.email ?? "Unknown";
  await db.insert(recordFieldChanges).values(changes.map((c) => ({
    record_type: recordType, record_id: recordId, field: c.field, old_value: c.old, new_value: c.new, actor_user_id: user?.id ?? null, actor_name: actorName,
  })));
}

type Table = typeof salesOpportunityTrackers | typeof opportunities | typeof crmClients;

/** `db.update(table).set(changes)` for one row by id, recording what changed. */
export async function updateWithHistory(recordType: HistoryRecordType, table: Table, id: string, changes: Record<string, unknown>) {
  const [before] = await db.select().from(table).where(eq(table.id, id));
  await db.update(table).set(changes as never).where(eq(table.id, id));
  if (before) await recordChanges(recordType, id, fieldDiffs(before as Record<string, unknown>, changes));
}

/** The PQ's PMO document row (project_documents) as it is before an edit, for its share of the PQ's history. */
export async function pmoDocumentOf(opportunityId: string) {
  const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.opportunity_id, opportunityId)).limit(1);
  return doc as Record<string, unknown> | undefined;
}

/** Newest first; one field, or every field of the record. */
export async function readHistory(recordType: HistoryRecordType, recordId: string, field?: string) {
  const where = field
    ? and(eq(recordFieldChanges.record_type, recordType), eq(recordFieldChanges.record_id, recordId), eq(recordFieldChanges.field, field))
    : and(eq(recordFieldChanges.record_type, recordType), eq(recordFieldChanges.record_id, recordId));
  const rows = await db.select().from(recordFieldChanges).where(where).orderBy(desc(recordFieldChanges.created_at)).limit(200);
  return rows.map(toRow);
}

const toRow = (r: typeof recordFieldChanges.$inferSelect) => ({ id: r.id, recordId: r.record_id, field: r.field, old: r.old_value, new: r.new_value, by: r.actor_name, at: r.created_at.toISOString() });

export type ModuleHistoryFilter = { recordId?: string; actor?: string; field?: string; since?: string; offset?: number };

/** A module's changes across its records, newest first, a page at a time; the people and fields to filter by with the
 *  first page. */
export async function readModuleHistory(recordType: HistoryRecordType, f: ModuleHistoryFilter, limit = 100) {
  const t = recordFieldChanges;
  const where = and(
    eq(t.record_type, recordType),
    f.recordId ? eq(t.record_id, f.recordId) : undefined,
    f.actor ? eq(t.actor_name, f.actor) : undefined,
    f.field ? eq(t.field, f.field) : undefined,
    f.since ? gte(t.created_at, new Date(f.since)) : undefined,
  );
  // ponytail: offset paging; a change saved between pages repeats a row (the client drops repeats by id).
  const rows = await db.select().from(t).where(where).orderBy(desc(t.created_at), desc(t.id)).limit(limit + 1).offset(f.offset ?? 0);
  const facets = f.offset ? null : {
    actors: (await db.selectDistinct({ v: t.actor_name }).from(t).where(eq(t.record_type, recordType)).orderBy(asc(t.actor_name))).map((r) => r.v),
    fields: (await db.selectDistinct({ v: t.field }).from(t).where(eq(t.record_type, recordType)).orderBy(asc(t.field))).map((r) => r.v),
  };
  return { rows: rows.slice(0, limit).map(toRow), more: rows.length > limit, facets };
}
