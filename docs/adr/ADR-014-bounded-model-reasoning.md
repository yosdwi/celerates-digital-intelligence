# ADR-014 — Bounded model reasoning over the Agent tool registry

Status: accepted (2026-09-26). Record: [operating-substrate-m3.md](../implementation/operating-substrate-m3.md). Amends ADR-013 §7 and doc 16. PydanticAI is **not** adopted for the model loop.

## Context

The deterministic `ask` router (M2) answers well when a question shares words with an ERP rule or record. It fails on paraphrases and on requests for action ("buatkan task follow up REQ-… besok").

Doc 16 proposed PydanticAI for a bounded model loop, subject to spike S3. Building the loop showed three things:

- The loop needed only three reply shapes, validated by code we already own: read, propose or answer.
- The tool metadata that matters (risk class, allowlist, argument limits) already lives in `cdi/agent/tools.py`.
- LiteLLM's JSON mode already gives us provider portability.

Adding a framework would duplicate the registry. It would also move the validation boundary into library code.

## Decision

1. **The loop is plan → read → answer, as JSON objects** (`cdi/agent/reasoning.py`), at most 4 model turns.
   - Each turn returns exactly one of:
     - `{"calls": [...]}` — at most 4 read tools per turn, taken from a planner allowlist with fixed argument names and bounds;
     - `{"proposal": {...}}` — only through `erp_propose`, as an ERP-held *pending* proposal (ADR-010);
     - `{"answer": "...", "cite": [...]}`.
   - Tool calls go through the same `invoke` path as the playbooks: the same policy check, budget, trace, and ERP authorization under the user's delegation.
2. **Evidence is numbered and shown before any model text.**
   - Rules are `S1…`; tool results are `E1…`.
   - Cards carry their id, and the answer cites ids.
   - Facts shown to the user come only from tool results, never from model output.
3. **Answers are validated before they are shown:**
   - cited ids must exist;
   - every number in the answer must occur in the evidence, the question or today's date;
   - length is capped.
   - One repair turn is allowed. Otherwise, and on any provider error, invalid shape, disallowed tool, unknown command or time budget, the run **falls back to the deterministic router** and says so.
4. **Model text is labelled as inference** through a `celerates.provenance` event, which records the model, turns, tokens and cited ids. Deterministic answers are labelled as such.
5. **Generation and embeddings are switched separately.**
   - `GENERATION_MODE` and `EMBEDDING_MODE` default to `MODEL_MODE`.
   - `AGENT_MODEL` (and optional `AGENT_FAST_MODEL`) enables reasoning.
   - So the Agent can use a model without re-embedding knowledge; `EMBEDDING_MODE` changes only with a re-embed.
6. **The model is never write authority.** It can read what the user may read and draft pending proposals. ERP validates each item, and only the user confirms, in an ERP session.

## Consequences

- There is no new dependency. Any provider behind LiteLLM (or a LiteLLM proxy) works through `AGENT_MODEL` / `MODEL_API_BASE` / `MODEL_API_KEY`.
- The cross-stack harness runs the real path against a local OpenAI-compatible stand-in (`tests/fake_model_server.py`), so CI tests the plumbing without credentials.
- **Provider evaluation is now configuration plus observation.**
  - Run the same questions with different `AGENT_MODEL` values.
  - Compare `agent_runs.result.reasoning` (model / fallback) and provenance tokens and turns.
  - Fallback rates show where a provider fails grounding.
- The grounding check is syntactic. It stops invented numbers and ids, but not a wrong reading of correct evidence. That residual risk is why the text is labelled *Inferensi* and the cards stay beside it.
