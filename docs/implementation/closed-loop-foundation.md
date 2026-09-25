# Closed-loop Intelligence foundation — audit and execution record

Direction: docs/10-closed-loop-intelligence-and-erp-maturity.md. Implementation
baseline: audit/erp-production-readiness at 77076eb, including the embedded panel
and subsequent timezone fixes. ADR-001–006 remain in force.

## Deployed P0 audit (observed before changes)

Railway project celerates-digital-intelligence has API, integration-worker, web,
PostgreSQL/pgvector and persistent MinIO. Successful API deployment ea584953 was
built from 4949302 on feat/issue-1-functional-p0; service source still tracks that
branch. API/worker/web source code is unchanged between that revision and the
current branch. ERP is a separate project and database; no direct DB binding exists.
The API configuration exposes no API_ACCESS_TOKEN variable. The source defaults
unauthenticated operation to a demo reviewer; this must close before connecting ERP.

| Finding (fact) | File/function evidence | Consequence / chosen correction |
| --- | --- | --- |
| Documents require opportunity_id and a workspace | documents.register, 001 migration documents table | Generalize the existing document/chunk/parser path with a source registry, immutable versions and governed scopes. |
| Hybrid retrieval filters only opportunity and embedding model | documents.retrieve | Add approved lifecycle + classification/scope authorization before ranking. |
| Retrieved chunks are recorded as IDs but not used in narrative/requirements | workflow.analyze, artifacts.build_pack, gateway.narrative | Reusable context snapshots must actually feed evidence into output and record exact source versions. |
| HTTP ERP adapter points to a proposed contract, not an implemented ERP route | cdi.erp.HttpERP, packages/contracts/erp-http.md | Implement a narrow typed Sales Opportunity read and approved-artifact reference command in ERP. |
| Shared token maps to generic reviewer; default demo accepts no token | api.actor, config.Settings | Explicit configured principals, roles and knowledge scopes; connected mode fails closed. |
| Demo closed loop persists into demo_erp.objects/actions | erp.DemoERP.action | Demonstrate actual Next ERP handler, actual PostgreSQL receipt and read-back, no demo fallback in connected mode. |
| Review versions and LangGraph human interrupt already exist | api.review_pack/decide, workflow.graph | Reuse and extend; require ERP-owned human approval for exact action digest/source version. |
| Events record review decisions but no reusable evaluation dataset | workflow.event/close_loop | Persist context, feedback/corrections, command receipt and evaluation case; feedback remains unapproved evidence. |
| Migration runner has no lock/checksum validation | cdi.migrate.migrate | Add serialized, checksummed migrations before adding shared foundation state. |

ERP operational assistance c2c105d passed its PostgreSQL16, browser, HTTP and Docker
CI (run 36121326251) and deployed successfully as 6faa5792. New migration 0003 applied.
The unrelated original P0 Compose job failed twice pulling the pinned Quay MinIO
image (unauthorized); API/web jobs passed. Preserve running volumes/storage. A fresh
VPS/Compose install needs registry access or a separately reviewed image replacement;
this is not evidence that the running MinIO data service failed.

## Chosen first vertical slice (judgment)

Pre-Sales is the smallest complete workflow supported by existing executable P0 and
reliable ERP tracker IDs. Read explicitly granted Sales Opportunity records, combine
uploaded TOR with approved reusable knowledge, produce the existing editable pack,
review exact versions, request an ERP Owner's approval, persist an immutable approved
artifact reference, read back the command receipt, store outcome/evaluation evidence.
Do not automatically mark Proposal Sent, Win or update any commercial/HR fields.

Three distinct stores of meaning remain: current facts in ERP; approved knowledge
in source/document/chunk metadata + S3; observations/corrections/outcomes as signals.
No automatic promotion of feedback, tuning of model weights or broad ERP replication.

## Shared primitives and boundaries

- Source registry: company/division/opportunity scope, classification, source key,
  immutable numbered versions/checksum, ingestion job, approval/deprecation, provenance.
  Reuse existing parsers, object storage, FTS and pgvector; no new retrieval service.
- Context builder: typed ERP snapshot + authorized chunks + approved knowledge +
  prior outcome references, persisted policy/workflow/model versions and source digest.
  A changed/deprecated source invalidates a pending action until fresh review.
- Named configured Intelligence principals with role/scope policy; all external
  connected access authenticated. Model mode stays explicit; no hidden demo fallback.
- ERP machine boundary: separate read/action token hashes, audience/environment,
  explicit Owner-selected record grants. Only /api/integration/v1 delegates machine
  auth; the rest of the ERP keeps its current session/Owner guard.
- ERP pending review contains complete bounded artifact content/digests and source
  version. Only authenticated active Owner can approve it in ERP. A supplied
  'approved' flag, user ID or invented approval ID cannot authorize a command.
- One allowlisted command attaches the reviewed reference. Source version, review
  expiry, current approver authorization, idempotency hash, business effect, audit,
  receipt and outbox evidence are enforced in one ERP transaction.
- Feedback/output corrections/outcomes remain versioned evaluation signals. Explicit
  curator review may promote a correction to a new knowledge version for later runs.

## Deliberate initial boundaries

No unverified capacity/project/customer crosswalk; no payroll, invoice payment,
signature or hiring writes. No arbitrary SQL/source URLs or generalized update API.
No change to the embedded ERP assistance rules; it stays an ERP-owned signal surface.
No forced external messaging. No wide role rollout or SSO claim. The existing ERP
Owner pilot and a scoped Intelligence pilot are the initial deployment audience.
No real-business approval is fabricated during verification; full-loop tests use
clearly marked disposable synthetic fixtures through the real ERP HTTP handlers.

Implementation and verification results follow as work completes.
