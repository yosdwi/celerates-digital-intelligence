# P0 implementation map

**Latest increment:** [Operating Substrate M4 — quality loop, Brain Console sign-in, signal history](operating-substrate-m4.md)
(answer feedback, persisted model turns, replay evaluation of models, ERP Owner sign-in to the Brain Console, "what changed" in Perlu perhatian).
Before that: [M3 — understanding, documents, voice, Brain Console](operating-substrate-m3.md).
Before that: [M2 — Ask, Drop, Act](operating-substrate-m2.md) (ask anything, CSV/XLSX import, `Tindak lanjuti` → ERP-held proposals → receipts → outcomes).
Before that: [M1 — Celerates Agent shell](operating-substrate-m1.md) (ERP delegation, Entity Catalog v1, persisted AG-UI runs, `Tanyakan`).

**Previous extension:** [closed-loop foundation](closed-loop-foundation.md) and
[operator/demo guide](closed-loop-operations.md). The table below describes the
original P0; governed source versions, live ERP approval/actions and outcomes now
extend those same components.

Issue: https://github.com/yosdwi/celerates-digital-intelligence/issues/1

No locked ADR was replaced. React/TypeScript/Vite/Tailwind, FastAPI, PostgreSQL/pgvector/FTS, MinIO, LangGraph and LiteLLM remain the implementation boundaries.

| Boundary | Implementation |
|---|---|
| Product / application | `apps/web/src/App.tsx`, `Presales.tsx`, `Support.tsx` |
| Typed API | `services/intelligence-api/cdi/api.py`, `contracts.py`; `/docs`, `/openapi.json` |
| PostgreSQL migration | `infra/postgres/migrations/001_foundation.sql`, `cdi/migrate.py` |
| Canonical business reads/actions | `cdi/erp.py`; `packages/contracts/erp-http.md` |
| Object storage | `cdi/storage.py`: MinIO/S3 default, explicit filesystem implementation |
| Parsing and source index | `cdi/documents.py`: lossless UTF-8 text; Docling for PDF/Office |
| Hybrid retrieval | PostgreSQL FTS + pgvector, scoped to opportunity and embedding model |
| Generation | `cdi/artifacts.py`: 11 structured artifacts; `cdi/gateway.py`: narrative gateway |
| Persistent human workflow | `cdi/workflow.py`: LangGraph PostgreSQL checkpoints + interrupt/resume |
| Durable processing | `cdi/worker.py`: PostgreSQL queue, leases, heartbeats, replay-safe artifact creation |
| Source Integration Core | `cdi/intake.py`: discover/extract/normalize/validate/approved ERP load |
| Supporting automation | Optional n8n profile and inactive credential-bound intake example |

## Implementation refinements

The API and worker are separate processes sharing the `cdi` package. This preserves the deployment boundary while avoiding duplicated domain implementations. All workflow nodes use small, short SQL transactions. Queue claims use `FOR UPDATE SKIP LOCKED`; the default P0 topology runs one worker. Leases are renewed while a job runs and abandoned work becomes claimable after lease expiry. Strong multi-worker fencing under network partitions and horizontal scaling remain later hardening work.

LangGraph persists state and pauses at an actual human `interrupt`. Review decisions include the current artifact versions and resume that graph. Artifact content versions are append-only in `artifact_versions`; edited content invalidates its review and proposal approval. Re-analysis creates a new run and preserves prior versions/history. An outcome is not complete until ERP acknowledges it; retry reuses the same idempotency key.

Uploaded documents retain SHA-256, original objects, parser information, extracted text, chunks and source references. Reference registration requires the actual source text. URLs are recorded, not fetched. New evidence requires finishing the current review (e.g. requesting clarification), preventing a silent change to a pack's inputs.

Demo embeddings are **deterministic hashed-token similarity**, not a semantic model. They exercise the real pgvector + FTS path without credentials or model downloads. `MODEL_MODE=litellm` uses the configured embedding model and the same web contract. TOR search remains opportunity-scoped. Approved reusable knowledge now uses company/division/opportunity scope and classification filters before ranking; unapproved documents are never implicitly shared.

Docling is the PDF/Office parser. Text/Markdown/CSV use direct UTF-8 extraction because layout inference is unnecessary. PDF model files may need a first-use download. Parse failures surface in the source list and the run; there is no silent text fabrication. The shipped Markdown TORs guarantee the demo does not depend on a model download.

## Human review and factual boundaries

ERP-derived table rows and provenance columns cannot be changed through artifact editing. A reviewer can annotate their summary and correct editable requirement/solution/scope/BOQ/proposal fields. BOQ work packages are deliberately unestimated until a qualified reviewer supplies effort; no generated rate card or price is included. Model output is confined to explicitly labeled solution/proposal narrative and always requires review.

The complete pack is reviewed in an explicit dialog listing all 11 exact versions, a required review note and a confirmation checkbox. Approval covers the current versions together; proposal metadata retains the approved dependency versions. Open clarification rows block Ready for Sales even after approval. A resolved clarification requires a recorded answer. Outcome approval means ready for **Sales discussion**, not permission to make commercial commitments or send messages.

## Deliberate P0 boundaries

- Exceptions, Human Service and Management are seeded, source-linked read surfaces with detail views. Real case mutations, scheduled reminders, notifications and external messaging are not claimed.
- SQL Server and Jira are named interfaces that raise a clear not-implemented error; CSV/Excel, REST and PostgreSQL extraction are implemented.
- Demo access is one synthetic reviewer; connected mode requires a shared workspace bearer token. Per-user SSO, tenant isolation, role-level authorization and production identity integration are future gates.
- ERP HTTP contract must be agreed and implemented by the operational-core team. Live endpoint compatibility is not implied by the demo.
- n8n, the LiteLLM proxy and Langfuse are optional. Core P0 does not need them running; direct LiteLLM SDK provider routing is also supported.
- No Redis, Kafka, Airbyte, Kubernetes, or alternative vector database is introduced.

## Verification

See `VERIFICATION.md` for observed results and environment limitations. CI includes PostgreSQL/pgvector integration tests, the frontend build, Compose validation and browser acceptance. Runtime artifacts/screenshots live under `exports/`; code and canonical `.mmd` diagrams remain authoritative.
