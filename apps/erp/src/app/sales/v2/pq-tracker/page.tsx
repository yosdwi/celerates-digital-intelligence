import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { loadSheetSync } from "@/features/sales-v2/data";
import { loadPqWorkspace } from "@/features/sales-v2/pq-data";
import { PqWorkspace } from "@/features/sales-v2/pq-workspace";

export const metadata = { title: "PQ Tracker (V2)" };

// Same access as V1 (/sales): the route gate decides who opens the page; editor/full may change data, full may delete,
// and every server action checks again on its own.
export default async function SalesV2PqTrackerPage() {
  const session = await getServerSession(authOptions);
  const level = divisionLevel(claimsOf(session?.user), "sales");
  const access = { canEdit: level === "editor" || level === "full", canDelete: level === "full" };
  const [{ records, options }, sheetSync] = await Promise.all([loadPqWorkspace(), access.canEdit ? loadSheetSync("sales", claimsOf(session?.user).isOwner, access.canDelete) : null]);
  return (
    <Suspense>
      <PqWorkspace records={records} access={access} options={options} sheetSync={sheetSync} />
    </Suspense>
  );
}
