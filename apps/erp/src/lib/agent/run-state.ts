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
  | { mode: "model"; kind: "answer" | "proposal" | "route"; model: string; cited: string[]; read: number; rounds: number; tokens: number; intent?: string }
  | { mode: "deterministic"; fallback: boolean };
export type FeedbackIntent = "feature_request" | "data_correction" | "knowledge_correction" | "agent_feedback";
export type AgentAction =
  | { label: string; skill: "follow_up_signal" | "explain_signal"; args: { signal_key: string } }
  | { label: string; skill: "route_feedback"; args: { intent: FeedbackIntent; text: string; entity_type?: string; entity_id?: string } }
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
export type Submission = { id: string; intent: FeedbackIntent; label: string; title: string; body: string; refs: string[] };
export type ToolTrace = { id: string; name: string; args: string; result?: string; done: boolean };
export type AgentRun = {
  runId: string;
  skill?: string;
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
  /** Intelligence-held drafts (knowledge correction, Agent feedback) the user reviews and sends (ADR-017). */
  submissions: Submission[];
  provenance?: Provenance;
  text: string;
  error?: { message: string; code?: string };
};

/** Skills whose output is an answer a user can judge (feedback, ADR-015). */
const ANSWER_SKILLS = new Set(["ask", "explain_signal", "explain_entity", "search", "read_document"]);

export function newRun(runId: string, userText: string, skill?: string): AgentRun {
  return { runId, userText, skill, status: "running", lastSeq: 0, steps: [], tools: [], evidence: [], proposals: [], actions: [], submissions: [], text: "" };
}

const EVIDENCE_TYPES = new Set<EvidenceType>(["erp_fact", "signal", "knowledge", "document", "observation", "inference"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTENTS = new Set<FeedbackIntent>(["feature_request", "data_correction", "knowledge_correction", "agent_feedback"]);
const SIGNAL_KEY = /^[a-z0-9-]{2,60}$/;

/** Server-offered next steps, reduced to the allowlisted skills and argument shapes. Running one is a new run that the
 * ERP BFF validates again; none is an approval. Imports start only from the mapping card. */
function offeredAction(a: unknown): AgentAction | null {
  if (!a || typeof a !== "object") return null;
  const { label, skill, args } = a as { label?: unknown; skill?: unknown; args?: Record<string, unknown> };
  const text = String(label ?? "").slice(0, 120);
  if ((skill === "follow_up_signal" || skill === "explain_signal") && SIGNAL_KEY.test(String(args?.signal_key)))
    return { label: text, skill, args: { signal_key: String(args!.signal_key) } };
  if (skill === "route_feedback" && INTENTS.has(args?.intent as FeedbackIntent) && typeof args?.text === "string" && args.text.trim()) {
    const target = typeof args.entity_type === "string" && /^[a-z_]{2,40}$/.test(args.entity_type) && typeof args.entity_id === "string" && UUID.test(args.entity_id);
    return {
      label: text,
      skill,
      args: { intent: args.intent as FeedbackIntent, text: args.text.slice(0, 1000), ...(target ? { entity_type: args.entity_type as string, entity_id: args.entity_id as string } : {}) },
    };
  }
  return null;
}

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
              kind: v.kind === "proposal" ? "proposal" : v.kind === "route" ? "route" : "answer",
              ...(typeof v.intent === "string" && INTENTS.has(v.intent as FeedbackIntent) ? { intent: v.intent } : {}),
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
        const offered = ((event.value as { items?: unknown[] })?.items ?? []).map(offeredAction).filter((a): a is AgentAction => a !== null);
        return { ...run, actions: [...run.actions, ...offered].slice(0, 6) };
      }
      if (event.name === "celerates.submission") {
        const v = event.value as Partial<Submission> | undefined;
        if (!v || typeof v.id !== "string" || !UUID.test(v.id) || !INTENTS.has(v.intent as FeedbackIntent) || run.submissions.some((x) => x.id === v.id)) return run;
        const submission: Submission = {
          id: v.id,
          intent: v.intent as FeedbackIntent,
          label: String(v.label ?? "Masukan").slice(0, 80),
          title: String(v.title ?? "").slice(0, 200),
          body: String(v.body ?? "").slice(0, 3000),
          refs: Array.isArray(v.refs) ? v.refs.slice(0, 3).map((r) => String(r).slice(0, 200)) : [],
        };
        return { ...run, submissions: [...run.submissions, submission] };
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
    for (const submission of run.submissions) content.push({ type: "data-submission", data: submission });
    if (run.mapping && run.status === "succeeded") content.push({ type: "data-mapping", data: run.mapping });
    if (run.actions.length && run.status === "succeeded") content.push({ type: "data-actions", data: { items: run.actions } });
    const answered = run.provenance?.mode !== "model" || run.provenance.kind !== "route";
    if (run.status === "succeeded" && run.text && run.skill && ANSWER_SKILLS.has(run.skill) && answered && !run.submissions.length) content.push({ type: "data-feedback", data: { runId: run.runId } });
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
