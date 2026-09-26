import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { timeOffRequests, timeOffApprovalSteps, leaveTypes, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Clock, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { TimeOffTabs } from "./time-off-tabs";

export default async function TimeOffPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string;

  const [myRequestsRaw, approvalsRaw] = await Promise.all([
    db
      .select({
        id: timeOffRequests.id,
        leave_type_name: leaveTypes.name,
        start_date: timeOffRequests.start_date,
        end_date: timeOffRequests.end_date,
        status_code: timeOffRequests.status_code,
      })
      .from(timeOffRequests)
      .leftJoin(leaveTypes, eq(timeOffRequests.leave_type_id, leaveTypes.id))
      .where(eq(timeOffRequests.user_id, userId))
      .orderBy(desc(timeOffRequests.created_at)),
    db
      .select({
        id: timeOffRequests.id,
        leave_type_name: leaveTypes.name,
        start_date: timeOffRequests.start_date,
        end_date: timeOffRequests.end_date,
        status_code: timeOffRequests.status_code,
        requester_name: users.full_name,
      })
      .from(timeOffApprovalSteps)
      .innerJoin(timeOffRequests, eq(timeOffApprovalSteps.request_id, timeOffRequests.id))
      .leftJoin(users, eq(timeOffRequests.user_id, users.id))
      .leftJoin(leaveTypes, eq(timeOffRequests.leave_type_id, leaveTypes.id))
      .where(eq(timeOffApprovalSteps.approver_user_id, userId))
      .orderBy(desc(timeOffRequests.created_at)),
  ]);

  // Dedup approvalsRaw (bisa lebih dari 1 baris kalau approver sama dipakai di lebih dari 1 step nomor beda -- jarang tapi jaga-jaga).
  const seen = new Set<string>();
  const approvals = approvalsRaw.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));

  return (
    <div className="min-h-screen">
      <PageHeader icon={Clock} color="bg-indigo-500" eyebrow="Attendance" title="Time Off">
        <Link href="/attendance" className="text-sm font-medium text-brand-600 hover:underline">&larr; Kembali</Link>
        <Link href="/attendance/time-off/request" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-brand-700 transition-colors">
          <Plus className="h-3.5 w-3.5" /> Request
        </Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-3xl mx-auto">
        <TimeOffTabs myRequests={myRequestsRaw} approvals={approvals} />
      </main>
    </div>
  );
}
