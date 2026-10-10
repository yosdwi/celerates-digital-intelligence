import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { loadClientActive } from "@/features/sales-v2/client-active-data";
import { ClientActiveWorkspace } from "@/features/sales-v2/client-active-workspace";

export const metadata = { title: "Client Active (V2)" };

// Same access as V1 (/ta/client-active): Sales and TA open the page; V1's update action needs editor of either, so
// only those see the controls, and the action checks again on its own.
export default async function SalesV2ClientActivePage() {
  const session = await getServerSession(authOptions);
  const claims = claimsOf(session?.user);
  const editor = (d: string) => ["editor", "full"].includes(divisionLevel(claims, d) ?? "");
  const access = { canEdit: editor("sales") || editor("ta"), canDelete: false };
  const records = await loadClientActive();
  return (
    <Suspense>
      <ClientActiveWorkspace records={records} access={access} />
    </Suspense>
  );
}
