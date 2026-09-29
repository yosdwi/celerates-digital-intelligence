# ADR-007 — Shared governed context with an ERP-owned approval boundary

Status: accepted implementation direction under the user's 2026-09-25 instruction.

Extend existing Python/FastAPI/LangGraph/PostgreSQL/FTS/pgvector/S3 infrastructure.
Generalized source versions and authorized retrieval serve workflows independently
of UI. Operational facts stay in ERP; observations are not automatically knowledge.

Implement the first subset of the proposed v1 ERP contract: explicitly granted
Sales Opportunity reads/change events and `artifact.persist_approved_reference`.
A separately authenticated service proposes an immutable bounded artifact manifest.
An active ERP Owner reviews it in ERP against the exact source version and digest.
The service may then apply only that reviewed effect with a durable idempotent
receipt. It cannot approve its own proposal or change commercial/workforce state.
Read/action token hashes, audience, environment and record grants are independent
of human login. Broader role rollout remains outside the Owner pilot.

Knowledge approval and ERP action approval are separate. Revalidate current source
access/version and knowledge lifecycle before applying an action. Preserve rejected,
corrected and applied outcomes for evaluation; promotion into knowledge is explicit.

This implements a narrow part of ADR-006's contract dependency, preserving all
other ERP maturity gates. No direct ERP database credentials in Intelligence, new
agent service, new vector database, Airbyte or automatic model training.
