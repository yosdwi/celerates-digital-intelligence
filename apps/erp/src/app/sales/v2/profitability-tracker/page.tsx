import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { loadProfitability } from "@/features/sales-v2/profitability-data";
import { parsePeriod } from "@/features/sales-v2/profitability-model";
import { ProfitabilityWorkspace } from "@/features/sales-v2/profitability-workspace";

export const metadata = { title: "Profitability Tracker (V2)" };

// Same access as V1 (/sales/profitability-tracker): Sales, TM and PMO open the page; V1's sync needs editor of any of
// them, so only those see the button, and the action checks again on its own.
export default async function SalesV2ProfitabilityPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const period = parsePeriod((await searchParams).period);
  const session = await getServerSession(authOptions);
  const claims = claimsOf(session?.user);
  const editor = (d: string) => ["editor", "full"].includes(divisionLevel(claims, d) ?? "");
  const access = { canEdit: ["sales", "tm", "pmo"].some(editor), canDelete: false };
  const records = await loadProfitability(period);
  return (
    <Suspense>
      <ProfitabilityWorkspace records={records} access={access} period={period} />
    </Suspense>
  );
}
