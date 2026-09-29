// An Agent proposal waiting for the user's confirmation (ADR-010, doc 18 §17). The card is the ERP-held proposal;
// confirming re-validates every item with the user's current authority. The Agent never applies it.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MobileScreen } from "@/components/mobile/primitives";
import { RecordHeader } from "@/components/mobile/record";
import { ProposalReview } from "@/components/mobile/review/proposal";
import { sessionReviewActor } from "@/lib/review/session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProposalReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  await sessionReviewActor();
  const t = await getTranslations("mobile.review");
  const tm = await getTranslations("mobile");
  return (
    <MobileScreen label={t("kinds.proposal")}>
      <RecordHeader back={{ href: "/review", label: tm("tabs.review") }} eyebrow={t("kinds.proposal")} title={t("proposalTitle")} subtitle={t("proposalBody")} />
      <ProposalReview id={id.toLowerCase()} />
    </MobileScreen>
  );
}
