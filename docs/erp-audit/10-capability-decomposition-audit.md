# 10 — ERP Capability Decomposition Audit

**Audit baseline:** `audit/erp-production-readiness` @ `83bbf822033c43f3736214f7ead823376acc5c21`  
**Scope:** Issue #5, `docs/09-reference-product-study.md`, `docs/01-product-and-architecture.md`, `HANDOFF-ERP-AUDIT-ASTRA.md`, the complete `apps/erp` path inventory, current Drizzle schema/migrations, stateful Server Actions, shared libraries, API routes, automation, auth/access, storage, tests, and the prior evidence-backed ERP audit set.

This document is the decomposition gate required **before broad ERP implementation**. It does not authorize a rewrite of stable ERP workflows. It records current ownership, target ownership, regression risk, and the contract that must exist before Celerates Intelligence binds to operational data.

## 1. Classification rules

- **KEEP** — the capability and operational authority belong in ERP; hardening may still be required.
- **REWORK** — responsibility remains in ERP, but identity, workflow, authorization, historical semantics, or reliability must be reshaped before broad rollout/integration.
- **EXTRACT** — reasoning/orchestration belongs behind the Intelligence Layer / Integration Core, while ERP remains the source of operational truth.
- **DEPRECATE** — transitional/duplicate ERP-local implementation should be retired under a controlled migration.
- **SHARED** — platform capability used by ERP and Intelligence; business authority still remains with the owning domain.

Classification is about **responsibility**, not code motion for its own sake. A `KEEP` capability can have P1 hardening work; a `SHARED` transport does not become a source of truth; an `EXTRACT` capability cannot bypass ERP commands.

## 2. Executive conclusion

The current ERP already contains a broad operational core. The dominant architectural risk is **not missing CRUD**; it is allowing Intelligence, integrations, or transitional sync paths to create a second operational authority.

The target boundary is therefore:

```text
Celerates ERP — Digital Operational Core
  authoritative operational state + deterministic rules
             │
             │ controlled READ / EVENT / ACTION
             ▼
Celerates Intelligence Layer
  Context & Knowledge • Intelligence Core • Model Gateway
             │
             ├─ Pre-Sales Intelligence
             ├─ Exception Management
             ├─ Human Services
             └─ Management Intelligence
             │
             ▼
 human review / explicitly approved automation
             │
             ▼
ERP typed command → ERP state change
```

Important current-state correction: there is **no functioning generic chatbot or LLM capability inside `apps/erp` to preserve**. `package.json` contains no OpenAI/Anthropic/Gemini/model SDK, `src/lib` contains no model client or gateway, document generation is deterministic DOCX merge, and the Astra timesheet generator is deterministic Excel generation. The reminder engine is deterministic schedule/template code; its cron is intentionally disabled and its WhatsApp transport is a stub. Therefore there is currently **no hidden AI implementation that should be treated as ERP business authority**.

## 3. Capability decomposition register

### 3.1 Commercial / Marketing / Sales

| Capability | Class | Current evidence | Current source of truth | Target owner | Rationale / regression risk | Proposed contract | Phase |
|---|---|---|---|---|---|---|---|
| Lead capture, qualification, lead lifecycle | **KEEP** | `src/app/marketing/actions.ts::{createLead,updateLead,deleteLead}`; schema `leads` | ERP PostgreSQL `leads` | ERP Commercial Core | Business fact and qualification state are operational facts. Preserve `lead_no`, qualification/disqualification rules, attachments/notes. | READ `lead`; EVENT `lead.changed.v1`; no AI direct mutation initially | P1 preserve + test |
| Lead → Sales Opportunity conversion | **KEEP** | `marketing/actions.ts::convertLeadToOpportunity` now locks source row and copies project, role, headcount, level, price and price period into `salesOpportunityTrackers` | ERP transaction | ERP Commercial Core | Prior field-continuity finding is closed in current branch. Regression risk is duplicate conversion and future field drift; keep mapping regression test. | EVENT `opportunity.changed.v1` after committed conversion | P1 preserve |
| Pre-sales Opportunity Tracker | **KEEP** | `src/app/sales/opportunity-tracker/actions.ts::{createOpportunityTracker,updateOpportunityTracker,convertToRequisition}`; `sales_opportunity_trackers` | ERP | ERP Sales | This is the canonical **pre-sales opportunity** aggregate. Do not conflate it with downstream PQ. | READ `sales_opportunity`; EVENT `opportunity.changed.v1` with typed aggregate | P2 READ first |
| Commercial PQ / downstream opportunity | **KEEP** | `src/app/sales/actions.ts`; `opportunities`; `pq-approval.ts`; tracker conversion creates PQ and requisition in one transaction | ERP | ERP Sales / Commercial approval | Operational commercial terms and approval state must remain deterministic ERP truth. | READ `commercial_pq`; EVENT `approval.changed.v1`; critical approval stays ERP-human | P2/P3 |
| Opportunity identity semantics | **REWORK** | schema defines both `sales_opportunity_trackers` and `opportunities`; requisition points to tracker while assignment/project records can point to PQ | ERP contains both valid concepts | ERP data model + contract facade | UUID shape cannot distinguish concepts. Contract must never expose generic `opportunity_id` without entity type. | Explicit resources `sales_opportunity` vs `commercial_pq`; typed `source_refs` | P1 before Intelligence |
| CRM accounts / contacts / activities | **REWORK** | `src/app/sales/accounts/actions.ts`; `crm_clients`, `crm_client_contacts`, `crm_client_activities`; separate schema `clients`; free-text `client_name` across flows | Split/ambiguous in ERP today | ERP Sales master-data authority | Two client concepts + exact/free-text names can split joins, totals and retrieval. Do not auto-merge same-name companies. | READ `customer` only after approved crosswalk; EVENT `customer.changed.v1` | P1 canonicalization |
| Profitability tracker / margin snapshot | **REWORK** | `src/app/sales/profitability-tracker/actions.ts::syncProfitabilityFromTalents`; `profitability_entries`; recalculates current COGS/default rates into chosen historical month | ERP | ERP Finance/Commercial deterministic metrics | Current rerun can rewrite historical economics from current assignment data; integer money/rate provenance also matters. AI must not calculate official margin. | READ `profitability_snapshot` after period/version policy; EVENT `profitability.closed.v1` later | P1 before management use |
| Commercial explanation, proposal drafting, account/opportunity synthesis | **EXTRACT** | no model client exists in ERP; reference architecture assigns reasoning to Intelligence | ERP supplies facts; Intelligence owns derived drafts | Intelligence / Model Gateway | Prevent model reasoning from becoming commercial truth. Drafts need source versions and human review. | READ commercial/customer/document projections; ACTION only `artifact.persist_approved_reference` | P3 Intelligence |

