import { Pill, type PillVariant } from "@/components/pill";

const HIRING_STATUS_LABELS: Record<string, string> = {
  cv_sent: "CV Sent", hr_interview: "HR Interview", tech_test: "Tech Test",
  user_interview: "User Interview", offering: "Offering", mcu_process: "MCU Process", onboarding: "Onboarding",
  offering_hold: "Offering - Hold",
  reject_cv: "Reject CV", failed_tech_test: "Failed Tech Test", reject_user_interview: "Reject User Interview",
  reject_offering: "Reject Offering", failed_mcu: "Failed MCU",
  withdraw_offering: "Withdraw Offering", withdraw_user_interview: "Withdraw User Interview",
  withdraw_onboarding: "Withdraw Onboarding", withdraw_hr_interview: "Withdraw HR Interview",
  withdraw_tech_test: "Withdraw Tech Test", withdraw_mcu: "Withdraw MCU",
};

function variantFor(code: string): PillVariant {
  if (code.startsWith("reject_") || code.startsWith("failed_")) return "critical";
  if (code.startsWith("withdraw_") || code === "offering_hold") return "warning";
  if (code === "onboarding") return "success";
  return "info";
}

export function HiringStatusBadge({ hiringStatusCode }: { hiringStatusCode: string }) {
  const label = HIRING_STATUS_LABELS[hiringStatusCode] ?? hiringStatusCode;
  return <Pill variant={variantFor(hiringStatusCode)}>{label}</Pill>;
}
