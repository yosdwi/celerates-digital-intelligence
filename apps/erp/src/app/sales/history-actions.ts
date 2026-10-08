"use server";
// "View edit history" (Sales V2, QA 2026-10-08): who changed which field of a Sales record, from what to what.
// Read access follows the record's page: Sales for Opportunity Tracker and PQ; Sales or Marketing for Account (CRM).
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { readHistory, readModuleHistory, type HistoryRecordType, type ModuleHistoryFilter } from "@/lib/field-history";

const TYPES: HistoryRecordType[] = ["opportunity_tracker", "commercial_pq", "crm_client"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FIELD = /^[a-z_]{1,64}$/;

async function canRead(recordType: HistoryRecordType) {
  try {
    await requireDivisionAccess("sales", "viewer");
  } catch (err) {
    if (recordType !== "crm_client") throw err;
    await requireDivisionAccess("marketing", "viewer");
  }
}

export async function getFieldHistory(recordType: HistoryRecordType, recordId: string, field?: string) {
  await requireActor();
  if (!TYPES.includes(recordType) || !UUID.test(recordId) || (field != null && !FIELD.test(field))) throw new Error("Permintaan riwayat tidak valid");
  await canRead(recordType);
  return readHistory(recordType, recordId, field);
}

/** The page's "Riwayat" drawer: every change in the module, filtered by record, person, field or since when. */
export async function getModuleHistory(recordType: HistoryRecordType, filter: ModuleHistoryFilter) {
  await requireActor();
  const { recordId, actor, field, since, offset } = filter ?? {};
  const valid = TYPES.includes(recordType)
    && (recordId == null || UUID.test(recordId))
    && (actor == null || (typeof actor === "string" && actor.length <= 200))
    && (field == null || FIELD.test(field))
    && (since == null || !Number.isNaN(Date.parse(since)))
    && (offset == null || (Number.isInteger(offset) && offset >= 0 && offset <= 100_000));
  if (!valid) throw new Error("Permintaan riwayat tidak valid");
  await canRead(recordType);
  return readModuleHistory(recordType, { recordId, actor, field, since, offset });
}
