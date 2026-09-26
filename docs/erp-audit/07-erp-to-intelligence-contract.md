# 07 — Controlled ERP → Intelligence contract

**Status: proposed v1 boundary, not an implemented ERP API.** The ZIP supplies only auth and cron route handlers. F22 must close before binding real ERP data/actions. The Intelligence application's existing mock/P0 adapters are not proof that these endpoints exist.

Preserve ADR-001 Python integration, ADR-002 PostgreSQL/pgvector/FTS, ADR-003 Model Gateway, ADR-004 controlled workflows and ADR-005 storage baseline. ERP owns operational state; Intelligence owns derived analysis, retrieval metadata, workflow runs and drafts. n8n can trigger approved supporting workflows but cannot bypass the Python adapter or ERP command authorization. No direct arbitrary ERP-table reads/writes from models, retrieval jobs or agents.

## Identity, transport and versioning

R: expose `/api/integration/v1` from ERP application code or a thin ERP-owned facade invoking the same authorized domain services. Use HTTPS and a separately scoped service identity; do not reuse a human NextAuth cookie, owner login, Google token or Supabase service-role key. First pilot may use a high-entropy, rotated opaque service token stored hashed server-side with audience/environment/scopes; evolve to short-lived signed/OAuth credentials if an issuer is available. Token provisioning/revocation is an admin operation and never model-controlled. Separate READ, EVENT and ACTION scopes and credentials. Default integration principal is read-only.

Requests carry `Authorization: Bearer ...` and `X-Correlation-Id`. Verify principal active state, intended environment/audience, scope and permitted domains/records/fields on every request. User-context access is a trusted server-resolved delegation, not an arbitrary `user_id` supplied by a model. A service's access cannot be expanded by prompt content. Do not add broad `/api` middleware bypasses; only this route family delegates to its own fail-closed machine authorization.

IDs are opaque ERP UUIDs with explicit entity type; business numbers are display/lookup keys, not cross-domain identity. Distinguish `sales_opportunity` (sales tracker) from `commercial_pq` (table `opportunities`). Project identity is a **proposed curated mapping**, not a new invented fact or an assumed one-to-one PQ relationship. Require source mapping/version before emitting project facts. Money is `{amount: "decimal string", currency: "IDR"}` with a documented unit, never model arithmetic. Dates are ISO local business dates; instants are RFC3339 UTC with explicit business timezone when needed.

Every read includes `schema_version`, `as_of`, `record_version`, `source_refs`, `quality` and `correlation_id`. Record versions and stable change watermarks are additions required in ERP; `created_at` alone cannot detect updates/deletes. Unknown/missing/unmapped values are explicit null/quality reasons, not zero/false defaults. Additive optional fields are compatible; changed meanings or required fields require v2 and consumer migration. Contract schemas/fixtures live in Git with provider/consumer CI.

## READ contract

Proposed endpoints: `GET /resources/{resource_type}/{id}` and `GET /resources/{resource_type}?cursor=...&limit=...&updated_after=...`, under the v1 prefix. `limit` defaults 100, maximum 500; cursor is opaque, scoped to principal/filter/snapshot and stable `(change_sequence,id)` ordering. Return `next_cursor` and a snapshot watermark; tombstones preserve delete/revocation handling. Bulk export is a separate bounded, audited job, never `SELECT *` exposed to agents. Individual ETags and conditional GET prevent unnecessary refresh. Invalid/expired cursor requires explicit resync, not silent restart.

