"use client";
import { useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ownerOverrideExtensionRequest, rejectExtensionRequest } from "../actions";

export type JourneyStep = {
  code: string;
  label: string;
  personName: string | null;
  personEmail: string | null;
  status: "not_configured" | "not_started" | "pending" | "signed" | "rejected";
};

const STATUS_STYLES: Record<JourneyStep["status"], string> = {
  not_configured: "border-slate-200 bg-slate-50 text-slate-400",
  not_started: "border-slate-200 bg-white text-slate-400",
  pending: "border-amber-300 bg-amber-50 text-amber-700",
  signed: "border-green-300 bg-green-50 text-green-700",
  rejected: "border-red-300 bg-red-50 text-red-700",
};

export function ApprovalJourney({
  requestId,
  steps,
  statusCode,
  ownerOverride,
  ownerOverrideByName,
  isOwner,
}: {
  requestId: string;
  steps: JourneyStep[];
  statusCode: string;
  ownerOverride: boolean;
  ownerOverrideByName: string | null;
  isOwner: boolean;
}) {
  const t = useTranslations("tm.extensionRequests.approvalJourney");
  const [isPending, startTransition] = useTransition();

  const STATUS_LABELS: Record<JourneyStep["status"], string> = {
    not_configured: t("statusNotConfigured"),
    not_started: t("statusNotStarted"),
    pending: t("statusPending"),
    signed: t("statusSigned"),
    rejected: t("statusRejected"),
  };

  function handleOwnerOverride() {
    if (!confirm(t("confirmOwnerOverride"))) return;
    startTransition(() => ownerOverrideExtensionRequest(requestId));
  }
  function handleReject() {
    if (!confirm(t("confirmReject"))) return;
    startTransition(() => rejectExtensionRequest(requestId));
  }

  return (
    <div className="flex flex-col gap-2 min-w-[220px]">
      <div className="flex flex-col gap-1">
        {steps.map((step) => (
          <div
            key={step.code}
            title={step.personEmail ?? undefined}
            className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-[11px] ${STATUS_STYLES[step.status]}`}
          >
            <span className="font-medium truncate">{step.label}{step.personName ? `: ${step.personName}` : ""}</span>
            <span className="shrink-0 whitespace-nowrap">{STATUS_LABELS[step.status]}</span>
          </div>
        ))}
      </div>

      {statusCode === "approved" && (
        <span className="text-xs font-medium text-green-600">
          Approved{ownerOverride ? ` (${t("overrideBy", { name: ownerOverrideByName ?? "Owner" })})` : ""}
        </span>
      )}
      {statusCode === "rejected" && <span className="text-xs font-medium text-red-600">{t("statusRejected")}</span>}

      {statusCode === "pending" && (
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/ttd-online" className="text-[11px] font-medium text-brand-600 hover:underline">
            {t("viewInTtd")}
          </Link>
          <button onClick={handleReject} disabled={isPending} className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50">
            Reject
          </button>
          {isOwner && (
            <button onClick={handleOwnerOverride} disabled={isPending} className="text-[11px] font-medium text-purple-600 hover:underline disabled:opacity-50">
              {t("approveWithoutTtd")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
