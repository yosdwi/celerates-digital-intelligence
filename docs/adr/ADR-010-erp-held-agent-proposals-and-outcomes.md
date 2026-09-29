# ADR-010 — ERP-held Agent proposals, receipts and outcome watch

Status: accepted (2026-09-26) with the Operating Substrate M2 increment. Record: [operating-substrate-m2.md](../implementation/operating-substrate-m2.md). Amends ADR-013 §5: the tool registry now allows a `propose` risk class. Builds on ADR-007 (action boundary) and ADR-008 (user delegation).

## Context

M1 let the Agent read and explain. The Golden Journeys "signal → act → outcome" and "drop a file" need the Agent to cause ERP changes, for one record or for hundreds of rows.

Two things must stay true:

- models and playbooks may reason, map and plan, but they never hold transactional truth or authority;
- risky mutations stay governed, validated, idempotent and human-controlled.

ADR-007's review/command pair is built for one Pre-Sales artifact per request. It does not fit interactive, multi-item, user-edited actions.

## Decision

1. **The command allowlist lives in ERP** (`apps/erp/src/lib/agent/commands.ts`).
   - Each command declares:
     - its module;
     - an optional target entity type (from the ADR-009 catalog);
     - typed parameters (text, int, date, enum, and `choice` from ERP reference data), with import aliases;
     - which parameters the user may edit;
     - business preconditions;
     - a narrow `apply`;
     - an `outcome` check.
   - v1 commands:
     - `task.create`, which is linked to a source record through new `kanban_tasks.source_type/source_id/created_by_user_id` columns;
     - `requisition.assign_ta_pic`, which only fills an unassigned PIC and never overwrites;
     - `requisition.create`, which mirrors the manual TA action: tracker + opportunity + requisition;
     - `feature_request.create`, which mirrors Masukan, including the owner notification.
2. **The remedy for a signal is declared in ERP, next to the rule** (`SIGNAL_REMEDY` in `operations/reader.ts`). It defaults to a follow-up task linked to each record. Intelligence does not branch per workflow.
3. **Intelligence can only create a pending proposal.**
   - The call is `POST /api/integration/v1/agent/proposals`. It needs the machine *action* token, the user's delegation, and an `Idempotency-Key` (one proposal per run).
   - ERP validates every item for that user and stores the normalized items with a `sha256` digest in `agent_proposals` (≤ 200 items, 2 h expiry).
   - Invalid, forbidden or unknown items are kept, visibly, and marked as such.
4. **Only the proposing user can confirm, in an ERP session, against the stored digest.**
   - `POST /api/agent/proposals/{id}/confirm` requires a same-origin session request.
   - The user may include or exclude items and edit only declared editable fields.
   - ERP then works through the items in one transaction, holding a row lock:
     1. It re-validates every included item with the user's *current* access and preconditions.
     2. It applies each item in its own savepoint.
     3. It writes one receipt per item (`agent_action_receipts`) and an activity-log line "<user> (via Celerates Agent)".
   - Replaying a confirmation returns the stored receipts and has no second effect.
   - A mismatched digest returns 412; an expired or rejected proposal returns 409.
   - Voice, AG-UI `resume` payloads and model output can never confirm.
5. **Outcome watch is computed by ERP from current records** (each command's `outcome`), not remembered by the Agent. `Tindak lanjut berjalan` in `Perlu perhatian` lists the user's recent proposals with live resolved/open counts.
6. **Intelligence receives the outcome as an observation.**
   - After a decision, ERP posts it to `POST /api/agent/runs/{id}/outcomes` under the user's delegation, best effort. It lands in `agent_outcomes`.
   - It is the learning signal (ADR-011 mapping memory). The ERP receipts remain the record of truth.

## Consequences

- One governed write path now serves both journeys, without per-workflow endpoints. Adding a command is an ERP change with its own tests. Intelligence learns its specs from `GET agent/catalog`.
- The ADR-007 Pre-Sales review/command flow is unchanged.
- ERP authority is re-checked at confirmation time, so revoking access also blocks confirming pending proposals.
- Not yet covered:
  - editing, previewing or undoing applied effects;
  - batch jobs above 200 items;
  - proposal notifications outside the panel.
- Reversal remains a normal ERP edit.
