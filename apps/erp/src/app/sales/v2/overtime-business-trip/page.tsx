import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { loadOtClaims } from "@/features/sales-v2/ot-claims-data";
import { OtClaimsWorkspace } from "@/features/sales-v2/ot-claims-workspace";

export const metadata = { title: "Overtime & Business Trip (V2)" };

// Same access as V1 (/pmo/overtime-business-trip): PMO, Sales, Finance and HR open the page. Each step's controls
// show only to Editors of the division whose V1 action runs it; delete needs PMO Full. The actions check again.
export default async function SalesV2OvertimePage() {
  const session = await getServerSession(authOptions);
  const claims = claimsOf(session?.user);
  const level = (d: string) => divisionLevel(claims, d) ?? "";
  const editor = (d: string) => ["editor", "full"].includes(level(d));
  const roles = { pmo: editor("pmo"), sales: editor("sales"), finance: editor("finance"), hr: editor("hr"), pmoFull: level("pmo") === "full" };
  const access = { canEdit: roles.pmo || roles.sales || roles.finance || roles.hr, canDelete: roles.pmoFull };
  const { claims: records, opportunities, employees } = await loadOtClaims();
  return (
    <Suspense>
      <OtClaimsWorkspace records={records} access={access} roles={roles} options={{ opportunities, employees }} />
    </Suspense>
  );
}
