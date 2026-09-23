"use client";
import { useFormStatus } from "react-dom";

/**
 * Tombol submit generik yang menunjukkan status "Menyimpan..." selama Server
 * Action masih berjalan -- supaya form yang lambat (network/DB) tidak terlihat
 * seperti macet/gagal tanpa umpan balik apa pun.
 */
export function SubmitButton({ label = "Simpan", pendingLabel = "Menyimpan...", className }: {
  label?: string;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={className ?? "rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 disabled:cursor-wait"}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
