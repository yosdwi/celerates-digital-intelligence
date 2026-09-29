# ADR-013 — Agent interaction protocol, runtime libraries and run store

Status: accepted for Operating Substrate M1 (2026-09-26), based on spikes S1 and S2 in [the M1 implementation record](../implementation/operating-substrate-m1.md). Evaluation: [doc 16](../16-operating-substrate-build-reuse-adopt.md).

## Decision

1. **AG-UI (protocol 1.0) is the event format** between Intelligence, the ERP BFF and the Agent panel.
   - Intelligence emits events with the official Python models (`ag-ui-protocol==1.0.0`).
   - The ERP BFF exposes `POST /api/agent/ag-ui`, which accepts `RunAgentInput` and returns an SSE stream, and `GET /api/agent/runs/{id}/events` for `Last-Event-ID` resume.
   - Celerates semantics travel as `CUSTOM` events (`celerates.evidence`).
2. **Persist first, stream second.**
   - Every event is written to `agent_steps(run_id, seq)` before it is streamed. SSE `id:` equals `seq`.
   - `agent_runs` records the ERP user (`sub`, delegation `jti`), page context, skill, input, modality, playbook version, state and result.
   - A run whose process died is closed once with `RUN_ERROR RUN_INTERRUPTED`.
3. **Only server-decided work runs.** From `RunAgentInput` the BFF uses `forwardedProps.{skill,args,path}` and the last user message text. Client-supplied `tools`, `state`, `context` and `resume` are ignored. **No AG-UI interrupt or resume payload is ever an approval.**
4. **Interactive runs execute in the Intelligence API process**, bounded to 12 tool calls and 60 s, in a small thread pool. Long work stays on the existing Postgres worker and LangGraph.
5. **Deterministic playbooks over a typed tool registry.**
   - M1 has three skills (`explain_signal`, `explain_entity`, `search`) and six read tools.
   - Registry metadata (risk class, module, bounds) is ours. The registry refuses non-read tools in M1.
   - *Amended by ADR-010 (M2):* a `propose` risk class is allowed. It is used only by `erp_propose`, which creates an ERP-held pending proposal. There is still no `write` class.
   - No model is called.
6. **assistant-ui (`@assistant-ui/react` 0.15.22, pinned exactly) is used for the `Tanya` thread and composer only.**
   - It runs as `ExternalStoreRuntime` over our run state, and is lazy-loaded when the tab opens.
   - Evidence, proposal, progress and error render as our components through data parts.
   - assistant-cloud, its AG-UI runtime (`@assistant-ui/react-ag-ui`) and its browser dictation adapter are not used.
7. **Not adopted in M1** (*amended by ADR-014:* the model loop is our own plan → read → answer loop over LiteLLM, and PydanticAI is not adopted):
   - PydanticAI, LiteLLM Proxy and model calls (M2 evaluation track);
   - CopilotKit;
   - LiveKit.

   See doc 16.

## Why

- **S2 passed.** All streamed events validate against `@ag-ui/core` 1.0 schemas. The standard `@ag-ui/client` `HttpAgent` consumes the BFF endpoint unchanged. Resume returns the exact tail. A forged `resume`/`state`/`tools` body produced a read-only run and no ERP change.
- **S1 passed with conditions:**
  - Builds on Next 15.5.24 / React 19.2 / Tailwind 4, with no measurable first-load change (±1 kB).
  - The lazy thread chunk is ~105 kB gzip (347 kB raw), paid only when the user opens `Tanya`.
  - The library is fast-moving: `ExternalStoreRuntime` ships from a `legacy-runtime` path, and some exported APIs carry removal dates already past.
  - We therefore pin it exactly and keep all run semantics outside it, so replacing it costs only the thread/composer (doc 16 fallback, about 1–1.5 weeks).
- `@assistant-ui/react-ag-ui` depends on `@ag-ui/client` 0.0.x (pre-1.0) and would own transport. Our ~100-line reducer (`run-state.ts`) is tested and keeps de-duplication and evidence typing under our control.

## Consequences

- Any future engine (PydanticAI loop, LangGraph workflow) must emit the same AG-UI events into `agent_steps`. The panel does not change.
- Proposals (ADR-010, M3) render as a first-class card from a data part, never inside the collapsed tool trace. Confirmation will be an ERP action against the stored proposal digest.
- Voice (M2) adds a modality to the same run. The API already records `modality` and rejects `voice` until then.
- Revisit assistant-ui at M2 if the chunk cost or upgrade churn exceeds what it saves. Revisit the in-process execution model if concurrent runs exceed the thread pool.
