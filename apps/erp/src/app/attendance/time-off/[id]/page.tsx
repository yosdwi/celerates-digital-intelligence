import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/db";
import { timeOffRequests, timeOffApprovalSteps, leaveTypes, users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Pill, type PillVariant } from "@/components/pill";
import { getAttachmentsWithUrls } from "@/lib/attachments";
import { TIME_OFF_REQUEST_SOURCE } from "../../constants";
import { ApproveRejectButtons, CancelButton } from "./detail-actions";

const STATUS_LABEL: Record<string, string> = { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" };
const STATUS_VARIANT: Record<string, PillVariant> = { pending: "neutral", approved: "success", rejected: "critical", cancelled: "neutral" };

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Jakarta" }).format(new Date(dateStr + "T00:00:00"));
}

export default async function TimeOffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const userId = (session.user as any).id as string;

  const [request] = await db
    .select({
      id: timeOffRequests.id,
      user_id: timeOffRequests.user_id,
      requester_name: users.full_name,
      leave_type_name: leaveTypes.name,
      start_date: timeOffRequests.start_date,
      end_date: timeOffRequests.end_date,
      reason: timeOffRequests.reason,
      status_code: timeOffRequests.status_code,
      created_at: timeOffRequests.created_at,
    })
    .from(timeOffRequests)
    .leftJoin(users, eq(timeOffRequests.user_id, users.id))
    .leftJoin(leaveTypes, eq(timeOffRequests.leave_type_id, leaveTypes.id))
    .where(eq(timeOffRequests.id, id));
  if (!request) notFound();

  const stepsRaw = await db
    .select({
      id: timeOffApprovalSteps.id,
      step_order: timeOffApprovalSteps.step_order,
      approver_user_id: timeOffApprovalSteps.approver_user_id,
      approver_name: users.full_name,
      status_code: timeOffApprovalSteps.status_code,
      acted_at: timeOffApprovalSteps.acted_at,
      notes: timeOffApprovalSteps.notes,
    })
    .from(timeOffApprovalSteps)
    .leftJoin(users, eq(timeOffApprovalSteps.approver_user_id, users.id))
    .where(eq(timeOffApprovalSteps.request_id, id))
    .orderBy(asc(timeOffApprovalSteps.step_order));

  const isRequester = request.user_id === userId;
  const isApprover = stepsRaw.some((s) => s.approver_user_id === userId);
  const isOwner = Boolean((session.user as any).isOwner);
  if (!isRequester && !isApprover && !isOwner) redirect("/attendance/time-off");

  const currentStep = stepsRaw.find((s) => s.status_code === "pending");
  const canAct = request.status_code === "pending" && currentStep?.approver_user_id === userId;

  const attachments = await getAttachmentsWithUrls(TIME_OFF_REQUEST_SOURCE, id);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Clock} color="bg-indigo-500" eyebrow="Attendance" title={request.leave_type_name ?? "Time Off"} subtitle={`Diajukan oleh ${request.requester_name ?? "-"}`}>
        <Link href="/attendance/time-off" className="text-sm font-medium text-brand-600 hover:underline">&larr; Kembali</Link>
        <Pill variant={STATUS_VARIANT[request.status_code]}>{STATUS_LABEL[request.status_code]}</Pill>
      </PageHeader>

      <main className="px-8 py-8 max-w-2xl mx-auto space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Tanggal</span><span className="font-medium text-slate-800">{formatDate(request.start_date)} - {formatDate(request.end_date)}</span></div>
          {request.reason && <div><span className="text-slate-500 block mb-1">Alasan</span><p className="text-slate-800">{request.reason}</p></div>}
          {attachments.length > 0 && (
            <div>
              <span className="text-slate-500 block mb-1">File</span>
              <div className="space-y-1">
                {attachments.map((a) => (
                  <a key={a.id} href={a.url ?? "#"} target="_blank" rel="noopener noreferrer" className="block text-brand-600 hover:underline text-xs">{a.file_name}</a>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold text-slate-800 mb-4">Approval Status</p>
          <div className="space-y-3">
            {stepsRaw.map((s) => (
              <div key={s.id} className="flex items-start gap-2">
                <span className={`mt-1 h-2 w-2 rounded-full flex-shrink-0 ${s.status_code === "approved" ? "bg-emerald-500" : s.status_code === "rejected" ? "bg-rose-500" : "bg-slate-300"}`} />
                <div className="text-sm">
                  <p className="text-slate-800">{s.approver_name ?? "-"}</p>
                  <p className="text-xs text-slate-400">
                    {s.status_code === "pending" ? "Menunggu approval" : s.status_code === "approved" ? "Disetujui" : "Ditolak"}
                    {s.notes ? ` -- ${s.notes}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {canAct && <ApproveRejectButtons requestId={id} />}
        {isRequester && request.status_code === "pending" && <CancelButton requestId={id} />}
      </main>
    </div>
  );
}
