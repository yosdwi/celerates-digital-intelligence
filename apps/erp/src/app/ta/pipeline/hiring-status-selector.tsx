"use client";
import { useTransition } from "react";
import { updateHiringStatus } from "./actions";

const HIRING_STATUS_OPTIONS = [
  ["cv_sent", "CV Sent"], ["hr_interview", "HR Interview"], ["tech_test", "Tech Test"],
  ["user_interview", "User Interview"], ["offering", "Offering"], ["mcu_process", "MCU Process"], ["onboarding", "Onboarding"],
  ["offering_hold", "Offering - Hold"],
  ["reject_cv", "Reject CV"], ["failed_tech_test", "Failed Tech Test"], ["reject_user_interview", "Reject User Interview"],
  ["reject_offering", "Reject Offering"], ["failed_mcu", "Failed MCU"],
  ["withdraw_offering", "Withdraw Offering"], ["withdraw_user_interview", "Withdraw User Interview"],
  ["withdraw_onboarding", "Withdraw Onboarding"], ["withdraw_hr_interview", "Withdraw HR Interview"],
  ["withdraw_tech_test", "Withdraw Tech Test"], ["withdraw_mcu", "Withdraw MCU"],
] as const;

export function HiringStatusSelector({ id, currentStatus }: { id: string; currentStatus: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <select
      defaultValue={currentStatus}
      disabled={isPending}
      onChange={(e) => startTransition(() => updateHiringStatus(id, e.target.value))}
      className="w-full text-xs rounded border border-slate-300 px-1.5 py-1"
    >
      {HIRING_STATUS_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}