import { db } from "@/db";
import { divisions } from "@/db/schema";
import { completeProfile } from "./actions";
import { SubmitButton } from "./submit-button";

export default async function OnboardingProfilePage() {
  const divisionOptions = await db.select({ id: divisions.id, name: divisions.name }).from(divisions);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-500">Celerates ERP</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">Lengkapi Profil</h1>
          <p className="text-sm text-slate-500 mt-1">Pilih divisi Anda untuk request akses ke Owner.</p>
        </div>

        <form action={completeProfile} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Role / Jabatan</span>
            <input name="role_title" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-slate-700">Divisi <span className="text-red-500">*</span></span>
            <select name="requested_division_id" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">- pilih -</option>
              {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>

          <SubmitButton />
        </form>
      </div>
    </div>
  );
}