"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { signRequest, rejectRequest, deleteSignatureRequest, deleteSignatureRequestAttachment } from "./actions";
import { SmartFileLink } from "@/components/smart-file-link";
import { Pill, type PillVariant } from "@/components/pill";
import type { AttachmentWithUrl } from "@/lib/attachments";
import { Paperclip, Link as LinkIcon, X, Check } from "lucide-react";

export type JourneyStep = { label: string; status: "upcoming" | "pending" | "signed" | "rejected" };

export type SignatureRequestRow = {
  id: string;
  document_title: string;
  document_url: string | null;
  status_code: string;
  reject_reason: string | null;
  notes: string | null;
  signed_at: Date | null;
  created_at: Date;
  counterpart_name: string;
  counterpart_email: string;
  relatedAttachments: AttachmentWithUrl[];
  ownAttachments: AttachmentWithUrl[];
  /** Cuma terisi untuk alur multi-step (Extension/Increment Request) -- null berarti single-step (TTD manual, PQ, Offering Letter). */
  journeySteps: JourneyStep[] | null;
};

const STATUS_VARIANT: Record<string, PillVariant> = { pending: "warning", signed: "success", rejected: "critical" };

/** Stepper multi-titik buat alur approval berjenjang (Extension/Increment Request). */
type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

