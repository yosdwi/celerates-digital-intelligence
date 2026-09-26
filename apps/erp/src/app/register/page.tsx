import { db } from "@/db";
import { divisions } from "@/db/schema";
import { RegisterForm } from "./register-form";

export default async function RegisterPage() {
  const divisionOptions = await db.select({ id: divisions.id, name: divisions.name }).from(divisions);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-500">Celerates ERP</p>
          <h1 className="text-2xl font-semibold text-slate-900 mt-1">Daftar Akun</h1>
          <p className="text-sm text-slate-500 mt-1">Akun baru butuh persetujuan Owner sebelum bisa dipakai.</p>
        </div>
        <RegisterForm divisionOptions={divisionOptions} />
      </div>
    </div>
  );
}