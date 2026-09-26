# ADR-015 — Agent quality loop: model turns, answer feedback and replay evaluation

Status: accepted (2026-09-26). Builds on ADR-014 (bounded model reasoning) and ADR-010 (outcomes as observations).

## Context

With a real provider live (Cloudflare Workers AI through the OpenAI-compatible path), the open question is no longer "can the Agent answer with a model" but "how good are the answers, and is a provider or model switch safe". M3 recorded provenance per run, but not the model's requests and replies, and users had no way to say an answer was wrong.

## Decision

1. **Every model turn is persisted** in `agent_model_turns`:
   - the request messages;
   - the reply;
   - the runtime's verdict (`calls`, `answer`, `proposal`, `rejected: …`, `invalid: …`, `unavailable`);
   - model, tokens and latency.

   The evidence ledger is also stored, with stable source references (`erp_rule:…`, `erp:type/id`, `knowledge:doc`, `upload:…`) on the last turn.

   Access and retention:
   - Turns contain only what the user could read under their delegation.
   - They are visible to curators only, in the Brain Console trace.
   - They are purged after `AGENT_TURN_DAYS` (default 90), except for runs saved as evaluation cases.
2. **Answer feedback is an observation.**
   - A user rates their own completed answer (helpful / not helpful, with reason and optional comment). The ERP BFF forwards it under the user's delegation to `agent_feedback`.
   - Feedback never changes ERP data or knowledge. Curators see it in the Brain Console, next to the trace.
3. **Evaluation cases come from real runs.**
   - A curator saves a model-answered run as a case and chooses which of the sources it read the answer must cite (default: what it cited).
   - Deterministic runs have no model turns and cannot become cases.
4. **Replay evaluation measures models with frozen evidence.**
   - The first (planning) and last (answering) recorded requests of each case are sent to a candidate model.
   - The model is chosen from an allowlist: `AGENT_MODEL` plus `AGENT_EVAL_MODELS`.
   - Results are checked with the same validators as production:
     - plan uses only allowed tools with valid arguments;
     - answer shape;
     - grounding (known citations, no invented numbers);
     - recall of the expected sources;
     - for proposals, the expected command kinds.
   - **No ERP call is made, no delegation is used, and a proposal reply is only validated, never sent to ERP.**
   - Runs are stored in `agent_eval_runs` with a summary: plan-valid %, grounded %, recall, median latency and tokens.

## Consequences

- A provider or model switch can be gated on the saved cases before `AGENT_MODEL` changes in production.
- Replay compares models on identical evidence. It does not measure a model's own multi-turn planning beyond the first plan; that stays observable in production traces.
- Feedback and turns add stored text. Retention is explicit, and access is curator-only.
- No change to ERP authority: evaluation can never apply anything.
