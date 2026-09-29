"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { createSignatureRequest } from "./actions";
import { LinkOrFileField } from "@/components/link-or-file-field";
import { MultiFileUpload } from "@/components/multi-file-upload";

type UserOption = { id: string; full_name: string; email: string };

export function RequestForm({ users }: { users: UserOption[] }) {
  const t = useTranslations("ttd");
  const tc = useTranslations("common");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
        {t("createRequest")}
      </button>
    );
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await createSignatureRequest(fd);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
      (e.target as HTMLFormElement).reset();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-brand-200 bg-brand-50/40 p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t("documentTitle")} <span className="text-red-500">*</span></span>
          <input name="document_title" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="mis. PKS Klien X - 2026" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700">{t("signerEmail")} <span className="text-red-500">*</span></span>
          <select name="signer_user_id" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="">{t("selectUserOption")}</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
            ))}
          </select>
        </label>
      </div>

      <LinkOrFileField label={t("mainDocument")} urlName="document_url" fileName="document_file" />
      <MultiFileUpload name="attachments" label={t("supportingDocuments")} />

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">{t("notes")}</span>
        <textarea name="notes" rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </label>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={isPending} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {isPending ? t("sending") : t("sendRequest")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          {tc("cancel")}
        </button>
      </div>
    </form>
  );
}
