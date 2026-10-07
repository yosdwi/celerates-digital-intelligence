import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { loadOpportunityWorkspace } from "@/features/sales-v2/data";
import { OpportunityWorkspace } from "@/features/sales-v2/workspace";

export const metadata = { title: "Opportunity Tracker (V2)" };

// Same access as V1: the /sales route gate decides who opens the page; editor/full may change data, full may delete,
// and every server action checks again on its own.
export default async function SalesV2OpportunityTrackerPage() {
  const session = await getServerSession(authOptions);
  const level = divisionLevel(claimsOf(session?.user), "sales");
  const access = { canEdit: level === "editor" || level === "full", canDelete: level === "full" };
  const { records, ...options } = await loadOpportunityWorkspace();
  return (
    <Suspense>
      <OpportunityWorkspace records={records} access={access} options={options} />
    </Suspense>
  );
}
