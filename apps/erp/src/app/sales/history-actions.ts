"use server";
// "View edit history" (Sales V2, QA 2026-10-08): who changed which field of a Sales record, from what to what.
// Read access follows the record's page: Sales for Opportunity Tracker and PQ; Sales or Marketing for Account (CRM).
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { readHistory, type HistoryRecordType } from "@/lib/field-history";

const TYPES: HistoryRecordType[] = ["opportunity_tracker", "commercial_pq", "crm_client"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getFieldHistory(recordType: HistoryRecordType, recordId: string, field?: string) {
  await requireActor();
  if (!TYPES.includes(recordType) || !UUID.test(recordId) || (field != null && !/^[a-z_]{1,64}$/.test(field))) throw new Error("Permintaan riwayat tidak valid");
  try {
    await requireDivisionAccess("sales", "viewer");
  } catch (err) {
    if (recordType !== "crm_client") throw err;
    await requireDivisionAccess("marketing", "viewer");
  }
  return readHistory(recordType, recordId, field);
}