### 3.2 Talent Acquisition / Onboarding

| Capability | Class | Current evidence | Current source of truth | Target owner | Rationale / regression risk | Proposed contract | Phase |
|---|---|---|---|---|---|---|---|
| Requisition management | **KEEP** | `src/app/ta/actions.ts`; `requisitions`; `convertToRequisition` creates requisition from typed sales tracker | ERP | ERP TA | Staffing demand is an operational fact. Preserve tracker linkage and explicit Sales PIC vs TA PIC. | READ `requisition`; EVENT `requisition.changed.v1` | P2 |
| Candidate master | **KEEP** | `src/app/ta/candidates/actions.ts`; `candidates` with UUID and business number | ERP | ERP TA | Candidate identity must be UUID/business number, never candidate name. | READ tightly scoped `candidate_summary` when authorized; EVENT `candidate.changed.v1` | P2 scoped |
| Application / candidate pipeline / client submission | **KEEP** | `applications`; TA pipeline/client-active actions; separate hiring and client-submission status fields | ERP | ERP TA | Pipeline state is deterministic workflow state. Preserve the separation between TA hiring state and client-submission state. | READ `application`; EVENT `candidate.pipeline.changed.v1` | P2/P3 |
| Onboarding intake and PII capture | **KEEP** | `src/app/ta/onboarding/actions.ts::createOnboardingRequest`; `onboarding_requests`; `pii-crypto.ts` encrypts selected PII | ERP | ERP TA/HR | Operational onboarding and sensitive identity data belong in ERP. Intelligence projection must exclude NIK, NPWP, bank, family-card, religion and payroll by default. | READ `onboarding_status` with minimal projection only; no general raw PII resource | P1 security |
| Offering-letter / onboarding signature workflow | **REWORK** | `sendOfferingLetterForSignature`; `signature_requests`; notification occurs as separate side effect | ERP | ERP workflow | Keep signing authority in ERP, but add version/concurrency/idempotency/outbox semantics before automation. | READ `approval`; EVENT `approval.changed.v1`; no AI signing command | P1 |
| Promote onboarding → Employee | **REWORK** | `promoteToEmployee` creates employee + contract + BPJS transactionally, then follow-up `onTalentPromoted`/activity/notification occurs outside transaction | ERP | ERP TA→HR | Core local transaction is good; downstream effects can fail after commit and retry can see “already promoted”. Add outbox/idempotent recovery; do not rewrite domain outcome. | EVENT `employee.created.v1` from same transaction/outbox | P1 |
| Candidate/talent matching reasoning | **EXTRACT** | no LLM/retrieval implementation in ERP; structured candidate/requisition facts exist | ERP facts + curated knowledge | Intelligence | Matching/explanation is derived reasoning. ERP remains authority for candidate/application state. | READ requisition + approved candidate/talent projections; ACTION creates draft/task only | P3 |

### 3.3 HR / People / Talent Management

| Capability | Class | Current evidence | Current source of truth | Target owner | Rationale / regression risk | Proposed contract | Phase |
|---|---|---|---|---|---|---|---|
| Employee master | **KEEP** | `src/app/hr/actions.ts::updateEmployee`; `employees` | ERP | ERP HR | Employee operational identity belongs in ERP. | READ `employee` with field scopes; EVENT `employee.changed.v1` | P2 |
| Employment contract + BPJS administration | **KEEP** | `hr/actions.ts::{addContract,updateBpjsStatus}`; `employment_contracts`, `bpjs_registrations` | ERP | ERP HR | Official HR state must remain deterministic and human governed. | READ typed `employment_contract`; EVENT `contract.changed.v1`; expiry event derived by approved rule | P2/P3 |
| Employee personal data editing | **KEEP** | `hr/actions.ts::updateEmployeePersonalData` writes back to linked `onboarding_requests` with encryption | ERP | ERP HR | Current data model intentionally reuses onboarding row as personal-data record. Do not expose sensitive fields to general Intelligence. | No general AI ACTION. Restricted READ only if a use case is explicitly approved. | P1 |
| User ↔ employee identity linkage | **REWORK** | `employees.onboarding_request_id` lineage; timesheet/attendance use `users`; prior audit shows employees may lack onboarding chain and users may lack employee row | Split identity in ERP | ERP Identity/HR | Never silently join by email/name. Required before reliable human-services personalization/capacity. | READ resources include explicit `user_ref`/`employee_ref` and `quality`; no inferred mapping | P1 |
| Talent assignment / project placement | **KEEP** | `src/app/tm/actions.ts::{createTalentAssignment,updateTalentAssignment}`; `talent_assignments` | ERP | ERP TM | Assignment status/dates and approved commercial linkage are operational facts. | READ `allocation`; EVENT `talent.assignment.changed.v1` | P2 |
| Salary/COGS deterministic calculator and stored components | **KEEP** | `src/lib/cogs-calculator.ts`; `src/app/tm/cogs-calculator/actions.ts`; COGS-managed fields in `tm/actions.ts` | ERP | ERP TM/Finance | Money and payroll-adjacent calculations must stay deterministic. AI can explain, never author official values. | Restricted READ summary; **no AI write** to salary/COGS/tax/BPJS fields | P1 |
| Skills / certifications / capability model | **REWORK** | `talent_assignments.current_skill` and `.current_certification` are free text; no validated taxonomy/evidence ledger | ERP contains weak evidence | ERP capability master; Intelligence may retrieve/explain | Free text is not a certified skill. Need typed skill assertion, evidence, verification state/version before staffing intelligence can rely on it. | READ `talent_skill` with verification/quality; EVENT `talent.skill.changed.v1` | P1/P2 |
| Capacity / availability | **REWORK** | assignment dates/status exist; no complete allocation fraction/calendar capacity model | No authoritative complete model today | ERP TM/HR | Do not let Intelligence infer available capacity from headcount or assignment count. Return unknown until deterministic inputs/rule exist. | READ `capacity` returns `quality=unknown` until model approved | P1 business definition |
| Extension / increment request + approval journey | **KEEP** | `tm/actions.ts`; `approval-journey.ts`; `extension_increment_requests`; approver chain | ERP | ERP TM/HR | Business request and human approval remain ERP. | READ `approval`; EVENT `approval.changed.v1`; AI may draft explanation only | P2/P3 |
| People summary / performance interpretation | **EXTRACT** | structured and narrative fields exist (`people_summarize`, performance refs), but no model reasoning in ERP | ERP stores facts/evidence | Intelligence | Summarization/recommendation is derived and should use authorized evidence with provenance. | READ employee/skill/performance evidence projection; no direct HR critical writes | P3 |