| READ type / scope | Source evidence (F) | Proposed minimum projection (R) / quality gate |
| --- | --- | --- |
| `sales_opportunity`, `customer` / `erp:commercial:read` | `salesOpportunityTrackers`, leads; `crmClients`/`clients`, `sales/accounts/actions.ts` | UUID, business number, curated customer ref, requirement summary, position/headcount, commercial stage, owner reference and relevant dates. Explicit client crosswalk; no name-based silent merge. |
| `commercial_pq` / `erp:commercial:read` | `opportunities`, `pq-approval.ts` | PQ ID/number, tracker/onboarding refs, commercial terms allowed by scope, approval status/version. Never treat tracker and PQ IDs as interchangeable. |
| `employee`, `talent_skill` / `erp:talent:read` | employees→onboarding→candidate, `talentAssignments.current_skill/current_certification` | Employee identity, approved display name/role, curated skill assertions with evidence and verification state. Exclude NIK/NPWP/bank/religion/payroll by default. Free text becomes unverified evidence, not certified skill. |
| `project`, `allocation` / `erp:delivery:read` | PQ/requisition, talent assignments, project contracts | Curated project ID/source mapping, dates, assigned employee ref/status; allocation fraction only if explicitly captured and approved. No inferred capacity from assignment count. |
| `contract` / `erp:documents:read` | employmentContracts/projectContracts | Typed contract ID, parties' authorized references, effective/end dates, status, document reference/digest/version. Commercial values require extra field scope. |
| `bast`, `invoice` / `erp:finance:read` | `projectInvoices.bast_support_doc_url`, `submit_bast_date`, `status_code`; finance handoffs | Invoice ID/month, typed project/PQ refs, approved amounts, submission/evidence status and handoff reference. No dedicated BAST table exists; PMO/Finance must define BAST “pending” and receipt semantics before activating that projection. |
| `timesheet` / `erp:time:read` | timesheet entries/submissions/exports, user ownership helpers | Period, explicit user↔employee mapping, approved totals/status and evidence refs. Draft/rejected time stays distinguishable. No unapproved timesheet totals described as billable revenue. |
| `capability`, `capacity` / `erp:capacity:read` | Free-text assignment skills/dates/status; no full capacity model | Curated competency facts and deterministic capacity by date window, calendar and allocation rule version. Return `quality=unknown`/reason until required inputs exist. |
| `approval`, `workflow_state` / `erp:workflow:read` | signature requests, extension journey, time-off steps, finance receipt | Entity/version, current state, eligible role/approver refs, evidence and transition timestamps. Service response does not authorize the agent to sign/approve. |

Document bytes require `GET /documents/{id}/download` with fresh parent authorization, classification and download audit. Return a short-lived authorized URL or stream; the stable contract stores document ID/digest, not a persisted signed URL. Retrieval ingestion allowlists suitable knowledge/artifacts, carries source ACL/version and deletion tombstones, and revalidates authorization at query time. A vector index is never a workaround for ERP access restrictions or a reason to embed every employee/invoice row.

## EVENT contract and delivery

R: write business change, audit and outbox event in the **same ERP transaction**. Publish at least once to a Python adapter via authenticated `GET /events?cursor=...&limit=...`; persist the consumer cursor only after durable ingestion. Initial polling avoids exposing a consumer webhook. A future webhook uses verified signatures, replay protection and the same event envelope. Do not log raw PII/draft prompts in the event.

| Event type | Trigger/definition | Source / prerequisite |
| --- | --- | --- |
| `opportunity.changed.v1` | Authorized create/change of tracker or PQ, with explicit entity type and new version | Existing sales actions; new transactional outbox |
| `approval.changed.v1` | Approved state transition, including rejection/override, committed with actor/evidence | Signature/extension/time-off/Finance actions; concurrency guard required |
| `bast.pending.v1`, `bast.updated.v1` | Deterministic policy marks expected BAST missing, or approved submission/evidence changes | Invoice fields; **blocked until BA defines due/received rules**. Derived event includes policy version and occurrence key. |
| `contract.expiry_proximity.v1` | Daily deterministic threshold crossing in business timezone | Contract end date; threshold policy (e.g. proposed 30/14/7 days) approved by owner, not hardcoded as existing behavior |
| `project.milestone.changed.v1`, `workflow.milestone.changed.v1` | Accepted milestone/transition, with previous/new version | Curated project mapping / existing domain workflow. No generic arbitrary status string. |
| `user.case.changed.v1`, `service.case.changed.v1` | User-facing support/service case change | A governed case aggregate is **not evidenced in ZIP**; define owner/state model before implementation. Feedback tracker remains a separate requirement workflow unless BA explicitly maps a subset. |
| `record.deleted.v1`, `access.revoked.v1` | Tombstone or visibility/ACL change | Required for downstream deletion/re-indexing and access enforcement |

