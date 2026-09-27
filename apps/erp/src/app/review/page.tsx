// Tinjau (doc 18 §17): the "menunggu saya" queue — ERP records waiting for the signed-in user's decision.
import { sql } from "@/db";
import { reviewQueue } from "@/lib/review/queue";
import { sessionReviewActor } from "@/lib/review/session";
import { ReviewQueue } from "@/components/mobile/review/queue";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const items = await reviewQueue(sql, await sessionReviewActor());
  return <ReviewQueue items={items} initialOpen={typeof open === "string" ? open : null} />;
}
