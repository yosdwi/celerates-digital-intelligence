import { db } from "@/db";
import { projectDocuments, opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { updateProjectDocument, deleteProjectDocAttachment } from "../../actions";
import { PROJECT_DOC_SOURCES } from "../../constants";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Pencil } from "lucide-react";
import { EditDocumentForm } from "./edit-document-form";

export default async function EditDocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("pmo");
  const { id } = await params;
  const [doc] = await db.select().from(projectDocuments).where(eq(projectDocuments.id, id));
  if (!doc) notFound();

  const [[opty], pksAttachments, poAttachments, crAttachments, otherAttachments] = await Promise.all([
    db.select().from(opportunities).where(eq(opportunities.id, doc.opportunity_id)),
    getAttachmentsWithUrls(PROJECT_DOC_SOURCES.pks, id),
    getAttachmentsWithUrls(PROJECT_DOC_SOURCES.po, id),
    getAttachmentsWithUrls(PROJECT_DOC_SOURCES.cr, id),
    getAttachmentsWithUrls(PROJECT_DOC_SOURCES.other, id),
  ]);

  const updateWithId = updateProjectDocument.bind(null, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Pencil} color="bg-violet-500" eyebrow="PMO" title={t("editDocumentTitle", { client: opty?.client_name ?? "-" })}>
        <Link href="/pmo" className="text-sm font-medium text-violet-700 hover:underline">&larr; {t("backToDocumentsList")}</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-4xl mx-auto">
        <EditDocumentForm
          action={updateWithId}
          onDeleteAttachment={deleteProjectDocAttachment}
          defaultProjectDetails={doc.project_details ?? ""}
          defaultPqPrice={doc.pq_price?.toString() ?? ""}
          defaultPksNo={doc.pks_no ?? ""}
          defaultPksUrl={doc.pks_url ?? ""}
          defaultPksStatus={doc.pks_status_code ?? ""}
          pksAttachments={pksAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
          defaultPoStartDate={doc.po_start_date ?? ""}
          defaultPoEndDate={doc.po_end_date ?? ""}
          defaultPoNo={doc.po_no ?? ""}
          defaultPoUrl={doc.po_url ?? ""}
          defaultPoStatus={doc.po_status_code ?? ""}
          poAttachments={poAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
          defaultCrNo={doc.cr_no ?? ""}
          defaultCrUrl={doc.cr_url ?? ""}
          defaultCrStatus={doc.cr_status_code ?? ""}
          crAttachments={crAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
          defaultOtherDocNo={doc.other_doc_no ?? ""}
          defaultOtherDocUrl={doc.other_doc_url ?? ""}
          defaultOtherDocStatus={doc.other_doc_status_code ?? ""}
          otherAttachments={otherAttachments.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
          salesPriceAmount={opty?.price_amount ?? null}
          salesStartDate={opty?.start_date ?? null}
          salesEndDate={opty?.end_date ?? null}
          salesPqNo={opty?.pq_no ?? null}
          backHref="/pmo"
        />
      </main>
    </div>
  );
}
