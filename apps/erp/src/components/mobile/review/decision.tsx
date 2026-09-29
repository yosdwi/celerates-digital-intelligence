"use client";
// Review decisions on a phone (doc 18 §17). The buttons call the same server actions as desktop — TTD Online
// (signRequest / rejectRequest) and Time Off (approveTimeOffStep / rejectTimeOffStep) — which re-check the signer or
// current approver and the pending state. Approving is always a deliberate second tap in a confirmation sheet.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { rejectRequest, signRequest } from "@/app/ttd-online/actions";
import { approveTimeOffStep, rejectTimeOffStep } from "@/app/attendance/time-off/[id]/actions";
import { useMobileData } from "../data";
import { BottomSheet } from "../primitives";
import { buttonClass } from "../styles";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] text-j-ink outline-none focus:border-j-accent";
type Result = { ok: true } | { ok: false; error: string };

function Decision({
  approveLabel,
  confirmTitle,
  confirmBody,
  onApprove,
  onReject,
  rejectRequired,
  blocked,
  kind,
}: {
  approveLabel: string;
  confirmTitle: string;
  confirmBody: string;
  onApprove: () => Promise<Result>;
  onReject: (reason: string) => Promise<Result>;
  rejectRequired?: boolean;
  blocked?: React.ReactNode;
  kind: string;
}) {
  const t = useTranslations("mobile.review");
  const router = useRouter();
  const { refresh } = useMobileData();
  const [sheet, setSheet] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (action: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) return setError(result.error);
      setSheet(null);
      refresh();
      router.push("/review");
      router.refresh();
    });
  return (
    <>
      <button type="button" onClick={() => setSheet("reject")} data-action={`${kind}-reject`} className={buttonClass.secondary}>
        <X aria-hidden className="h-[18px] w-[18px]" />
        {t("reject")}
      </button>
      <button type="button" onClick={() => setSheet("approve")} data-action={`${kind}-approve`} className={buttonClass.primary}>
        <Check aria-hidden className="h-[18px] w-[18px]" />
        {approveLabel}
      </button>
      <BottomSheet
        open={sheet === "approve"}
        onClose={() => setSheet(null)}
        title={confirmTitle}
        footer={
          blocked ? undefined : (
            <>
              <button type="button" onClick={() => setSheet(null)} className={buttonClass.secondary}>
                {t("cancel")}
              </button>
              <button type="button" disabled={pending} onClick={() => run(onApprove)} data-action={`${kind}-confirm`} className={buttonClass.primary}>
                {pending ? "…" : approveLabel}
              </button>
            </>
          )
        }
      >
        <div className="flex flex-col gap-3 pb-1 text-sm">
          {blocked ?? <p className="text-j-muted">{confirmBody}</p>}
          {error && <p role="alert" className="font-semibold text-[#a8261c]">{error}</p>}
        </div>
      </BottomSheet>
      <BottomSheet
        open={sheet === "reject"}
        onClose={() => setSheet(null)}
        title={t("rejectTitle")}
        footer={
          <>
            <button type="button" onClick={() => setSheet(null)} className={buttonClass.secondary}>
              {t("cancel")}
            </button>
            <button
              type="button"
              disabled={pending || (rejectRequired && !reason.trim())}
              onClick={() => run(() => onReject(reason.trim()))}
              data-action={`${kind}-reject-confirm`}
              className={`${buttonClass.primary} !bg-[#b3261e] disabled:opacity-50`}
            >
              {pending ? "…" : t("reject")}
            </button>
          </>
        }
      >
        <label className="flex flex-col pb-1 text-sm font-semibold">
          {rejectRequired ? t("reasonRequired") : t("reasonOptional")}
          <textarea name="reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
        </label>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#a8261c]">{error}</p>}
      </BottomSheet>
    </>
  );
}

export function SignatureDecision({ id, hasSignature }: { id: string; hasSignature: boolean }) {
  const t = useTranslations("mobile.review");
  return (
    <Decision
      kind="signature"
      approveLabel={t("sign")}
      confirmTitle={t("signTitle")}
      confirmBody={t("signBody")}
      blocked={
        hasSignature ? undefined : (
          <div className="flex flex-col gap-3" data-signature-missing>
            <p className="text-j-muted">{t("noSignature")}</p>
            <Link href="/ttd-online" className={buttonClass.primary}>
              {t("createSignature")}
            </Link>
          </div>
        )
      }
      onApprove={() => signRequest(id)}
      onReject={(reason) => {
        const data = new FormData();
        if (reason) data.set("reject_reason", reason);
        return rejectRequest(id, data);
      }}
    />
  );
}

export function TimeOffDecision({ id }: { id: string }) {
  const t = useTranslations("mobile.review");
  return (
    <Decision
      kind="time-off"
      approveLabel={t("approve")}
      confirmTitle={t("approveTitle")}
      confirmBody={t("approveBody")}
      onApprove={async () => {
        const r = await approveTimeOffStep(id);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      onReject={async (reason) => {
        const r = await rejectTimeOffStep(id, reason);
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
    />
  );
}
