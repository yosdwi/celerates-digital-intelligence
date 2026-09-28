"use client";
// Tinjau decisions for ConForm-owned records (doc 19 §7–8). Both call server actions that check PMO level and then
// ConForm, which applies and re-validates. Approving is always a second, deliberate tap.
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, Pause, Play, Square, X } from "lucide-react";
import { approveCampaign, controlCampaign, decideCorrection } from "@/app/pmo/readiness/actions";
import { useMobileData } from "@/components/mobile/data";
import { BottomSheet } from "@/components/mobile/primitives";
import { buttonClass } from "@/components/mobile/styles";

const field = "mt-1 w-full rounded-xl border border-[#d5dbe5] bg-j-surface px-3 py-2.5 text-[15px] text-j-ink outline-none focus:border-j-accent";
const nonce = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random()}`).replace(/[^A-Za-z0-9_-]/g, "");

export function CorrectionDecision({ id }: { id: string }) {
  const t = useTranslations("mobile.review");
  const router = useRouter();
  const { refresh } = useMobileData();
  const [sheet, setSheet] = useState<"approve" | "reject" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (decision: "approve" | "reject") =>
    start(async () => {
      setError(null);
      const result = await decideCorrection(id, decision, reason);
      if (!result.ok) return setError(result.error);
      setSheet(null);
      refresh();
      router.push("/review");
      router.refresh();
    });
  return (
    <>
      <button type="button" onClick={() => setSheet("reject")} data-action="correction-reject" className={buttonClass.secondary}>
        <X aria-hidden className="h-[18px] w-[18px]" /> {t("reject")}
      </button>
      <button type="button" onClick={() => setSheet("approve")} data-action="correction-approve" className={buttonClass.primary}>
        <Check aria-hidden className="h-[18px] w-[18px]" /> {t("approve")}
      </button>
      <BottomSheet
        open={sheet === "approve"}
        onClose={() => setSheet(null)}
        title={t("correctionApproveTitle")}
        footer={
          <>
            <button type="button" onClick={() => setSheet(null)} className={buttonClass.secondary}>{t("cancel")}</button>
            <button type="button" disabled={pending} onClick={() => run("approve")} data-action="correction-confirm" className={buttonClass.primary}>{pending ? "…" : t("approve")}</button>
          </>
        }
      >
        <p className="pb-1 text-sm text-j-muted">{t("correctionApproveBody")}</p>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#a8261c]">{error}</p>}
      </BottomSheet>
      <BottomSheet
        open={sheet === "reject"}
        onClose={() => setSheet(null)}
        title={t("rejectTitle")}
        footer={
          <>
            <button type="button" onClick={() => setSheet(null)} className={buttonClass.secondary}>{t("cancel")}</button>
            <button type="button" disabled={pending || !reason.trim()} onClick={() => run("reject")} data-action="correction-reject-confirm" className={`${buttonClass.primary} !bg-[#b3261e] disabled:opacity-50`}>{pending ? "…" : t("reject")}</button>
          </>
        }
      >
        <label className="flex flex-col pb-1 text-sm font-semibold">
          {t("reasonRequired")}
          <textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={field} />
        </label>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#a8261c]">{error}</p>}
      </BottomSheet>
    </>
  );
}

export function CampaignControls({ id, state, canFull, willSend }: { id: string; state: string; canFull: boolean; willSend: number }) {
  const t = useTranslations("conform.campaign");
  const router = useRouter();
  const { refresh } = useMobileData();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) return setError(result.error ?? "");
      setConfirm(false);
      refresh();
      router.refresh();
    });
  return (
    <>
      {state === "draft" && canFull && (
        <>
          <button type="button" disabled={pending} onClick={() => act(() => controlCampaign(id, "stop", nonce()))} data-action="campaign-cancel" className={buttonClass.secondary}>
            <X aria-hidden className="h-[18px] w-[18px]" /> {t("cancel")}
          </button>
          <button type="button" onClick={() => setConfirm(true)} data-action="campaign-approve" className={buttonClass.primary}>
            <Check aria-hidden className="h-[18px] w-[18px]" /> {t("approve")}
          </button>
        </>
      )}
      {state === "running" && (
        <button type="button" disabled={pending} onClick={() => act(() => controlCampaign(id, "pause", nonce()))} data-action="campaign-pause" className={buttonClass.secondary}>
          <Pause aria-hidden className="h-[18px] w-[18px]" /> {t("pause")}
        </button>
      )}
      {state === "paused" && (
        <button type="button" disabled={pending} onClick={() => act(() => controlCampaign(id, "resume", nonce()))} data-action="campaign-resume" className={buttonClass.secondary}>
          <Play aria-hidden className="h-[18px] w-[18px]" /> {t("resume")}
        </button>
      )}
      {["running", "paused"].includes(state) && canFull && (
        <button type="button" disabled={pending} onClick={() => act(() => controlCampaign(id, "stop", nonce()))} data-action="campaign-stop" className={`${buttonClass.primary} !bg-[#b3261e]`}>
          <Square aria-hidden className="h-[18px] w-[18px]" /> {t("stop")}
        </button>
      )}
      {error && !confirm && <p role="alert" className="absolute -top-8 left-5 text-sm font-semibold text-[#a8261c]">{error}</p>}
      <BottomSheet
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("approveTitle")}
        footer={
          <>
            <button type="button" onClick={() => setConfirm(false)} className={buttonClass.secondary}>{t("back")}</button>
            <button type="button" disabled={pending} onClick={() => act(() => approveCampaign(id))} data-action="campaign-confirm" className={buttonClass.primary}>{pending ? "…" : t("approve")}</button>
          </>
        }
      >
        <p className="pb-1 text-sm text-j-muted">{t("approveBody", { count: willSend })}</p>
        {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#a8261c]">{error}</p>}
      </BottomSheet>
    </>
  );
}
