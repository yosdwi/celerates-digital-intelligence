# Closed-loop foundation: operator and management demonstration

## Deployment and portability

Existing Docker images and topology remain: Next ERP + its PostgreSQL/object store;
FastAPI + worker + separate PostgreSQL/pgvector + private S3; Vite web through nginx.
No new service, hosted vector dependency, n8n dependency or direct ERP database sharing.
Railway and VPS use the same images. ERP migration 0004 and Intelligence migration 002
are additive; migrations execute at service start. Keep all existing volumes and
backups. There is no destructive down-migration or automatic data seed in HTTP mode.

Configure ERP `INTELLIGENCE_ENVIRONMENT` (defaults to APP_ENV), `INTELLIGENCE_READ_TOKEN_SHA256`, `INTELLIGENCE_ACTION_TOKEN_SHA256`.
Configure both Intelligence API and worker with `ERP_MODE=http`, `ERP_BASE_URL`,
`ERP_ENVIRONMENT` matching INTELLIGENCE_ENVIRONMENT, independent `ERP_TOKEN`/`ERP_ACTION_TOKEN`,
`API_ACCESS_TOKEN` and a stable `API_PRINCIPAL_NAME` identifying the actual pilot Owner.
Use strong secrets, never URLs or source-control values. API_ACCESS_TOKEN is the
explicit single-Owner pilot fallback (reviewer+curator, Sales scopes, restricted
knowledge). Named operators can instead use `INTELLIGENCE_PRINCIPALS_JSON`: list of
id, token_sha256, roles (reviewer and optionally curator), divisions, restricted.
This is not SSO or a completed company-wide authorization rollout. Provision only
approved pilot operators; ERP's original Owner-only pilot boundary remains.

Enter workspace credential through the existing Workspace access dialog. Never put
it in a query parameter. Rotate via server configuration; queued workflows re-resolve
their recorded identity before context/action. Configure matching identities in API
and worker. No production token is included in this repository or demo fixtures.

`MODEL_MODE=demo` remains an explicit deterministic drafting/hash-retrieval mode until
an operator supplies a tested Model Gateway provider/model configuration. It can run
against the real ERP and exercise the complete governed loop; it must not be described
as a live paid-model deployment. Gateway models do narrative only; facts stay typed.

## Management demonstration (two reviewers may be the same pilot Owner)

1. ERP → Sales Opportunity Tracker: choose a non-sensitive approved demonstration
   record. From Sales Bantuan Operasional open **Review paket & akses Intelligence**.
   At `/intelligence`, choose **Izinkan baca** for that record. Other records stay hidden.
2. Intelligence → Knowledge: register a Sales playbook (division `sales`) or company
   reference (scope ID `company`). Read the source; wait for INGESTED; Approve version.
   Show that a draft does not participate in context and each version keeps its checksum.
3. Pre-Sales: open the granted ERP opportunity, attach a TOR, analyze. Open Solution:
   actual approved guidance and chunk/version citations appear beside the proposed
   approach. ERP brief remains facts; missing capacity/project history stays unknown.
4. Resolve any source gaps; edit/review all eleven current artifacts; record the
   decision. Show **ERP approval required**. Service access cannot self-approve.
5. ERP `/intelligence`: inspect exact eleven artifacts, source version and digest;
   enter a review note; approve reference storage. Back in Intelligence, Check approval.
   The workflow attaches one immutable reference in ERP, reads its receipt back and
   stores an outcome. It does not send email or change Sales commercial status.
6. Outcomes & feedback: inspect receipt and deterministic evaluation checks; record
   usefulness and a correction. Propose lesson → Knowledge: explicitly approve the
   resulting draft. Analyze the opportunity again and show the lesson in new context.
7. Optional control demonstration: change ERP source or deprecate referenced knowledge
   before action; old review cannot complete. Retry the same successful command key:
   same receipt, one business effect. Revoke record access: subsequent reads are denied.

## What the shared foundation does and does not claim

Context builder `/api/contexts/build` assembles operational, source_evidence,
knowledge and observations separately. Workflow snapshots store policy/workflow versions,
actor, source version/checksums, context digest. Artifacts carry gateway/prompt metadata,
versions and reviews. Outcome links exact context, receipt and deterministic checks;
feedback stores attributed ratings/corrections and idempotent request keys. This is an
auditable evaluation case, not a measured quality improvement claim or automated model
training. Prior outcome references are observations, never operational facts.

Company/division/opportunity scope plus classification filters run before ranking.
Only active approved versions enter knowledge retrieval. Historical artifacts are
checked against the current reader's knowledge access. Deprecation prevents reuse and
invalidates a pending action; completed historical outcomes remain an audit record.
Knowledge/action revalidation is immediately before the remote command; cross-database
atomic revocation is not claimed. ERP source/approval checks are atomic inside ERP.

The ERP floating panel and Feature Request remain native ERP consumers/signals. Existing
PMO read-safety and feedback BA completion gates stay in place. Feature Requests are
not silently indexed or duplicated in knowledge. Automatic Feature Request import,
non-Sales workflow consumers, broad role rollout, SSO, delivery capacity, commercial
writes, event-consumer synchronization, ranking benchmarks and retention automation
are intentionally deferred.

Parser failure is visible and requires curator retry. Text/Markdown/CSV use the same
existing UTF-8 parser; PDF/DOCX/XLSX use the existing optional Docling path. No new URL
fetcher/connector bypass or arbitrary SQL generation is introduced. Knowledge sources
are upload-governed; SQL Server/Jira remain interface-only as in P0.
