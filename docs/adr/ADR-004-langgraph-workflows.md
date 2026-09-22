# ADR-004 — LangGraph for Stateful Intelligence Workflows

**Status:** Accepted

## Context

Flagship flows such as Pre-Sales combine deterministic extraction, retrieval, ERP tool calls, model reasoning, persisted workflow state, human review, clarification loops and later resume.

## Decision

Use LangGraph for workflows that genuinely require stateful multi-step orchestration and human-in-the-loop checkpoints.

Do not turn simple deterministic operations into agents. A normal service/function remains the preferred implementation when there is no reasoning/state-machine benefit.

## Consequences

- explicit state transitions;
- review/resume is first-class;
- clearer traceability than ad-hoc chains;
- slightly more workflow infrastructure, justified for the flagship multi-step cases.
