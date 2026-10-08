import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { safeSalesReturnPath } from "@/lib/safe-return";
import { loadDealPage } from "@/features/sales-v2/journey-data";
import { DealPage } from "@/features/sales-v2/deal-page";

export const metadata = { title: "Opportunity (V2)" };

// The Opportunity's full record page: same access as the Tracker (the /sales route gate opens it, editor/full edit).
export default async function SalesV2OpportunityPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return_to?: string }>;
}) {
  const [{ id }, { return_to }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await getServerSession(authOptions);
  const level = divisionLevel(claimsOf(session?.user), "sales");
  const data = await loadDealPage(id);
  if (!data) notFound();
  return (
    <DealPage
      data={data}
      access={{ canEdit: level === "editor" || level === "full", canDelete: level === "full" }}
      returnTo={safeSalesReturnPath(return_to, `/sales/v2/opportunity-tracker?record=${id}`)}
    />
  );
}
