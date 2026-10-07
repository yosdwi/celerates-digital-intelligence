import { count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { INTEGRATIONS_ENABLED } from "@/lib/integration-policy";
import {
  applications, attachments, candidates, employees, leads, onboardingRequests, opportunities, requisitions, salesOpportunityTrackers, sheetConnections, signatureRequests,
} from "@/db/schema";
import { PQ_DOCUMENT_SOURCE, PQ_SIGNATURE_SOURCE } from "@/app/sales/pq-constants";
import { OPPORTUNITY_PO_DOC_SOURCE } from "@/app/sales/constants";
import type { Opportunity, SignatureStatus } from "./model";

/** Everything the Opportunity workspace shows, read from the same tables V1 reads. No new source of truth. */
export async function loadOpportunityWorkspace() {
  const [rows, reqs, pqs, sigs, docs, apps, onboard, leadOptions, positionRows, employeeRows] = await Promise.all([
    db
      .select({
        id: salesOpportunityTrackers.id,
        lead_id: salesOpportunityTrackers.lead_id,
        opty_no: salesOpportunityTrackers.opty_no,
        client_name: salesOpportunityTrackers.client_name,
        service_type_code: salesOpportunityTrackers.service_type_code,
        requirement_summary: salesOpportunityTrackers.requirement_summary,
        opty_status_code: salesOpportunityTrackers.opty_status_code,
        progress_notes: salesOpportunityTrackers.progress_notes,
        estimated_deal_amount: salesOpportunityTrackers.estimated_deal_amount,
        detail_requirement: salesOpportunityTrackers.detail_requirement,
        client_type_code: salesOpportunityTrackers.client_type_code,
        sales_pic_name: salesOpportunityTrackers.sales_pic_name,
        last_communication_date: salesOpportunityTrackers.last_communication_date,
        bante_score: salesOpportunityTrackers.bante_score,
        sales_qualified: salesOpportunityTrackers.sales_qualified,
        dropped_reason: salesOpportunityTrackers.dropped_reason,
        position_name: salesOpportunityTrackers.position_name,
        level_code: salesOpportunityTrackers.level_code,
        headcount_target: salesOpportunityTrackers.headcount_target,
        price_amount: salesOpportunityTrackers.price_amount,
        price_period_code: salesOpportunityTrackers.price_period_code,
        estimated_duration_months: salesOpportunityTrackers.estimated_duration_months,
        created_at: salesOpportunityTrackers.created_at,
        lead_no: leads.lead_no,
      })
      .from(salesOpportunityTrackers)
      .leftJoin(leads, eq(salesOpportunityTrackers.lead_id, leads.id))
      .orderBy(desc(salesOpportunityTrackers.created_at)),
    db.select({ id: requisitions.id, no: requisitions.requisition_no, trackerId: requisitions.opportunity_id }).from(requisitions).where(isNotNull(requisitions.opportunity_id)),
    db
      .select({ id: opportunities.id, no: opportunities.pq_no, stage: opportunities.pipeline_stage_code, trackerId: opportunities.opportunity_tracker_id })
      .from(opportunities)
      .where(isNotNull(opportunities.opportunity_tracker_id)),
    db.select({ sourceId: signatureRequests.source_id, status: signatureRequests.status_code }).from(signatureRequests).where(eq(signatureRequests.source_type, PQ_SIGNATURE_SOURCE)),
    // Counts only: document links stay on the PQ page, behind its own access checks.
    db
      .select({ sourceId: attachments.source_id, n: count() })
      .from(attachments)
      .where(inArray(attachments.source_type, [PQ_DOCUMENT_SOURCE, OPPORTUNITY_PO_DOC_SOURCE]))
      .groupBy(attachments.source_id),
    db.select({ requisitionId: applications.requisition_id, n: count() }).from(applications).where(isNotNull(applications.requisition_id)).groupBy(applications.requisition_id),
    db.select({ requisitionId: onboardingRequests.requisition_id, n: count() }).from(onboardingRequests).where(isNotNull(onboardingRequests.requisition_id)).groupBy(onboardingRequests.requisition_id),
    db.select({ id: leads.id, lead_no: leads.lead_no, client_name: leads.client_name }).from(leads),
    db.select({ position_name: salesOpportunityTrackers.position_name }).from(salesOpportunityTrackers).where(isNotNull(salesOpportunityTrackers.position_name)),
    // Same talent list V1's Extension Request form offers.
    db
      .select({ id: employees.id, employee_no: employees.employee_no, candidate_name: candidates.candidate_name, position_name: employees.position_name })
      .from(employees)
      .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id)),
  ]);

  const appsByReq = new Map(apps.map((a) => [a.requisitionId!, a.n]));
  const onboardByReq = new Map(onboard.map((a) => [a.requisitionId!, a.n]));
  const reqByTracker = new Map(reqs.map((r) => [r.trackerId!, { id: r.id, no: r.no, applications: appsByReq.get(r.id) ?? 0, onboarding: onboardByReq.get(r.id) ?? 0 }]));
  const sigByPq = new Map(sigs.filter((s) => s.sourceId).map((s) => [s.sourceId!, s.status as SignatureStatus]));
  const docsBySource = new Map(docs.map((d) => [d.sourceId, d.n]));
  const pqByTracker = new Map(pqs.map((p) => [p.trackerId!, { id: p.id, no: p.no, stage: p.stage, signature: sigByPq.get(p.id) ?? "not_sent", documents: docsBySource.get(p.id) ?? 0 }]));

  const records: Opportunity[] = rows.map((r) => ({
    id: r.id,
    optyNo: r.opty_no,
    leadId: r.lead_id,
    leadNo: r.lead_no,
    client: r.client_name,
    clientType: r.client_type_code,
    serviceType: r.service_type_code,
    position: r.position_name,
    level: r.level_code,
    headcount: r.headcount_target,
    durationMonths: r.estimated_duration_months,
    salesQualified: r.sales_qualified,
    requirement: r.requirement_summary,
    detailRequirement: r.detail_requirement,
    closingPrice: r.estimated_deal_amount,
    price: r.price_amount,
    pricePeriod: r.price_period_code,
    salesPic: r.sales_pic_name,
    lastCommunication: r.last_communication_date,
    bante: r.bante_score,
    progressNotes: r.progress_notes,
    droppedReason: r.dropped_reason,
    status: r.opty_status_code,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    requisition: reqByTracker.get(r.id) ?? null,
    pq: pqByTracker.get(r.id) ?? null,
  }));

  return {
    records,
    leadOptions: leadOptions.map((l) => ({ id: l.id, lead_no: l.lead_no, client_name: l.client_name })),
    positionSuggestions: Array.from(new Set(positionRows.map((r) => r.position_name).filter((p): p is string => !!p?.trim()))).sort(),
    employeeOptions: employeeRows.map((e) => ({ value: e.id, label: `${e.employee_no} - ${e.candidate_name ?? "-"}${e.position_name ? ` (${e.position_name})` : ""}` })),
  };
}

export type WorkspaceData = Awaited<ReturnType<typeof loadOpportunityWorkspace>>;

/** Google Sheet connection for the Sheet Sync dialog (editors only; the page decides). No tokens, just what V1 shows. */
/** `divisionKey`: V1's key per page ("sales_opportunity_tracker"; "sales" is PQ Tracker). */
export async function loadSheetSync(divisionKey = "sales_opportunity_tracker") {
  const [c] = await db
    .select({ url: sheetConnections.spreadsheet_url, sheetName: sheetConnections.sheet_name, mapping: sheetConnections.column_mapping })
    .from(sheetConnections)
    .where(eq(sheetConnections.division_key, divisionKey));
  return {
    enabled: INTEGRATIONS_ENABLED,
    connection: c ? { url: c.url, sheetName: c.sheetName, mapping: c.mapping ? (JSON.parse(c.mapping) as Record<string, string>) : null } : null,
  };
}
export type SheetSyncData = Awaited<ReturnType<typeof loadSheetSync>>;