### 3.4 PMO / Delivery / Finance

| Capability | Class | Current evidence | Current source of truth | Target owner | Rationale / regression risk | Proposed contract | Phase |
|---|---|---|---|---|---|---|---|
| Project document tracker | **KEEP** | `src/app/pmo/actions.ts::{createProjectDocument,updateProjectDocument}`; `project_documents`; Sales edit also shares the same record fields | ERP | ERP PMO | Document status/metadata belong with operational project state. Preserve shared-record semantics rather than copy into Intelligence. | READ `project_document`; EVENT `document.updated.v1` | P2 |
| Project contract / billing schedule | **KEEP** | `pmo/actions.ts::{createProjectContract,updateProjectContract,generateMonthlyBillings}`; `project_contracts`, `project_monthly_billings` | ERP | ERP PMO | Contract and deterministic schedule are operational truth. | READ `contract`; EVENT `contract.changed.v1`, `billing.schedule.changed.v1` | P2/P3 |
| Invoice tracker + BAST evidence | **KEEP** | `project_invoices`; `bast_support_doc_url`, `submit_bast_date`, attachments; no dedicated BAST table | ERP | ERP PMO/Finance | Invoice state is ERP truth. “BAST pending” semantics are not yet a canonical aggregate; do not invent them in Intelligence. | READ `invoice`; `bast` projection only after BA defines due/received semantics; EVENT `bast.pending/updated` then | P1 definition |
| Read-triggered PMO materialization | **REWORK** | `pmo/actions.ts::{syncOverdueInvoices,syncBillingScheduleToInvoices,syncDocumentTrackerFromContracts}` mutate data and are documented as running when pages open | ERP | ERP PMO jobs/commands | Viewing should not silently materialize/transition state. Race risk and audit ambiguity. Move to explicit command/job with version/unique constraints. | EVENT after deterministic job commit; no Intelligence write | P1 |
| Finance document handoff | **REWORK** | `src/app/finance/actions.ts::{acknowledgeFinanceHandoff,requestRevisionFinanceHandoff}`; handoff is effectively one per opportunity while invoices can be monthly | ERP | ERP PMO/Finance | Must resolve dossier-vs-invoice cardinality and validate parent relationships before real billing automation. | READ `finance_handoff`; EVENT `finance.handoff.changed.v1` after model fix | P1 |
| Finance acknowledgement/revision decision | **KEEP** | Finance actions only accept `notified` state then set received/revision and notify PMO | ERP | ERP Finance | Human financial workflow remains ERP. Add CAS/version concurrency before broad use. | READ `workflow_state`; EVENT `approval.changed.v1`; no AI payment/receipt truth write | P1/P3 |
| Overtime/business-trip claims | **KEEP** | `src/app/pmo/overtime-business-trip/actions.ts`; schema `overtime_business_trip_claims` | ERP | ERP PMO/HR/Finance | Operational claim workflow, not an Intelligence-owned entity. | READ only if use case needs it; EVENT claim transition later | P2 |
| Project identity | **REWORK** | no single canonical `projects` table; project semantics span PQ/opportunity, contracts, docs, invoice and assignment refs | Composite/implicit ERP model | ERP PMO master-data owner | Intelligence must not invent one-to-one project identity. Establish curated project mapping/version first. | READ `project` only after explicit source mapping; resource exposes `source_refs` | P1 |
| Objective exception detection | **REWORK** | invoice overdue logic exists as SQL mutation on page-open; other exception rules are scattered/absent | ERP deterministic facts | ERP rule engine/event producer | Objective “missing/overdue/expiring” conditions should be deterministic, policy-versioned, and evented; AI only explains/prioritizes/drafts. | EVENT `*.exception.detected.v1` with policy version + occurrence key | P2/P3 |
| Exception explanation / management synthesis | **EXTRACT** | no model implementation inside ERP | ERP emits facts/events | Intelligence | Reasoning layer can explain why an exception matters and draft next step, but cannot redefine operational truth. | READ source facts + EVENT feed; ACTION typed task/case only | P3 |

