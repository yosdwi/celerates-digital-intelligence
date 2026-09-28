// Tinjau (doc 18 §17): the "menunggu saya" queue — ERP records waiting for the signed-in user's decision.
import { sql } from "@/db";
import { reviewQueue } from "@/lib/review/queue";
import { conformReviewItems } from "@/lib/review/conform";
import { sessionReviewActor } from "@/lib/review/session";
import { ReviewQueue } from "@/components/mobile/review/queue";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const actor = await sessionReviewActor();
  const [erp, conform] = await Promise.all([reviewQueue(sql, actor), conformReviewItems(actor)]);
  const items = [...erp, ...conform.items].sort((a, b) => a.since.localeCompare(b.since));
  return <ReviewQueue items={items} initialOpen={typeof open === "string" ? open : null} conformUnavailable={conform.unavailable} />;
}
