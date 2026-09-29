import { Pill, type PillVariant } from "@/components/pill";

const LABELS: Record<string, string> = {
  cv_submission: "CV Submission", solutioning: "Solutioning",
  proposal_sent: "Proposal Sent", win: "Win", dropped: "Dropped",
};
const VARIANT: Record<string, PillVariant> = {
  cv_submission: "neutral", solutioning: "info",
  proposal_sent: "warning", win: "success", dropped: "critical",
};

export function OptyStatusBadge({ optyStatusCode }: { optyStatusCode: string }) {
  const variant = VARIANT[optyStatusCode] ?? "neutral";
  const label = LABELS[optyStatusCode] ?? optyStatusCode;
  return <Pill variant={variant}>{label}</Pill>;
}