### 3.5 Time / Attendance / Learning

| Capability | Class | Current evidence | Current source of truth | Target owner | Rationale / regression risk | Proposed contract | Phase |
|---|---|---|---|---|---|---|---|
| Timesheet submission / approval | **KEEP** | `src/app/timesheet/actions.ts::{createTimesheetSubmission,approveTimesheetSubmission}`; `timesheet_submissions` uses session user ownership | ERP | ERP Time/PMO | Approved time state stays ERP. Need explicit user↔employee mapping for cross-domain Intelligence. | READ `timesheet`; EVENT `timesheet.submitted.v1`, `timesheet.approved.v1` | P2/P3 |
| Jira Tempo XLSX converter | **KEEP** | `timesheet/actions.ts::parseAndPreviewConverter`; `jira-parser.ts`, `calendar-mapper.ts` | Jira file is source evidence; ERP becomes authority only when saved/submitted | ERP ingestion utility | Deterministic parser, not AI. Preserve input-format regression tests. | No generic Intelligence contract needed; optional ingestion provenance | P1 |
| Astra timesheet XLSX generation | **KEEP** | `src/app/timesheet/lib/astra-generator.ts::generateAstraTimesheetXlsx` uses `ExcelJS` + official template | ERP | ERP Time | “Astra” here is a client/template name, not an AI capability. Deterministic artifact generation belongs with timesheet workflow. | ACTION from Intelligence not needed | P1 preserve |
| Attendance / time-off | **KEEP** | `attendance/live/actions.ts`, `attendance/time-off/*`; attendance/time-off schema | ERP | ERP HR/Time | Operational attendance and leave state belongs in ERP. | READ `attendance_summary`, `time_off`; EVENT approved transitions | P2 |
| Business timezone / attendance day semantics | **REWORK** | prior audit found UTC ISO day usage and reminder locale/time ambiguity | ERP | ERP Time policy | Must define named business timezone (currently project context uses Jakarta) and test midnight/month boundaries. | READ includes timezone/rule version; events use UTC instant + business date | P1 |
| School/LMS | **KEEP** | `src/app/school/actions.ts`; course/module/lesson/quiz/enrollment/progress tables | ERP | ERP Learning | Stable operational learning records stay ERP. Do not equate course completion with verified staffing certification unless business approves mapping. | READ optional `learning_progress`; no initial Intelligence write | P2 |

### 3.6 Workflow, documents, automation, integrations, platform

