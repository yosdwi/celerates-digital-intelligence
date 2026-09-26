import { Pill, type PillVariant } from "@/components/pill";

const PIPELINE_LABELS: Record<string, string> = { win: "Win", drop: "Drop", hold: "Hold", on_going: "On Going" };
const PIPELINE_VARIANT: Record<string, PillVariant> = {
  win: "success", drop: "critical", hold: "warning", on_going: "info",
};

export function StageBadge({ pipelineStageCode }: { pipelineStageCode: string }) {
  const variant = PIPELINE_VARIANT[pipelineStageCode] ?? "neutral";
  const label = PIPELINE_LABELS[pipelineStageCode] ?? pipelineStageCode;
  return <Pill variant={variant}>{label}</Pill>;
}