Envelope example (synthetic):

```json
{
  "schema_version": "1.0",
  "event_id": "11111111-1111-4111-8111-111111111111",
  "event_type": "opportunity.changed.v1",
  "aggregate": {"type": "sales_opportunity", "id": "22222222-2222-4222-8222-222222222222", "version": 7},
  "occurred_at": "2026-09-23T10:00:00Z",
  "correlation_id": "audit-example-only",
  "change_kind": "updated",
  "changed_fields": ["requirement_summary"],
  "resource_ref": "/api/integration/v1/resources/sales_opportunity/22222222-2222-4222-8222-222222222222"
}
```

Consumers deduplicate by `event_id` and apply only newer aggregate versions. Out-of-order versions trigger authoritative re-read; no global business ordering is assumed. Transactional outbox sequence/cursor implementation must handle concurrent commit ordering without skipping an uncommitted lower sequence. Use a committed publication sequence or overlap/reconciliation design, with a concurrency test proving no loss. Failed deliveries back off and enter a reviewable dead-letter queue; replay retains original IDs. Proposed initial retention is 30 days with explicit expiry/resnapshot protocol, subject to data policy. Reconcile source watermarks/counts periodically, not just delivery success. Redaction/revocation must invalidate retrieval access even before background deletion completes.

## ACTION contract

R: `POST /commands`, `GET /commands/{command_id}`. Only allowlisted typed commands; no free-form SQL, table name, object path, arbitrary URL fetch or generic “update any field.” The ERP command handler calls validated domain services. First rollout requires a server-verifiable human approval record for **every action**, including task creation; future lower-risk automation can use an explicitly approved policy version, never a model-created exception.

| Command / scope | Allowed effect | Boundary and approval |
| --- | --- | --- |
| `task.create`, `task.update` / `erp:task:command` | Create/update title, description, assigned user, due date on authorized tasks | Existing Kanban needs actor IDs and authorization hardening. Parent/business refs validated; does not approve a financial or HR workflow. |
| `case.create` / `erp:case:command` | Open a proposed governed service case with category/evidence | New case model and business ownership required; do not silently repurpose all feature requests as service cases. |
| `workflow.status.update` / `erp:workflow:command` | Only allowlisted task/case transitions such as todo→in_progress | Expected version and approved transition. Cannot mark invoice paid, approve payroll, sign a contract, approve leave or override a business approval. Critical status changes stay human ERP actions. |
| `artifact.persist_approved_reference` / `erp:artifact:command` | Persist immutable reviewed artifact ID/digest/version on authorized business record | Revalidate human approval against exact artifact and source versions. Attach a reference; do not overwrite ERP commercial truth. |
| `reminder.acknowledge`, `reminder.escalate` / `erp:reminder:command` | Record acknowledgement/escalation case for a specific occurrence | Ownership and escalation policy. Does not send arbitrary email/WhatsApp; external send requires separate human-approved delivery boundary. |
| `document.attach_generated_reference` / `erp:document:command` | Attach reviewed generated document ID/digest as a new version | Managed allowed storage only; parent authorization, scan/classification, immutable content. Never forge a signature or replace an executed contract. |

### Authorization, approval and atomicity

