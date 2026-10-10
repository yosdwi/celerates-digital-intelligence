import { Pill, type PillVariant } from "@/components/pill";
import { HIRING_STATUS_LABELS } from "./hiring-status";


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
