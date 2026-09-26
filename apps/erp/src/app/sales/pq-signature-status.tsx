"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { sendPqForSignature } from "./actions";
import type { SignerOption } from "@/lib/approval-journey";
import { MultiFileUpload } from "@/components/multi-file-upload";
import type { AttachmentWithUrl } from "@/lib/attachments";

export type PqSignatureInfo = {
  status: "not_sent" | "pending" | "signed" | "rejected";
  signerName: string | null;
};

const STATUS_STYLES: Record<PqSignatureInfo["status"], string> = {
  not_sent: "text-slate-400",
  pending: "text-amber-600",
  signed: "text-green-600",
  rejected: "text-red-600",
};
export function PqSignatureStatus({
  opportunityId,
  info,
  userOptions,
  existingDocs,
  pqNo,
}: {
  opportunityId: string;
  info: PqSignatureInfo;
  userOptions: SignerOption[];
  existingDocs: AttachmentWithUrl[];
  pqNo: string | null;
}) {
  const t = useTranslations("sales.pqTracker");
  const STATUS_LABELS: Record<PqSignatureInfo["status"], string> = {
    not_sent: t("sig.notSent"),
    pending: t("sig.pending"),
    signed: t("sig.signed"),
    rejected: t("sig.rejected"),
  };
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      setError(null);
      const result = await sendPqForSignature(opportunityId, fd);
      if (!result.ok) { setError(result.error); return; }
      setOpen(false);
    });
  }

  if (info.status === "not_sent" && !pqNo) {
    return <span className="text-xs text-slate-400">{t("sig.fillPqNumberFirst")}</span>;
  }

  if (info.status === "not_sent" && !open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs font-medium text-brand-600 hover:underline">
        {t("sig.sendToSignature")}
      </button>
    );
  }

  if (info.status === "not_sent" && open) {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5 min-w-[240px] bg-slate-50 p-2 rounded-lg border border-slate-200">
        <MultiFileUpload
          name="pq_attachments"
          label={t("sig.pqDocument")}
          existingFiles={existingDocs.map((a) => ({ id: a.id, file_name: a.file_name, url: a.url, kind: a.kind }))}
        />
        <select name="signer_user_id" required className="rounded border border-slate-300 px-2 py-1 text-xs">
          <option value="">{t("sig.chooseSigner")}</option>
          {userOptions.map((u) => (
            <option key={u.id} value={u.id}>{u.full_name} ({u.email})</option>
          ))}
        </select>
        {error && <p className="text-[11px] text-red-600">{error}</p>}
        <div className="flex gap-1.5">
          <button type="submit" disabled={isPending} className="rounded bg-brand-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">
            {isPending ? t("sig.sending") : t("sig.send")}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">
            {t("sig.cancel")}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className={`text-xs font-medium ${STATUS_STYLES[info.status]}`}>{STATUS_LABELS[info.status]}</span>
      {info.signerName && <span className="text-[11px] text-slate-400">{t("sig.signerLabel")}: {info.signerName}</span>}
      {info.status === "pending" && (
        <Link href="/ttd-online" className="text-[11px] font-medium text-brand-600 hover:underline">
          {t("sig.viewInSignature")}
        </Link>
      )}
    </div>
  );
}
