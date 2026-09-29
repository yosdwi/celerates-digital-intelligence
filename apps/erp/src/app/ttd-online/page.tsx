import { db } from "@/db";
import { signatureRequests, signatures, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAttachmentsWithUrlsForMany, type AttachmentWithUrl } from "@/lib/attachments";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getDocumentUrl } from "@/lib/storage";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { ExpandableSection } from "@/components/expandable-section";
import { SignatureSection } from "./signature-section";
import { RequestForm } from "./request-form";
import { RequestList, SignatureRequestRow } from "./request-list";
import { SIGNATURE_REQUEST_DOCUMENT_SOURCE } from "./constants";
import { APPROVAL_STEPS, EXTENSION_REQUEST_SOURCE } from "@/lib/approval-journey";
import { PenTool } from "lucide-react";
import type { JourneyStep } from "./request-list";
import { getTranslations } from "next-intl/server";

/** Susun progress stepper dari histori signatureRequests yang SUDAH ke-fetch (semua source_type, semua source_id) --
 * tidak perlu query tambahan. Step yang belum pernah dibuat baris signature_request-nya dianggap "upcoming". */
function buildJourneySteps(sourceId: string, allRequests: { source_id: string | null; step_code: string | null; status_code: string }[]): JourneyStep[] {
  const bySourceStep = new Map<string, { status_code: string }>();
  for (const r of allRequests) {
    if (r.source_id === sourceId && r.step_code) bySourceStep.set(r.step_code, r);
  }
  return APPROVAL_STEPS.map((s) => ({
    label: s.label,
    status: (bySourceStep.get(s.code)?.status_code as JourneyStep["status"]) ?? "upcoming",
  }));
}

export default async function TtdOnlinePage() {
  const t = await getTranslations("ttd");
  const session = await getServerSession(authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) redirect("/login");

  const [[mySignature], allUsers, allRequests] = await Promise.all([
    db.select().from(signatures).where(eq(signatures.user_id, userId)),
    db.select({ id: users.id, full_name: users.full_name, email: users.email }).from(users).where(eq(users.status, "active")),
    db.select().from(signatureRequests),
  ]);
  const mySignatureUrl = mySignature ? await getDocumentUrl(mySignature.image_path) : null;

  const userMap = new Map(allUsers.map((u) => [u.id, u]));
  const otherUsers = allUsers.filter((u) => u.id !== userId);

  const idsByType = new Map<string, Set<string>>();
  for (const r of allRequests) {
    if (r.source_type && r.source_id) {
      if (!idsByType.has(r.source_type)) idsByType.set(r.source_type, new Set());
      idsByType.get(r.source_type)!.add(r.source_id);
    }
  }
  const attachmentsByTypeResults = await Promise.all(
    [...idsByType.entries()].map(async ([type, ids]) => [type, await getAttachmentsWithUrlsForMany(type, [...ids])] as const)
  );
  const attachmentsByType = new Map(attachmentsByTypeResults);
  function relatedAttachmentsFor(r: (typeof allRequests)[number]): AttachmentWithUrl[] {
    if (!r.source_type || !r.source_id) return [];
    return attachmentsByType.get(r.source_type)?.[r.source_id] ?? [];
  }

  const ownAttachmentsByRequestRaw = await getAttachmentsWithUrlsForMany(SIGNATURE_REQUEST_DOCUMENT_SOURCE, allRequests.map((r) => r.id));
  const ownAttachmentsByRequest = new Map<string, AttachmentWithUrl[]>(Object.entries(ownAttachmentsByRequestRaw));

  const incoming: SignatureRequestRow[] = allRequests
    .filter((r) => r.signer_user_id === userId)
    .map((r) => ({
      ...r,
      counterpart_name: userMap.get(r.requested_by_user_id)?.full_name ?? "-",
      counterpart_email: userMap.get(r.requested_by_user_id)?.email ?? "-",
      relatedAttachments: relatedAttachmentsFor(r),
      ownAttachments: ownAttachmentsByRequest.get(r.id) ?? [],
      journeySteps: r.source_type === EXTENSION_REQUEST_SOURCE && r.source_id ? buildJourneySteps(r.source_id, allRequests) : null,
    }));

  const outgoing: SignatureRequestRow[] = allRequests
    .filter((r) => r.requested_by_user_id === userId)
    .map((r) => ({
      ...r,
      counterpart_name: userMap.get(r.signer_user_id)?.full_name ?? "-",
      counterpart_email: userMap.get(r.signer_user_id)?.email ?? "-",
      relatedAttachments: relatedAttachmentsFor(r),
      ownAttachments: ownAttachmentsByRequest.get(r.id) ?? [],
      journeySteps: r.source_type === EXTENSION_REQUEST_SOURCE && r.source_id ? buildJourneySteps(r.source_id, allRequests) : null,
    }));

  const pendingIncoming = incoming.filter((r) => r.status_code === "pending").length;
  const pendingOutgoing = outgoing.filter((r) => r.status_code === "pending").length;
  const totalSigned = [...incoming, ...outgoing].filter((r) => r.status_code === "signed").length;

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={PenTool}
        color="bg-teal-600"
        eyebrow={t("title")}
        title={t("title")}
        subtitle={t("subtitle")}
      />

      <main className="px-8 py-8 space-y-8 max-w-5xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label={t("statNeedMySignature")} value={pendingIncoming} color="amber" />
          <StatCard label={t("statWaitingSigner")} value={pendingOutgoing} color="blue" />
          <StatCard label={t("statTotalSigned")} value={totalSigned} color="green" />
        </div>

        <section className="rounded-2xl border border-white/70 bg-white/78 backdrop-blur-xl p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_28px_-14px_rgba(15,23,42,0.10)]">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">{t("mySignature")}</h2>
          <SignatureSection currentSignatureUrl={mySignatureUrl} />
        </section>

        <div className="flex justify-end">
          <RequestForm users={otherUsers} />
        </div>

        <ExpandableSection title={t("incomingTitle", { count: incoming.length })}>
          <RequestList requests={incoming} mode="incoming" emptyText={t("incomingEmpty")} />
        </ExpandableSection>

        <ExpandableSection title={t("outgoingTitle", { count: outgoing.length })}>
          <RequestList requests={outgoing} mode="outgoing" emptyText={t("outgoingEmpty")} />
        </ExpandableSection>
      </main>
    </div>
  );
}
