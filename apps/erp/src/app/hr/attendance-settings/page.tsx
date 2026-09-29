import { db } from "@/db";
import { leaveTypes, attendanceApprovalSteps, users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { PageHeader } from "@/components/page-header";
import { Settings } from "lucide-react";
import { createLeaveType, addApprovalStep } from "./actions";
import { LeaveTypeToggle, DeleteLeaveTypeButton, ApprovalStepControls } from "./settings-controls";

export default async function AttendanceSettingsPage() {
  const [types, steps, userOptions] = await Promise.all([
    db.select().from(leaveTypes).orderBy(asc(leaveTypes.sort_order)),
    db
      .select({
        id: attendanceApprovalSteps.id,
        step_order: attendanceApprovalSteps.step_order,
        approver_name: users.full_name,
      })
      .from(attendanceApprovalSteps)
      .leftJoin(users, eq(attendanceApprovalSteps.approver_user_id, users.id))
      .orderBy(asc(attendanceApprovalSteps.step_order)),
    db.select({ id: users.id, full_name: users.full_name }).from(users).where(eq(users.status, "active")),
  ]);

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={Settings}
        color="bg-teal-500"
        eyebrow="HR"
        title="Attendance Settings"
        subtitle="Setup jenis Time Off & alur approval berjenjang untuk modul Attendance"
      />

      <main className="px-8 py-8 space-y-8 max-w-4xl mx-auto">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">Leave Types</h2>

          <form action={createLeaveType} className="flex items-end gap-3 mb-5 flex-wrap">
            <label className="block flex-1 min-w-[200px]">
              <span className="mb-1 block text-xs font-medium text-slate-600">Nama jenis Time Off</span>
              <input name="name" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="mis. Cuti Tahunan" />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600 pb-2">
              <input type="checkbox" name="requires_file" className="rounded" /> Wajib upload file
            </label>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Tambah
            </button>
          </form>

          <div className="divide-y divide-slate-100">
            {types.length === 0 && <p className="text-sm text-slate-400 py-4">Belum ada jenis Time Off.</p>}
            {types.map((t) => (
              <div key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{t.name}</p>
                  {t.requires_file && <p className="text-[11px] text-slate-400">Wajib upload file</p>}
                </div>
                <div className="flex items-center gap-3">
                  <LeaveTypeToggle id={t.id} isActive={t.is_active} />
                  <DeleteLeaveTypeButton id={t.id} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-800 mb-1">Approval Chain</h2>
          <p className="text-xs text-slate-400 mb-4">
            Urutan approver di bawah ini berlaku untuk SEMUA request Time Off. Perubahan di sini tidak mengubah request yang sudah disubmit sebelumnya.
          </p>

          <form action={addApprovalStep} className="flex items-end gap-3 mb-5 flex-wrap">
            <label className="block flex-1 min-w-[200px]">
              <span className="mb-1 block text-xs font-medium text-slate-600">Tambah approver (jadi step terakhir)</span>
              <select name="approver_user_id" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">- pilih user -</option>
                {userOptions.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </label>
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
              Tambah
            </button>
          </form>

          <div className="divide-y divide-slate-100">
            {steps.length === 0 && <p className="text-sm text-amber-600 py-4">Belum ada approval chain -- karyawan belum bisa submit Time Off sampai ini di-setup.</p>}
            {steps.map((s, idx) => (
              <div key={s.id} className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{s.step_order}</span>
                  <p className="text-sm font-medium text-slate-800">{s.approver_name ?? "-"}</p>
                </div>
                <ApprovalStepControls id={s.id} isFirst={idx === 0} isLast={idx === steps.length - 1} />
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