| Capability | Class | Current evidence | Current source of truth | Target owner | Rationale / regression risk | Proposed contract | Phase |
|---|---|---|---|---|---|---|---|
| Generic attachments/document metadata | **KEEP** | `attachments.ts`, attachment tables and typed `source_type/source_id`; parent business records own meaning | ERP metadata | ERP parent domain | Parent record authorization and immutable lineage remain required. | READ returns document ID/digest/version, not persisted signed URL | P1/P2 |
| Private object storage transport | **SHARED** | `src/lib/object-store.ts`; S3 buckets `candidate-documents` and `automation-documents`, 20 MB cap, `IfNoneMatch:*`; `/api/documents` | Object bytes in S3; parent metadata in ERP | Shared platform infra | Binary storage is infrastructure, not business truth. Intelligence may store approved artifacts in a separate governed namespace but cannot bypass parent ACL. | Short-lived authorized download; ACTION attaches approved reference only | P1 |
| Deterministic template document generation | **SHARED** | `automation/documents/actions.ts`; `document-merge.ts`, `docx-autofill.ts`, `docxtemplater` | ERP template metadata + object store | Shared document service; ERP owns approved business linkage | Generic merge engine is reusable; contract/offering semantics remain with ERP. No LLM involved. | ACTION `document.attach_generated_reference` after review; source versions recorded | P2 |
| In-app notifications | **SHARED** | `src/lib/notifications.ts::{createNotification,notifyDivision}`; `notifications` | ERP notification record | Shared delivery/service layer with ERP policy | Delivery mechanism can serve both products; triggering business rule and recipient authorization stay domain-owned. | EVENT drives delivery; no model arbitrary recipient/title/body send | P2 |
| Reminder definitions / rule evaluation | **REWORK** | `automationReminders*`; `reminder-engine.ts::{getDueReminders,runReminder}` evaluates weekday and renders placeholders | ERP automation config | ERP deterministic rule producer + shared delivery | Current engine lacks robust occurrence identity/timezone/idempotency. Keep outbound disabled until occurrence ledger/retry/dead-letter tests. | EVENT `reminder.due.v1`; ACTION `reminder.acknowledge/escalate` | P1/P3 |
| Email delivery connector | **SHARED** | `automation/channels/email.ts` / Resend dependency | External provider, no business authority | Shared delivery | Provider transport should not be copied into each domain/intelligence use case. | Controlled delivery service invoked from approved workflow | P2 |
| ERP-local WhatsApp connector stub | **DEPRECATE** | `automation/channels/whatsapp.ts` always throws “belum dikonfigurasi” | None | Replace with shared governed messaging integration | A nonfunctional ERP-local stub must not become an ad-hoc bot transport. | Shared delivery contract later; proactive sends require approved policy/template | P2 retire stub |
| Direct two-way Google Sheets writers | **DEPRECATE** | ten `*/sheet-sync/actions.ts`; representative Marketing action starts with `integrationDisabled()`; `integration-policy.ts` always throws in pilot | Transitional Sheets/ERP authority unresolved | Retire ERP-local writer after cut-over | Two writers, name matching, clear→write and no batch provenance are unsafe as operational integration. Current server disable is correct. | No Intelligence direct Sheet path | P1 migration gate |
| Governed legacy Sheet/Excel/Jira intake and reconciliation | **EXTRACT** | architecture specifies Data Intake; current sheet actions contain parsing/mapping logic but no governed batch ledger | Transitional external source → ERP after approval | Python Integration Core / Data Intake | Extract ingestion/crosswalk/dry-run/reconciliation from interactive ERP pages. ERP remains mutation authority through import command/domain service. | Import batch is not AI ACTION; write via approved ERP import service | P2 |
| Feature request / contextual feedback loop | **KEEP** | `feature-requests/actions.ts`; current branch persists sanitized `context_path`, release SHA/environment; Done requires acceptance criteria, delivered release and validation notes | ERP feedback DB | ERP product/BA workflow | This is now a useful contextual requirement loop. Preserve requester/BA evidence and release traceability. | READ/event only if Intelligence supports BA synthesis; EVENT `feature_request.changed.v1` | P1 preserve |
| Kanban tasks/comments | **REWORK** | `tasks/actions.ts`, `kanban_tasks`, `kanban_task_comments`; prior audit found inconsistent record authorization | ERP | ERP/shared work management | Useful ACTION target for Intelligence but must first harden actor/parent authorization/version semantics. | ACTION `task.create`, `task.update` with approval/idempotency/expected version | P1/P4 |
| TTD Online / signature evidence | **REWORK** | `ttd-online/actions.ts`, `signature_requests`, signatures/attachments | ERP | ERP workflow | Signature/approval is critical human evidence. Require version/hash/concurrency and recoverable side effects; never agent-sign. | READ `approval`; EVENT `approval.changed.v1`; **no sign ACTION** | P1 |
| Activity log / audit trail | **REWORK** | `src/lib/activity-log.ts::logActivity` stores division/action/label/actor but not entity UUID, versions, before/after, correlation or command ID | ERP log | ERP immutable audit + shared observability | Current log is useful UI history but insufficient for integration replay/nonrepudiation. | Command/outbox audit carries correlation, actor/service, reviewer, before/after version, policy | P1/P3 |
| Human user auth and ERP RBAC | **REWORK** | `auth.ts` DB-derived claims; `requireDivisionAccess`; current `assertPilotActor` intentionally restricts all pilot actions to active Owners | ERP users/access | ERP Identity/RBAC | Owner-only pilot is safe for review but not broad operational authorization. Preserve domain ranks; add record/field policy and revoke-session tests before user rollout. | READ/ACTION authorization never trusts model-provided user ID; delegated user context resolved server-side | P1 |
| Machine/service integration identity | **SHARED** | not implemented; contract doc proposes scoped service principal | None yet | Shared platform security, enforced by ERP facade | Do not reuse NextAuth cookie, Google token or S3 secret for Intelligence. | Separate READ/EVENT/ACTION scopes; audience/env; rotation; audit | P2 |
| PII encryption / secrets custody | **KEEP** | `pii-crypto.ts`; selected onboarding PII encrypted; current runbook preserves PII key with backup | ERP + platform secret manager | ERP security / platform | Sensitive business data remains ERP-controlled. Need key version/rotation/recovery and field-specific read scopes. | PII excluded from default Intelligence projections | P1 |
| Executive deterministic dashboard metrics | **KEEP** | `executive-dashboard/page.tsx` reads ERP tables and computes lead/pipeline/headcount/contract/invoice/handoff/assignment metrics | ERP | ERP Reporting | Deterministic metrics should remain close to source truth. Current implementation loads full tables, so scale needs query aggregation/pagination when measured. | READ curated metric resources optional; Intelligence can explain, not redefine | P2 |
| Management explanation / diagnosis / narrative | **EXTRACT** | no model implementation in ERP; architecture assigns Management Intelligence to Intelligence Layer | ERP metrics/facts | Intelligence | Separate deterministic metric from AI explanation. Every explanation cites metric/source version. | READ curated metric/source facts; no arbitrary financial write | P3 |
| Generic chatbot / conversational reasoning | **EXTRACT** *(target only; no current code to move)* | no chatbot route/service/model client/provider dependency found; WA file is delivery stub only | None | Intelligence | If introduced, conversation belongs to Human Services/Intelligence; it must use ERP READ/ACTION tools rather than duplicate ERP tables. | Tool calls limited to typed contract | P3 |

## 4. Canonical business entities and current authority

The table below distinguishes **present ERP authority** from proposed contract names. A proposed resource does not create a new source of truth.

