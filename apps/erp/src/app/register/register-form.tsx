"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registerUser } from "./actions";
import Link from "next/link";

export function RegisterForm({ divisionOptions }: { divisionOptions: { id: string; name: string }[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountType, setAccountType] = useState<"backoffice" | "talent">("backoffice");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await registerUser(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/login?registered=1");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
      <Field label="Nama Lengkap" name="full_name" required />
      <Field label="Role / Jabatan" name="role_title" />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">Tipe Akun <span className="text-red-500">*</span></span>
        <select
          name="account_type"
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as "backoffice" | "talent")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="backoffice">Backoffice</option>
          <option value="talent">Talent</option>
        </select>
        <span className="mt-1 block text-xs text-slate-400">
          {accountType === "talent"
            ? "Akun Talent cuma bisa akses modul Timesheet (submit & convert timesheet), tanpa perlu pilih divisi."
            : "Akun Backoffice untuk karyawan internal, sesuai divisi yang dipilih di bawah."}
        </span>
      </label>

      {accountType === "backoffice" && (
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">Divisi <span className="text-red-500">*</span></span>
          <select name="requested_division_id" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">- pilih -</option>
            {divisionOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
      )}

      <Field label="Email" name="email" type="email" required />
      <Field label="Password" name="password" type="password" required />
      <Field label="Konfirmasi Password" name="confirm_password" type="password" required />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button type="submit" disabled={isPending} className="w-full rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50">
        {isPending ? "Mendaftar..." : "Daftar"}
      </button>

      <p className="text-center text-sm text-slate-500">
        Sudah punya akun? <Link href="/login" className="text-brand-600 hover:underline">Login</Link>
      </p>
    </form>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label} {required && <span className="text-red-500">*</span>}</span>
      <input name={name} type={type} required={required} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500" />
    </label>
  );
}