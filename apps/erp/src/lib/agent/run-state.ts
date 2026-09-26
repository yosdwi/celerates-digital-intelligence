// Pure reducer: AG-UI events → Agent run view model → assistant-ui ThreadMessageLike (spike S1).
// Unit-tested without a browser. Evidence types are the doc 14/15 vocabulary shown as badges.
import type { AgUiEvent } from "./ag-ui-client";

export type EvidenceType = "erp_fact" | "signal" | "knowledge" | "observation" | "inference";
export type Evidence = {
  type: EvidenceType;
  title: string;
  detail: string[];
  href?: string | null;
  source?: Record<string, unknown>;
  withheld?: string[];
  match?: string;
};
export type ToolTrace = { id: string; name: string; args: string; result?: string; done: boolean };
export type AgentRun = {
  runId: string;
  userText: string;
  status: "running" | "succeeded" | "failed";
  lastSeq: number;
  steps: { name: string; done: boolean }[];
  tools: ToolTrace[];
  evidence: Evidence[];
  text: string;
  error?: { message: string; code?: string };
};

export function newRun(runId: string, userText: string): AgentRun {
  return { runId, userText, status: "running", lastSeq: 0, steps: [], tools: [], evidence: [], text: "" };
}

export const PROPOSAL_TOOL = "propose_commands";
const EVIDENCE_TYPES = new Set<EvidenceType>(["erp_fact", "signal", "knowledge", "observation", "inference"]);

export function applyEvent(run: AgentRun, event: AgUiEvent, id: string | null = null): AgentRun {
  if (id !== null) {
    const seq = Number(id);
    if (Number.isFinite(seq)) {
      if (seq <= run.lastSeq) return run; // replay after resume
      run = { ...run, lastSeq: seq };
    }
  }
  if (run.status !== "running") return run;
  switch (event.type) {
    case "STEP_STARTED":
      return { ...run, steps: [...run.steps, { name: String(event.stepName), done: false }] };
    case "STEP_FINISHED":
      return { ...run, steps: run.steps.map((s) => (s.name === event.stepName ? { ...s, done: true } : s)) };
    case "TOOL_CALL_START":
      return { ...run, tools: [...run.tools, { id: String(event.toolCallId), name: String(event.toolCallName), args: "", done: false }] };
    case "TOOL_CALL_ARGS":
      return { ...run, tools: run.tools.map((t) => (t.id === event.toolCallId ? { ...t, args: t.args + String(event.delta ?? "") } : t)) };
    case "TOOL_CALL_END":
      return { ...run, tools: run.tools.map((t) => (t.id === event.toolCallId ? { ...t, done: true } : t)) };
    case "TOOL_CALL_RESULT":
      return { ...run, tools: run.tools.map((t) => (t.id === event.toolCallId ? { ...t, result: String(event.content ?? "") } : t)) };
    case "CUSTOM": {
      if (event.name !== "celerates.evidence") return run;
      const items = ((event.value as { items?: unknown[] })?.items ?? []).filter(
        (i): i is Evidence => !!i && typeof i === "object" && EVIDENCE_TYPES.has((i as Evidence).type),
      );
      return { ...run, evidence: [...run.evidence, ...items] };
    }
    case "TEXT_MESSAGE_CONTENT":
      return { ...run, text: run.text + String(event.delta ?? "") };
    case "RUN_FINISHED":
      return { ...run, status: "succeeded", steps: run.steps.map((s) => ({ ...s, done: true })) };
    case "RUN_ERROR":
      return { ...run, status: "failed", error: { message: String(event.message ?? "Agent gagal."), code: event.code as string | undefined } };
    default:
      return run;
  }
}

function parseArgs(text: string): Record<string, string> {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** One user message and one assistant message per run. Layout: progress, evidence, proposal, error, summary, tool trace. */
export function toThreadMessages(runs: AgentRun[]) {
  return runs.flatMap((run) => {
    const content: unknown[] = [];
    if (run.status === "running" || run.steps.length) content.push({ type: "data-progress", data: { steps: run.steps, running: run.status === "running" } });
    for (const item of run.evidence) content.push({ type: "data-evidence", data: item });
    // A proposal is first-class UI, never buried in the tool trace (ADR-010 preview; confirmation stays in ERP).
    for (const tool of run.tools.filter((t) => t.name === PROPOSAL_TOOL)) content.push({ type: "data-proposal", data: parseArgs(tool.args) });
    if (run.error) content.push({ type: "data-error", data: run.error });
    // The conclusion sits last, where the auto-scrolling viewport lands; evidence is directly above it.
    if (run.text) content.push({ type: "text", text: run.text });
    for (const tool of run.tools.filter((t) => t.name !== PROPOSAL_TOOL))
      content.push({
        type: "tool-call",
        toolCallId: tool.id,
        toolName: tool.name,
        args: parseArgs(tool.args),
        argsText: tool.args,
        ...(tool.result !== undefined ? { result: tool.result } : {}),
      });
    return [
      { id: run.runId + ":user", role: "user" as const, content: [{ type: "text" as const, text: run.userText }] },
      {
        id: run.runId + ":assistant",
        role: "assistant" as const,
        content,
        status:
          run.status === "running"
            ? ({ type: "running" } as const)
            : run.status === "succeeded"
              ? ({ type: "complete", reason: "stop" } as const)
              : ({ type: "incomplete", reason: "error" } as const),
      },
    ];
  });
}