| Business concept | Current canonical record / identity | Authority now | Caveat before Intelligence |
|---|---|---|---|
| Lead | `leads.id`, display key `lead_no` | ERP Marketing | Client is still free-text/name-linked |
| Sales opportunity | `sales_opportunity_trackers.id`, `opty_no` | ERP Sales | Must be typed `sales_opportunity` |
| Commercial PQ | `opportunities.id`, `opty_no`/`pq_no` | ERP Sales/PQ | Must be typed `commercial_pq`; not interchangeable with tracker |
| Customer/account | `crm_clients.id` for CRM, separate `clients`, plus free-text names elsewhere | **Ambiguous** | Establish approved client crosswalk + aliases/provenance; no auto-merge |
| Requisition | `requisitions.id`, `requisition_no` | ERP TA | `opportunity_id` points to **sales tracker**, not PQ |
| Candidate | `candidates.id`, `candidate_no` | ERP TA | Never match by name |
| Application | `applications.id` | ERP TA | Separate hiring vs client-submission states |
| Onboarding | `onboarding_requests.id` | ERP TA→HR | Contains highly sensitive PII; minimal projection only |
| Employee | `employees.id`, `employee_no` | ERP HR | User↔employee mapping not yet canonical |
| Employment contract | `employment_contracts.id`, `contract_no` | ERP HR | Amendments/parent contract must retain history |
| Talent assignment | `talent_assignments.id` | ERP TM | Skills are free text; capacity incomplete |
| Extension/increment request | `extension_increment_requests.id` | ERP TM | Approval concurrency/outbox hardening needed |
| Project | no single canonical table | **Implicit ERP composite** | Requires stewarded mapping across PQ/contracts/docs/invoices/assignments |
| Project document | `project_documents.id` | ERP PMO | Parent opportunity/PQ relationship matters |
| Project contract | `project_contracts.id` | ERP PMO | Confirm valid one/many amendment cardinality before new constraints |
| Billing month | `project_monthly_billings.id` | ERP PMO | Generated from contract; rule/version should be explicit |
| Invoice | `project_invoices.id` | ERP PMO/Finance | Monthly invoice vs one-per-opportunity handoff mismatch |
| BAST | no dedicated aggregate; invoice fields + attachment evidence | **Not fully canonical** | BA must define expected/due/received semantics before `bast` READ/EVENT |
| Finance handoff | `finance_document_handoffs.id` | ERP PMO/Finance | Cardinality/model requires rework |
| Profitability period | unique assignment/year/month row in `profitability_entries` | ERP reporting | Current recomputation is not immutable historical truth |
| User/account | `users.id`; DB-derived NextAuth claims | ERP Identity | Current pilot admits active Owner only |
| Division access | `user_access` + `divisions` | ERP Identity | Must be enforced at resource/record/field level for integration |
| Timesheet | `timesheet_entries`, `timesheet_exports`, `timesheet_submissions` keyed to `users` | ERP Time | Need explicit user↔employee link for cross-domain use |
| Attendance/time off | attendance/time-off tables | ERP HR/Time | Business timezone policy required |
| Document object | parent metadata/attachment row + private S3 object path | ERP metadata + Shared S3 bytes | Signed/raw object path is not an entity ID |
| Feature request | `feature_requests.id`, `request_no` | ERP BA/Product workflow | Context/release/acceptance fields now exist |
| Task | `kanban_tasks.id` | ERP work management | Authorization/version hardening before Intelligence actions |
| Notification | `notifications.id` | ERP delivery record | Delivery service can be shared; trigger authority stays domain-specific |
| Reminder | `automation_reminders.id` | ERP automation config | No durable occurrence identity/idempotency yet |
| Service case | **absent** | none | Do not silently map all feature requests to service cases |

## 5. Current sources of truth

### Authoritative / intended operational authority

1. **ERP PostgreSQL** — intended Digital Operational Core for business/master data, workflow, approvals, commercial state, people/talent state, project/billing/time state, access and audit metadata.
2. **Private S3-compatible storage** — authoritative bytes for managed document objects, but **not** authoritative business state. Parent metadata and authorization remain ERP-owned.
3. **ERP identity tables** — `users`, `divisions`, `user_access` drive business authorization. Google OAuth verifies identity; it is not a business-data source.

### Transitional/supporting sources — not parallel long-term authority

- Google Sheets/Excel/CSV: transitional import/export/source evidence. Current direct Sheet actions are intentionally server-disabled.
- Jira/Tempo XLSX: supporting worklog evidence parsed by Timesheet Converter; becomes ERP operational state only after the ERP save/submission workflow.
- External/manual documents: evidence/artifacts. Metadata, classification and parent business meaning remain ERP-owned after intake.
- Google OAuth tokens / provider credentials: integration secrets, never business entities.

No Intelligence vector index, knowledge store or model response may become the canonical source for structured status, dates, money, approvals, identity, access, attendance, contract, BAST/invoice or staffing allocation.

## 6. Existing chatbot / AI / automation audit

### 6.1 AI / chatbot

**Finding:** no functioning LLM/chatbot/model gateway exists inside the current `apps/erp` implementation.

Evidence:

- `apps/erp/package.json`: no OpenAI, Anthropic, Gemini, AI SDK or model-provider dependency.
- `src/lib` contains auth, automation, storage, COGS, CRM, approval, notification, Google Sheets and deterministic utilities, but no model client/gateway.
- `src/lib/automation/document-merge.ts` / `docx-autofill.ts` are deterministic template merge utilities.
- `src/app/timesheet/lib/astra-generator.ts` uses `ExcelJS` and an Astra International spreadsheet template; “Astra” is not an AI model.
- `src/lib/automation/channels/whatsapp.ts` is a transport stub that always throws; it is not a chatbot.

**Boundary decision:** future conversational Human Services, pre-sales drafting, exception explanation, candidate/talent matching explanation and management narrative belong in the **Intelligence Layer / Model Gateway**. ERP provides authorized facts and controlled commands.

### 6.2 Automation that does exist

| Automation | Current behavior | Decision |
|---|---|---|
| Reminder engine | Weekday selection + template placeholder render + per-recipient channel dispatch/log | **REWORK** occurrence/timezone/idempotency/retry; cron currently disabled |
| Email transport | Provider adapter | **SHARED** governed delivery |
| WhatsApp transport | Stub, always errors | **DEPRECATE** ERP-local stub; replace with shared governed messaging |
| In-app notification | Direct notification rows + division broadcast | **SHARED**, with domain-owned trigger policy |
| Document generation | DOCX template merge/autofill | **SHARED** engine; ERP owns template/business linkage and approval |
| Timesheet generation | deterministic Jira parse/calendar mapping/Astra XLSX generation | **KEEP** in ERP Time workflow |
| PMO materialization | page-open SQL creates invoices/document rows and marks overdue | **REWORK** into explicit deterministic jobs/commands |
| Feature-request workflow | capture context + owner status/release/validation evidence | **KEEP** |

## 7. Regression and business-continuity risks

The following are the primary “do not break while decomposing” contracts.

