"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { updatePipelineStage, updateOptyStatus } from "./actions";
import { useToast } from "@/components/toast-provider";

const PIPELINE_STAGES = [["win", "Win"], ["drop", "Drop"], ["hold", "Hold"], ["on_going", "On Going"]] as const;
const OPTY_STATUS = [
  ["on_hold", "Project on Hold"], ["client_not_responding", "Client Not Responding"],
  ["lost_pitching", "Lost on Pitching Period"], ["waiting_feedback", "Waiting for Feedback"],
  ["budget_on_hold", "Client Budget on Hold"], ["won", "Project Won"],
  ["closed_lost", "Closed Lost"], ["on_going_others", "Opty on Going Others"],
  ["need_action", "Need Action"],
] as const;

// Pipeline Stage -> Opty Status otomatis -- kalau sales pilih Win/Drop/Hold di
// dropdown Aksi, Opty Status ikut disamain supaya nggak ada 2 status yang
// nyata-nyata beda arti (mis. Win di Aksi tapi Opty Status masih "on_hold").
// "on_going" sengaja TIDAK di-map -- nggak ada satu Opty Status yang pasti
// cocok buat semua kasus "lagi jalan".
const STAGE_TO_OPTY_STATUS: Record<string, string | undefined> = {
  win: "won",
  drop: "closed_lost",
  hold: "on_hold",
};

export function StageSelector({
  id,
  currentPipelineStage,
  currentOptyStatus,
}: {
  id: string;
  currentPipelineStage: string;
  currentOptyStatus: string | null;
}) {
  const t = useTranslations("sales.pqTracker");
  const [isPending, startTransition] = useTransition();
  const { showToast } = useToast();
  const [pipelineStage, setPipelineStage] = useState(currentPipelineStage);
  const [optyStatus, setOptyStatus] = useState(currentOptyStatus ?? "");

  function handlePipelineStageChange(value: string) {
    const prevStage = pipelineStage;
    const prevOptyStatus = optyStatus;
    // Optimistic: selection tampil berubah duluan, nggak nunggu server --
    // sebelumnya `<select defaultValue>` (uncontrolled) bikin dropdown terlihat
    // "balik" ke nilai lama tiap kali re-render server component jalan.
    setPipelineStage(value);
    const mappedOptyStatus = STAGE_TO_OPTY_STATUS[value];
    if (mappedOptyStatus) setOptyStatus(mappedOptyStatus);

    startTransition(async () => {
      const result = await updatePipelineStage(id, value);
      if (!result.ok) {
        setPipelineStage(prevStage);
        setOptyStatus(prevOptyStatus);
        showToast(result.error, "error");
        return;
      }
      if (mappedOptyStatus) {
        const optyResult = await updateOptyStatus(id, mappedOptyStatus);
        if (!optyResult.ok) {
          setOptyStatus(prevOptyStatus);
          showToast(optyResult.error, "error");
        }
      }
    });
  }

  function handleOptyStatusChange(value: string) {
    const prev = optyStatus;
    setOptyStatus(value);
    startTransition(async () => {
      const result = await updateOptyStatus(id, value);
      if (!result.ok) {
        setOptyStatus(prev);
        showToast(result.error, "error");
      }
    });
  }

  return (
    <div className="space-y-1">
      <select
        value={pipelineStage}
        disabled={isPending}
        onChange={(e) => handlePipelineStageChange(e.target.value)}
        className="w-full text-xs rounded border border-slate-300 px-1.5 py-1"
      >
        {PIPELINE_STAGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <select
        value={optyStatus}
        disabled={isPending}
        onChange={(e) => handleOptyStatusChange(e.target.value)}
        className="w-full text-xs rounded border border-slate-300 px-1.5 py-1"
      >
        <option value="">{t("optyStatusPlaceholder")}</option>
        {OPTY_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
