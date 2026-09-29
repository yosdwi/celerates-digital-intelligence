// Beranda search (doc 18 §17): pages, ERP records and Company Files the user may open, plus "Tanya Agent".
import { requirePilotActor } from "@/lib/actor";
import { MobileSearch } from "@/components/mobile/search";

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePilotActor();
  const { q } = await searchParams;
  return <MobileSearch initialQuery={typeof q === "string" ? q.slice(0, 100) : ""} />;
}