1. **Lead → tracker → requisition + PQ continuity.** Current lead conversion now preserves staffing/pricing fields and row-locks duplicate conversion. Do not regress this while adding an integration facade.
2. **Typed opportunity identity.** `sales_opportunity_tracker` and downstream `opportunities/PQ` are both real. Generic `opportunity_id` in external contracts would create wrong joins.
3. **Client identity ambiguity.** CRM client, `clients`, and free-text `client_name` coexist. Intelligence must surface mapping uncertainty instead of silently normalizing.
4. **Candidate → onboarding → employee lineage.** Promotion locally creates employee/contract/BPJS transactionally, but follow-up effects occur after commit. Add outbox rather than refactoring away the working transaction.
5. **User vs employee identity.** Timesheet/attendance ownership uses users while HR uses employees. Do not join by email/name without stewarded mapping.
6. **Sensitive salary/PII boundaries.** COGS, salary, bank/tax identifiers and HR approval state must not leak into broad retrieval or model prompts.
7. **Skills/capacity quality.** Free-text skill and assignment status do not prove capability or available capacity. Contract quality must be explicit `unknown/unverified` when inputs are missing.
8. **Profitability history.** Rerun currently recomputes historical month using current assignment values/default rates. Management Intelligence must not describe this as immutable realized margin until period policy exists.
9. **PMO page-open mutations.** Invoice/document materialization and overdue changes currently occur as page-side sync functions. New event processing must not duplicate these side effects.
10. **Finance handoff cardinality.** One opportunity-level handoff vs multiple monthly invoices can overwrite/ambiguate the intended finance workflow.
11. **Timesheet replace semantics.** Converter deletes actor+period entries then inserts generated rows. Contract/event work must preserve owner/period semantics and failure behavior.
12. **Business timezone.** Attendance/reminder/date-window behavior needs explicit named-zone rules and boundary tests.
13. **Sheets re-enable risk.** Ten direct two-way writers remain code-present but disabled. Do not expose them from Intelligence or turn them back on before governed cut-over/reconciliation.
14. **Outbound reminder duplication.** `runReminder` sends before durable occurrence-level dedupe; cron is correctly disabled. Do not enable external sends as part of “AI automation” work.
15. **Broad-user authorization.** Current pilot-wide `requirePilotActor` restricts stateful actions to active Owners, masking some row-level gaps. Broad role rollout requires its own authorization regression matrix.
16. **Audit insufficiency.** Current activity log is not an integration-grade command ledger. Outbox/commands need correlation, entity/version and immutable outcome records.
17. **Feature-feedback improvements are now baseline.** Preserve sanitized source path, environment/release, acceptance criteria, delivered release and BA validation evidence.
18. **Storage portability is now baseline.** Private S3 abstraction and managed read route replaced Supabase transport for current pilot; legacy objects are not automatically migrated.
19. **Executive query scale.** Dashboard currently loads several full tables before aggregating. Preserve metric definitions; optimize SQL only with measured dataset/load evidence.

## 8. Proposed ERP READ contract

**Status:** design target only. `/api/integration/v1` is **not implemented** in this branch.

Recommended transport:

```text
GET /api/integration/v1/resources/{resource_type}/{id}
GET /api/integration/v1/resources/{resource_type}?cursor=...&limit=...&updated_after=...
GET /api/integration/v1/events?cursor=...&limit=...
POST /api/integration/v1/commands
GET /api/integration/v1/commands/{command_id}
```

Every READ response must include at minimum:

```json
{
  "schema_version": "1.0",
  "as_of": "RFC3339 UTC",
  "record_version": 1,
  "source_refs": [],
  "quality": { "status": "verified|unverified|unknown", "reasons": [] },
  "correlation_id": "..."
}
```

Initial resource allowlist:

| Resource | ERP backing | Minimum rule |
|---|---|---|
| `lead` | `leads` | Commercial scope only; no arbitrary contact export |
| `sales_opportunity` | `sales_opportunity_trackers` | Typed separately from PQ |
| `commercial_pq` | `opportunities` | Commercial terms field-scoped |
| `customer` | approved CRM/client crosswalk | Block until canonical mapping is accepted |
| `requisition` | `requisitions` | Explicit tracker ref |
| `candidate_summary` | candidate/application projection | Minimum necessary fields; no raw sensitive profile by default |
| `employee` | `employees` | Exclude personal/tax/bank/payroll by default |
| `talent_skill` | curated future skill assertion | Free text exposed as unverified evidence only |
| `allocation` | `talent_assignments` | Assignment fact, not inferred capacity |
| `capacity` | deterministic future policy | `unknown` until allocation/calendar rules exist |
| `project` | curated future project mapping | Block until source mapping/version exists |
| `contract` | employment/project contract typed resource | Typed contract class + scoped commercial values |
| `invoice` | `project_invoices` | Approved amount/status/evidence fields only |
| `bast` | derived from approved BAST semantics | Block until BA definition exists |
| `timesheet` | submissions/entries/exports | Approved/draft distinction; explicit user↔employee quality |
| `attendance_summary` | attendance facts | Business timezone/version required |
| `approval` / `workflow_state` | signature/extension/time-off/finance states | Reading eligibility does not grant approval power |
| `profitability_snapshot` | `profitability_entries` | Only after historical revision/period semantics defined |
| `feature_request` | `feature_requests` | Optional BA/product-intelligence use case |

Document bytes are accessed by document ID through a fresh parent authorization check. Intelligence stores source document ID/digest/version/ACL metadata; it must not persist a short-lived signed URL as canonical state.

## 9. Proposed ERP EVENT contract

ERP must write the business mutation, integration audit and outbox row in the **same transaction**. Delivery is at-least-once; consumers deduplicate by event ID and aggregate version.

Initial event vocabulary:

