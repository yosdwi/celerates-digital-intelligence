import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { loadAccountWorkspace } from "@/features/sales-v2/account-data";
import { AccountWorkspace } from "@/features/sales-v2/account-workspace";

export const metadata = { title: "Account (CRM) (V2)" };

// Same access as V1 (/sales/accounts): Sales and Marketing open the page; V1's CRM actions need Sales editor (delete:
// Sales full), so only those see the controls, and every action checks again on its own.
export default async function SalesV2AccountsPage() {
  const session = await getServerSession(authOptions);
  const level = divisionLevel(claimsOf(session?.user), "sales");
  const access = { canEdit: level === "editor" || level === "full", canDelete: level === "full" };
  const records = await loadAccountWorkspace();
  return (
    <Suspense>
      <AccountWorkspace records={records} access={access} />
    </Suspense>
  );
}
