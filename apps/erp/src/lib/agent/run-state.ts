// Pure reducer: AG-UI events → Agent run view model → assistant-ui ThreadMessageLike (spike S1).
// Unit-tested without a browser. Evidence types are the doc 14/15 vocabulary shown as badges.
import type { AgUiEvent } from "./ag-ui-client";

export type EvidenceType = "erp_fact" | "signal" | "knowledge" | "document" | "observation" | "inference";
export type Evidence = {
  type: EvidenceType;
  title: string;
  detail: string[];
  href?: string | null;
  source?: Record<string, unknown>;
  withheld?: string[];
  match?: string;
  /** Evidence id the answer cites, e.g. "E1" or "S2" (model-composed answers only). */
  cite?: string;
};
/** How the answer text was produced. `model` text is inference over the cited evidence, never a fact source. */
export type Provenance =
  | { mode: "model"; kind: "answer" | "proposal"; model: string; cited: string[]; read: number; rounds: number; tokens: number }
  | { mode: "deterministic"; fallback: boolean };
export type AgentAction =
  | { label: string; skill: "follow_up_signal"; args: { signal_key: string } }
  | { label: string; skill: "import_dataset"; args: { dataset_id: string; command: string; mapping: Record<string, string> } };
/** The column mapping behind an import (ADR-011), shown so the user can inspect or correct it. */
export type MappingCardData = {
  dataset_id: string;
  command: string;
  columns: string[];
  mapping: Record<string, string>;
  commands: { kind: string; label: string; params: { name: string; label: string; required: boolean }[] }[];
  open: boolean;
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
  /** ERP-held proposals this run created (ADR-010). The card loads the live proposal from ERP by id. */
  proposals: { id: string; title: string }[];
  /** Next steps offered by the playbook. Only allowlisted skills; running one is a new run, never an approval. */
  actions: AgentAction[];
  mapping?: MappingCardData;
  provenance?: Provenance;
  text: string;
  error?: { message: string; code?: string };
};

export function newRun(runId: string, userText: string): AgentRun {
  return { runId, userText, status: "running", lastSeq: 0, steps: [], tools: [], evidence: [], proposals: [], actions: [], text: "" };
}

const EVIDENCE_TYPES = new Set<EvidenceType>(["erp_fact", "signal", "knowledge", "document", "observation", "inference"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (event.name === "celerates.proposal") {
        const value = event.value as { id?: unknown; title?: unknown } | undefined;
        if (typeof value?.id !== "string" || !UUID.test(value.id) || run.proposals.some((p) => p.id === value.id)) return run;
        return { ...run, proposals: [...run.proposals, { id: value.id, title: String(value.title ?? "Usulan") }] };
      }
      if (event.name === "celerates.provenance") {
        const v = event.value as Record<string, unknown> | undefined;
        if (v?.mode === "model")
          return {
            ...run,
            provenance: {
              mode: "model",
              kind: v.kind === "proposal" ? "proposal" : "answer",
              read: Number(v.read) || 0,
              model: String(v.model ?? "model").slice(0, 80),
              cited: Array.isArray(v.cited) ? v.cited.filter((c): c is string => typeof c === "string" && /^[ESD]\d{1,3}$/.test(c)) : [],
              rounds: Number(v.rounds) || 0,
              tokens: Number(v.tokens) || 0,
            },
          };
        if (v?.mode === "deterministic") return { ...run, provenance: { mode: "deterministic", fallback: v.fallback === true } };
        return run;
      }
      if (event.name === "celerates.mapping") {
        const v = event.value as MappingCardData | undefined;
        if (!v || !UUID.test(String(v.dataset_id)) || !Array.isArray(v.columns) || !Array.isArray(v.commands)) return run;
        return { ...run, mapping: v };
      }
      if (event.name === "celerates.actions") {
        // Server-offered actions are limited to follow-ups on a rule; imports are started only from the mapping card.
        type Offered = { label?: unknown; skill?: unknown; args?: { signal_key?: unknown } };
        const items = ((event.value as { items?: unknown[] })?.items ?? []).filter(
          (a): a is Offered => !!a && typeof a === "object" && (a as Offered).skill === "follow_up_signal" && /^[a-z0-9-]{2,60}$/.test(String((a as Offered).args?.signal_key)),
        );
        const offered: AgentAction[] = items.map((a) => ({ label: String(a.label).slice(0, 120), skill: "follow_up_signal", args: { signal_key: String(a.args!.signal_key) } }));
        return { ...run, actions: [...run.actions, ...offered].slice(0, 4) };
      }
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
    // A proposal is first-class UI, never buried in the tool trace. The card reads the ERP-held proposal (ADR-010).
    if (run.error) content.push({ type: "data-error", data: run.error });
    // The conclusion sits last, where the auto-scrolling viewport lands; evidence is directly above it.
    if (run.text) content.push({ type: "text", text: run.text });
    if (run.text && run.provenance) content.push({ type: "data-provenance", data: run.provenance });
    for (const proposal of run.proposals) content.push({ type: "data-proposal", data: proposal });
    if (run.mapping && run.status === "succeeded") content.push({ type: "data-mapping", data: run.mapping });
    if (run.actions.length && run.status === "succeeded") content.push({ type: "data-actions", data: { items: run.actions } });
    for (const tool of run.tools)
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
