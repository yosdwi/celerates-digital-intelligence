"use client";
import { useState, useTransition } from "react";
import { resendInvite } from "./actions";

/** For an invited account that has not set a password yet. */
export function ResendInviteButton({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center rounded-full whitespace-nowrap bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">Belum aktivasi</span>
      <button type="button" disabled={pending} onClick={() => start(async () => { const r = await resendInvite(userId); setNote(r.ok ? "Terkirim" : r.error); })}
        className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
        {pending ? "Mengirim…" : note ?? "Kirim ulang undangan"}
      </button>
    </span>
  );
}