function JourneyStepper({ steps, t }: { steps: JourneyStep[]; t: Translator }) {
  const doneCount = steps.filter((s) => s.status === "signed").length;
  const percent = Math.round((doneCount / steps.length) * 100);
  const hasRejected = steps.some((s) => s.status === "rejected");

  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500">{t("progressApproval")}</span>
        <span className={`text-sm font-bold ${hasRejected ? "text-rose-600" : "text-violet-600"}`}>{hasRejected ? t("rejected") : `${percent}%`}</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mb-3">
        <div
          className={`h-full rounded-full ${hasRejected ? "bg-rose-400" : "bg-gradient-to-r from-violet-600 to-pink-500"}`}
          style={{ width: `${Math.max(3, percent)}%` }}
        />
      </div>
      <div className="flex items-center">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  step.status === "signed" ? "bg-gradient-to-br from-violet-600 to-pink-500 text-white" :
                  step.status === "pending" ? "bg-amber-100 text-amber-700 ring-2 ring-amber-300" :
                  step.status === "rejected" ? "bg-rose-100 text-rose-700 ring-2 ring-rose-300" :
                  "bg-slate-100 text-slate-400"
                }`}
              >
                {step.status === "signed" ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className="text-[9px] text-slate-400 whitespace-nowrap">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 rounded-full ${step.status === "signed" ? "bg-violet-400" : "bg-slate-200"}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Indikator sederhana 2-titik buat alur single-step (TTD manual, PQ, Offering Letter). */
function SimpleProgress({ status, t }: { status: string; t: Translator }) {
  const percent = status === "signed" ? 100 : status === "rejected" ? 100 : 40;
  return (
    <div className="mt-3">
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full ${status === "rejected" ? "bg-rose-400" : status === "signed" ? "bg-gradient-to-r from-violet-600 to-pink-500" : "bg-amber-300"}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{t("requested")}</span>
        <span>{status === "rejected" ? t("rejected") : t("signed")}</span>
      </div>
    </div>
  );
}

export function RequestList({
  requests,
  mode,
  emptyText,
}: {
  requests: SignatureRequestRow[];
  mode: "incoming" | "outgoing";
  emptyText: string;
}) {
  const t = useTranslations("ttd");
  const tc = useTranslations("common");
  const [isPending, startTransition] = useTransition();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const STATUS_LABELS: Record<string, string> = { pending: t("statusPending"), signed: t("statusSigned"), rejected: t("statusRejected") };

  function handleSign(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await signRequest(id);
      if (!result.ok) setError(result.error);
    });
  }

  function handleReject(id: string, formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await rejectRequest(id, formData);
      if (!result.ok) setError(result.error);
      setRejectingId(null);
    });
  }

  function handleDelete(id: string) {
    if (!confirm("Hapus permintaan ini?")) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteSignatureRequest(id);
      if (!result.ok) setError(result.error);
    });
  }

  function handleDeleteAttachment(attachmentId: string) {
    startTransition(() => deleteSignatureRequestAttachment(attachmentId));
  }

  if (requests.length === 0) {
    return <p className="px-6 py-8 text-center text-sm text-slate-400">{emptyText}</p>;
  }

  return (
    <div className="divide-y divide-slate-100">
      {error && <p className="px-6 py-2 text-xs text-red-600">{error}</p>}
      {requests.map((r) => (
        <div key={r.id} className="px-6 py-5 hover:bg-violet-50/40 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-slate-900">{r.document_title}</p>
                <Pill variant={STATUS_VARIANT[r.status_code] ?? "neutral"}>{STATUS_LABELS[r.status_code] ?? r.status_code}</Pill>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {mode === "incoming" ? t("requestedBy") : t("signer")}: {r.counterpart_name} ({r.counterpart_email}) &middot; {r.created_at.toISOString().slice(0, 10)}
              </p>
              {r.notes && <p className="text-xs text-slate-500 mt-1">{t("notes")}: {r.notes}</p>}
              {r.status_code === "rejected" && r.reject_reason && (
                <p className="text-xs text-rose-600 mt-1">{t("rejectReason")}: {r.reject_reason}</p>
              )}
              {r.status_code === "signed" && r.signed_at && (
                <p className="text-xs text-emerald-600 mt-1">{t("signedAt")}: {r.signed_at.toISOString().slice(0, 10)}</p>
              )}

              {r.journeySteps ? <JourneyStepper steps={r.journeySteps} t={t} /> : <SimpleProgress status={r.status_code} t={t} />}

              <div className="mt-3">
                <SmartFileLink value={r.document_url} label={t("viewDocument")} />
              </div>
              {r.ownAttachments.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {r.ownAttachments.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/70 px-2.5 py-1 max-w-sm">
                      <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-violet-600 hover:underline truncate">
                        {a.kind === "link" ? <LinkIcon className="h-3.5 w-3.5 shrink-0" /> : <Paperclip className="h-3.5 w-3.5 shrink-0" />} {a.file_name}
                      </a>
                      {mode === "outgoing" && r.status_code === "pending" && (
                        <button onClick={() => handleDeleteAttachment(a.id)} className="text-slate-400 hover:text-red-600 shrink-0" title="Hapus">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {r.relatedAttachments.length > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 mb-1.5">
                    {t("relatedDocuments")}
                  </p>
                  <ul className="space-y-1">
                    {r.relatedAttachments.map((a) => (
                      <li key={a.id}>
                        <a href={a.url ?? "#"} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:underline">
                          <Paperclip className="h-3.5 w-3.5 shrink-0" /> {a.file_name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="shrink-0 flex flex-col items-end gap-1.5">
              {mode === "incoming" && r.status_code === "pending" && rejectingId !== r.id && (
                <div className="flex gap-2">
                  <button onClick={() => handleSign(r.id)} disabled={isPending} className="rounded-lg bg-gradient-to-br from-violet-600 to-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_6px_14px_-4px_rgba(124,58,237,0.5)] hover:shadow-[0_8px_18px_-4px_rgba(124,58,237,0.6)] active:scale-95 transition-all disabled:opacity-50">
                    {t("signAction")}
                  </button>
                  <button onClick={() => setRejectingId(r.id)} disabled={isPending} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50">
                    {t("rejectAction")}
                  </button>
                </div>
              )}
              {mode === "incoming" && rejectingId === r.id && (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleReject(r.id, new FormData(e.currentTarget)); }}
                  className="flex flex-col gap-1.5 min-w-[180px] bg-white border border-slate-200 p-2 rounded-lg"
                >
                  <input name="reject_reason" placeholder={t("rejectReasonPlaceholder")} className="rounded-lg border border-slate-200 px-2 py-1 text-xs focus:border-violet-400 focus:outline-none" />
                  <div className="flex gap-1.5">
                    <button type="submit" disabled={isPending} className="rounded-lg bg-rose-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-50">{t("send")}</button>
                    <button type="button" onClick={() => setRejectingId(null)} className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100">{tc("cancel")}</button>
                  </div>
                </form>
              )}
              {mode === "outgoing" && r.status_code === "pending" && (
                <button onClick={() => handleDelete(r.id)} disabled={isPending} className="text-xs font-medium text-rose-600 hover:underline disabled:opacity-50">
                  {t("delete")}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
