import { db } from "@/db";
import { leaveTypes, users } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import Link from "next/link";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Field, SelectField } from "@/components/form-fields";
import { MultiFileUpload } from "@/components/multi-file-upload";
import { createTimeOffRequest } from "./actions";

export default async function RequestTimeOffPage() {
  const [types, userOptions] = await Promise.all([
    db.select().from(leaveTypes).where(eq(leaveTypes.is_active, true)).orderBy(asc(leaveTypes.sort_order)),
    db.select({ id: users.id, full_name: users.full_name }).from(users).where(eq(users.status, "active")),
  ]);

  const typeOptions = types.map((t) => [t.id, t.name] as [string, string]);
  const delegateOptions = userOptions.map((u) => [u.id, u.full_name] as [string, string]);

  return (
    <div className="min-h-screen">
      <PageHeader icon={Clock} color="bg-indigo-500" eyebrow="Attendance" title="Request Time Off">
        <Link href="/attendance/time-off" className="text-sm font-medium text-brand-600 hover:underline">&larr; Kembali</Link>
      </PageHeader>

      <main className="px-8 py-8 max-w-2xl mx-auto">
        {types.length === 0 ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Belum ada jenis Time Off yang di-setup HR. Hubungi HR dulu.
          </div>
        ) : (
          <form action={createTimeOffRequest} className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="sm:col-span-2">
              <SelectField label="Time off type" name="leave_type_id" options={typeOptions} required />
            </div>
            <Field label="Tanggal mulai" name="start_date" type="date" required />
            <Field label="Tanggal selesai" name="end_date" type="date" required />
            <div className="sm:col-span-2">
              <Field label="Alasan" name="reason" textarea />
            </div>
            <div className="sm:col-span-2">
              <SelectField label="Delegate to (opsional)" name="delegate_user_id" options={delegateOptions} />
              <p className="mt-1 text-xs text-slate-400">Informasi siapa yang menggantikan tugas Anda -- belum mempengaruhi alur approval.</p>
            </div>
            <div className="sm:col-span-2">
              <MultiFileUpload name="attachment" label="Upload file (opsional, mis. surat dokter)" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="w-full rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
                Submit request
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
