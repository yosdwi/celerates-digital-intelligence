import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { applications, candidates, requisitions } from "@/db/schema";
import { NO_CLIENT, NOT_SENT, type ClientCandidate } from "./client-active-model";

/** Every application with its candidate and requisition, read exactly as V1's Client Active page reads them. */
export async function loadClientActive(): Promise<ClientCandidate[]> {
  const rows = await db
    .select({ a: applications, c: candidates, r: requisitions })
    .from(applications)
    .leftJoin(requisitions, eq(applications.requisition_id, requisitions.id))
    .leftJoin(candidates, eq(applications.candidate_id, candidates.id))
    .orderBy(desc(applications.created_at));
  return rows.map(({ a, c, r }) => ({
    id: a.id,
    candidateNo: c?.candidate_no ?? null,
    name: c?.candidate_name ?? "-",
    wa: c?.wa_number ?? null,
    email: c?.email ?? null,
    level: a.level_code ?? null,
    hiringStatus: a.hiring_status_code,
    price: a.price_amount ?? null,
    clientStatus: a.client_submission_status_code ?? NOT_SENT,
    clientNote: a.client_submission_note ?? null,
    clientUpdatedAt: a.client_submission_updated_at?.toISOString() ?? null,
    clientUpdatedBy: a.client_submission_updated_by_name ?? null,
    client: r?.client_name ?? NO_CLIENT,
    position: r?.position_name ?? null,
    createdAt: a.created_at?.toISOString() ?? null,
  }));
}