1. Authenticate service, enforce scope/resource/field policy, validate strict command schema (reject unknown fields) and size/rate limits.
2. Require `Idempotency-Key`; scope it to principal+environment+command kind. Store canonical request hash. Same key/same payload returns the original result; same key/different payload returns 409. Keep receipts for at least the approved retry/replay period (proposed 90 days); permanent business uniqueness also prevents later duplicate creation. Do not rely on HTTP transport for exactly-once delivery.
3. Resolve `approval_id` against a trusted server-side review record containing human identity, role, approved command/artifact digest, source versions, environment, expiry and allowed effect. A free-form ID or “approved” field from the agent is insufficient. Revalidate approver authority and current source versions. Changed source/expired review requires new human review.
4. In one DB transaction: claim idempotency key, compare target version/state, apply allowed mutation, consume/bind approval as appropriate, write command receipt + immutable audit + outbox. Same-payload retry uses receipt before rejecting an already-consumed approval. Concurrency tests must prove one effect and one consistent receipt.
5. Return 201 for immediately applied command receipt or 202 for durably accepted pending work; never report pending as applied. GET returns `accepted`, `applied`, `rejected`, `failed` or `unknown_external_outcome` with correlation and safe error. External storage/mail side effects need retry/reconciliation separate from the DB transaction.

Audit includes actor service, human reviewer, command/idempotency/approval IDs, entity/version before/after, reason, policy version, payload/artifact digest, source refs, outcome, event IDs and timestamp. Redact PII and credential content. A service identity must not impersonate the human signer's account.

### Errors

All errors use `{error: {code, message, retryable, correlation_id, details}}`; details contain safe field pointers, never SQL/stack/secrets. 401 invalid credential; 403 denied scope; 404 inaccessible/missing resource where existence should be hidden; 409 stale version/state or idempotency conflict; 412 approval/source precondition failure; 422 schema/business-rule error; 429 throttle with `Retry-After`; 503 temporary dependency failure. The adapter retries only retryable outcomes with the original key and bounded backoff. Lost response requires querying the existing command receipt, not inventing a new key.

## Prohibited AI writes

No AI principal directly changes employee identity/bank/tax/payroll, salary/COGS, contract commercial terms, signatures/approvals, invoice/payment truth, access grants, encryption secrets, audit logs, source mappings or schema. No direct ERP database credentials are present in Intelligence. Model output is a proposal; deterministic ERP code computes money/capacity/state and a human controls critical decisions and external communication. Prompt injection in a retrieved document cannot expand allowed tools, recipients or fields.

## Testable acceptance and incremental binding

Machine-readable [envelope schema](contracts/erp-intelligence-v1.schema.json), [synthetic fixtures](contracts/fixtures.json) and [contract checker](contracts/check-contract.py) accompany this proposal. They validate common envelope invariants only; endpoint implementations, every resource DTO, authorization and full command-payload validation remain Wave 5 work. Passing fixtures must not be reported as a passing live API.

| Test ID | Provider/adapter acceptance scenario |
| --- | --- |
| C01 | READ without token / wrong scope / foreign record returns denied response; unauthorized fields and documents never reach index or model. |
| C02 | Same business number across tracker/PQ returns distinct typed entities; missing client/employee/project map is explicit unknown. |
| C03 | Stable pagination with concurrent create/update/delete yields complete snapshot/change stream, no skipped commits; expired cursor requires resnapshot. |
| C04 | Duplicate/out-of-order event and replay do not duplicate workflow runs; source transaction rollback emits no event; publisher crash recovers. |
| C05 | Missing/stale/expired/forged approval rejects a command; rejected command causes zero business/outbox writes. |
| C06 | Concurrent same-key commands have one effect; changed-payload reuse returns 409; response loss returns original receipt on retry. |
| C07 | Unknown action or forbidden payroll/payment/signature/access field returns 422/403; model-supplied actor/scope cannot escalate access. |
| C08 | Updated/deleted/revoked document is inaccessible immediately at retrieval authorization, with eventual index cleanup confirmed. |
| C09 | Storage/provider failure after accepted command is recoverable and honestly reported; no duplicate document/message effect. |
| C10 | Pre-sales flow reads real opportunity plus authorized evidence → Intelligence drafts through Gateway → human reviews exact digest/source versions → ERP persists approved reference → read-back shows one receipt and artifact version. |

Start with read-only commercial/customer DTOs and fake-provider consumer tests. Add typed document evidence, event outbox, then one approved-artifact command. Add exception/BAST, staffing/capacity and service cases only after their semantics/data ownership are accepted. Intelligence work can proceed against fixtures while ERP hardening continues, without inventing operational facts or coupling directly to tables.