- `lead.changed.v1`
- `opportunity.changed.v1` with aggregate type `sales_opportunity` or `commercial_pq`
- `requisition.changed.v1`
- `candidate.pipeline.changed.v1`
- `employee.changed.v1`
- `talent.assignment.changed.v1`
- `talent.skill.changed.v1` after curated skill model exists
- `approval.changed.v1`
- `contract.changed.v1`
- `contract.expiry_proximity.v1` after threshold/timezone policy is approved
- `billing.schedule.changed.v1`
- `invoice.changed.v1`
- `bast.pending.v1` / `bast.updated.v1` **blocked until BA semantics are defined**
- `finance.handoff.changed.v1` after cardinality rework
- `timesheet.submitted.v1`
- `timesheet.approved.v1`
- `attendance.issue.detected.v1` only from a versioned deterministic rule
- `feature_request.changed.v1`
- `record.deleted.v1`
- `access.revoked.v1`

Synthetic envelope shape:

```json
{
  "schema_version": "1.0",
  "event_id": "uuid",
  "event_type": "opportunity.changed.v1",
  "aggregate": {
    "type": "sales_opportunity",
    "id": "erp-uuid",
    "version": 7
  },
  "occurred_at": "2026-09-24T03:00:00Z",
  "correlation_id": "uuid",
  "change_kind": "updated",
  "changed_fields": ["requirement_summary"],
  "resource_ref": "/api/integration/v1/resources/sales_opportunity/erp-uuid"
}
```

Objective exception events contain `policy_id`, `policy_version`, `occurrence_key`, factual inputs and source versions. The model may enrich or explain the exception, but may not create the underlying overdue/missing/expiry truth.

## 10. Proposed ERP ACTION contract

Only allowlisted typed commands. No generic table/field update and no arbitrary SQL.

Initial command allowlist:

| Command | Effect | Gate |
|---|---|---|
| `task.create` | create authorized task attached to validated parent/ref | human approval in first rollout; task authorization hardened |
| `task.update` | update allowlisted task fields/status | expected version + actor/parent authorization |
| `case.create` | create governed service/exception case | **blocked until case aggregate/owner exists** |
| `workflow.status.update` | low-risk allowlisted task/case transition only | cannot approve/sign/pay/alter critical domain truth |
| `artifact.persist_approved_reference` | attach immutable reviewed Intelligence artifact ID/digest/version | exact human review bound to source versions |
| `document.attach_generated_reference` | attach reviewed generated document as a new version | managed storage + parent ACL + content/digest checks |
| `reminder.acknowledge` | record acknowledgement for specific occurrence | occurrence identity + owner policy |
| `reminder.escalate` | create approved escalation state/case | escalation policy; no arbitrary outbound recipient |

Required command mechanics:

1. Service authentication with separate READ/EVENT/ACTION scopes and environment/audience.
2. `Idempotency-Key` bound to principal + environment + command kind + canonical request hash.
3. `expected_version`/state precondition for mutable targets.
4. Server-resolved delegated user context; never trust a model-supplied user ID as authorization.
5. Human `approval_id` in initial rollout, bound server-side to reviewer, exact command/artifact digest, source versions, expiry and effect.
6. One transaction: claim idempotency key → validate version/state → apply domain mutation → persist command receipt/audit → emit outbox event.
7. Safe result states: `accepted`, `applied`, `rejected`, `failed`, `unknown_external_outcome`.

### AI principals must never directly write

- employee identity, NIK/NPWP/bank/tax/payroll data;
- salary, COGS, BPJS/tax calculations or official profitability truth;
- contract commercial terms;
- signatures or approval decisions;
- invoice/payment/finance receipt truth;
- access grants, user roles or service scopes;
- source/crosswalk mappings;
- encryption/secrets configuration;
- audit/event history;
- arbitrary object paths or external recipient lists;
- schema/database tables.

## 11. Implementation order after this audit

Do not broadly refactor stable modules. Proceed in controlled slices:

1. **Lock regression baseline** for the six cross-domain journeys and current pilot HTTP tests.
2. **Resolve canonical identities**: customer crosswalk, user↔employee, typed sales-opportunity vs commercial-PQ, project mapping; define BAST semantics and finance handoff cardinality.
3. **Harden deterministic workflows** that would be event/action sources: PMO page-open mutations, approval concurrency, transactional outbox recovery, historical profitability semantics, timezone policy, task/signature record authorization.
4. **Implement read-only ERP facade first** with service identity, strict DTOs, field scopes, quality/provenance and synthetic provider/consumer contract tests.
5. **Add transactional outbox + EVENT feed** and replay/dedup/concurrency tests.
6. **Bind Intelligence read-only** for a narrow pre-sales slice using real typed opportunity/customer/document context.
7. **Add one low-risk approved ACTION** (`artifact.persist_approved_reference` or hardened `task.create`) with idempotency and human approval.
8. **Build exception intelligence** only after deterministic exception policy/events exist.
9. **Build Human Services** on authorized employee/timesheet/attendance/approval context plus shared delivery, never through a parallel ERP database.
10. **Build Management Intelligence** on deterministic curated metrics, separating source number from AI explanation.
11. Keep Google Sheets and automatic outbound reminder dispatch disabled until their dedicated migration/delivery gates pass.

## 12. Broad implementation gate

Broad ERP rewrite remains **not authorized by this audit**. The next safe code change is boundary/hardening work that preserves existing behavior, not replacement of stable operational modules.

Before real Intelligence binding, minimum gates are:

- canonical typed identities and source mappings accepted;
- broad-user/record authorization plan tested for the affected resources;
- integration service identity exists;
- READ DTOs and field redaction are contract-tested;
- record version/change watermark exists;
- transactional outbox + audit/correlation exists for emitted events;
- any ACTION has idempotency, expected version, trusted human approval and command receipt;
- objective business rules are deterministic and policy-versioned;
- no live two-way Sheets writer, generic AI SQL/table access, or uncontrolled outbound messaging is introduced.

This decomposition preserves the ERP as the **Digital Operational Core** while creating a controlled place for Intelligence to add context, retrieval, reasoning, drafting and proactive support without becoming a parallel ERP.