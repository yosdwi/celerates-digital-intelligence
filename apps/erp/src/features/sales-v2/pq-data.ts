import { desc, eq, getTableColumns, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { clients, leads, opportunities, projectDocuments, signatureRequests } from "@/db/schema";
import { getPicNames } from "@/lib/reference-data";
import { getActiveUserOptions } from "@/lib/approval-journey";
import { getAttachmentsWithUrlsForMany, type AttachmentWithUrl } from "@/lib/attachments";
import { OPPORTUNITY_PO_DOC_SOURCE } from "@/app/sales/constants";
import { PQ_DOCUMENT_SOURCE, PQ_SIGNATURE_SOURCE } from "@/app/sales/pq-constants";
import type { SignatureStatus } from "./model";
import type { Pq, PqFile } from "./pq-model";

const files = (list: AttachmentWithUrl[] | undefined): PqFile[] => (list ?? []).map((a) => ({ id: a.id, name: a.file_name, url: a.url, kind: a.kind }));

/** Everything the PQ workspace shows, read the way the V1 PQ Tracker page (app/sales/page.tsx) reads it. */
export async function loadPqWorkspace() {
  const [rows, docs, sigs, users, picNames, positionRows, clientRows] = await Promise.all([
    db
      .select({ ...getTableColumns(opportunities), lead_source_code: leads.lead_source_code })
      .from(opportunities)
      .leftJoin(leads, eq(opportunities.lead_id, leads.id))
      .orderBy(desc(opportunities.created_at)),
    db.select().from(projectDocuments).where(isNotNull(projectDocuments.opportunity_id)),
    db.select().from(signatureRequests).where(eq(signatureRequests.source_type, PQ_SIGNATURE_SOURCE)),
    getActiveUserOptions(),
    getPicNames(),
    db.select({ position_name: opportunities.position_name }).from(opportunities).where(isNotNull(opportunities.position_name)),
    db.select({ name: clients.name, code: clients.code }).from(clients),
  ]);

  const ids = rows.map((r) => r.id);
  const [poDocs, pqDocs] = await Promise.all([
    getAttachmentsWithUrlsForMany(OPPORTUNITY_PO_DOC_SOURCE, ids),
    getAttachmentsWithUrlsForMany(PQ_DOCUMENT_SOURCE, ids),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.full_name]));
  const sigByPq = new Map(sigs.filter((s) => s.source_id).map((s) => [s.source_id!, s]));
  const docByPq = new Map(docs.map((d) => [d.opportunity_id!, d]));

  const records: Pq[] = rows.map((r) => {
    const sig = sigByPq.get(r.id);
    const d = docByPq.get(r.id);
    return {
      id: r.id,
      optyNo: r.opty_no,
      pqNo: r.pq_no,
      fromOnboarding: !!r.onboarding_request_id,
      trackerId: r.opportunity_tracker_id,
      client: r.client_name,
      clientType: r.client_type_code,
      project: r.project_name,
      position: r.position_name,
      serviceType: r.service_type_code,
      businessUnit: r.business_unit_code,
      level: r.level_code,
      headcount: r.headcount_target,
      durationMonths: r.estimated_duration_months,
      priority: r.priority_code,
      bant: r.bant_score,
      price: r.price_amount,
      pricePeriod: r.price_period_code,
      requestDate: r.opty_request_date,
      approvalDate: r.approval_date,
      startDate: r.start_date,
      endDate: r.end_date,
      salesPic: r.sales_pic_name,
      stage: r.pipeline_stage_code,
      optyStatus: r.opty_status_code,
      notes: r.notes,
      leadSource: r.lead_source_code,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
      poDocUrl: r.po_doc_url,
      poDocs: files(poDocs[r.id]),
      pqDocs: files(pqDocs[r.id]),
      signature: {
        status: (sig?.status_code as SignatureStatus) ?? "not_sent",
        signerName: sig ? userName.get(sig.signer_user_id) ?? null : null,
      },
      projectDoc: d
        ? {
            projectDetails: d.project_details, salesType: d.sales_type_code, pksNo: d.pks_no, pksStatus: d.pks_status_code,
            poNo: d.po_no, poStatus: d.po_status_code, crNo: d.cr_no, crStatus: d.cr_status_code,
            otherDocNo: d.other_doc_no, otherDocStatus: d.other_doc_status_code,
          }
        : null,
    };
  });

  return {
    records,
    options: {
      picNames,
      positionSuggestions: Array.from(new Set(positionRows.map((r) => r.position_name).filter((p): p is string => !!p?.trim()))).sort(),
      // Same signer list V1's "Kirim ke TTD" offers.
      signers: users.map((u) => ({ value: u.id, label: `${u.full_name} (${u.email})` })),
      // GeneratePqButton (V1) suggests the next sequence and reads client codes.
      clients: clientRows,
      suggestedSeq: rows.filter((r) => r.pq_no).length + 1,
    },
  };
}

export type PqOptions = Awaited<ReturnType<typeof loadPqWorkspace>>["options"];
