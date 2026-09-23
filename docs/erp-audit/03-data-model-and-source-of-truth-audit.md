# 03 — Data model and source-of-truth audit

**F:** the schema defines 60 tables. **R:** ERP is the intended operational authority under the accepted architecture. **U:** actual authority, completeness and quality of today's ERP/Sheets/Jira/Excel records have not been established without their owners and data extracts. Do not confuse intended ownership with a completed cut-over.

## Entity ownership and identity

The [complete table inventory](evidence/table-inventory.json) includes source line numbers. Proposed domain owners below must be assigned to named people before migration.

| Domain / table count | F: principal tables and relationships | R: authority and controls |
| --- | --- | --- |
| Commercial / 7 | `leads`, `sales_opportunity_trackers`, `opportunities`, `clients`, `crm_clients`, `crm_client_contacts`, `crm_client_activities` | Marketing owns lead qualification; Sales owns opportunity/commercial state; designate one steward for client identity. Preserve legacy display names until crosswalk approval. |
| Recruiting / 4 | `requisitions`, `candidates`, `applications`, `onboarding_requests` | TA owns requisition/candidate stage; candidate UUID, not name, is the identity. Keep application and onboarding history. |
| People and assignment / 6 | `employees`, `employment_contracts`, `bpjs_registrations`, `talent_assignments`, `extension_increment_requests`, `extension_request_special_notes` | HR owns employee/contract facts; TM owns assignment and curated skills; salary and sensitive notes require field-specific permissions. |
| Project/finance / 7 | `project_documents`, `project_contracts`, `project_invoices`, `finance_document_handoffs`, `project_monthly_billings`, `overtime_business_trip_claims`, `profitability_entries` | PMO owns delivery evidence and billing preparation; Finance owns receipt/revision/payment acknowledgement. No inferred bank settlement. |
| Access/reference / 4 | `pics`, `divisions`, `users`, `user_access` | Identity admin owns access; business PIC names are not access grants. Map users to employees explicitly. |
| Time/attendance / 9 | `company_holidays`, `timesheet_entries`, `timesheet_exports`, `timesheet_submissions`, `attendance_logs`, `leave_types`, `attendance_approval_steps`, `time_off_requests`, `time_off_approval_steps` | Talent owns submissions; PMO/HR own appropriate approvals and holiday policy. Jira worklogs remain supporting evidence until timesheet acceptance. |
| Shared operations / 8 | `activity_logs`, `notifications`, `signatures`, `signature_requests`, `attachments`, `feature_requests`, `kanban_tasks`, `kanban_task_comments` | Business record authorization follows the parent; audit evidence is append-only in the target; BA owns change-triage state. |
| Learning / 8 | `school_courses`, `school_modules`, `school_lessons`, `school_quizzes`, `school_quiz_questions`, `school_quiz_options`, `school_enrollments`, `school_lesson_progress` | School owns curriculum and learner outcomes; these are not automatically verified staffing certifications. |
| Google bridge / 2 | `google_tokens`, `sheet_connections` | Integration credentials and mappings only; a connection does not confer operational authority. |
| Automation / 5 | `automation_reminders`, `automation_reminder_recipients`, `automation_reminder_logs`, `automation_document_templates`, `automation_generated_documents` | Automation owner controls recipient/template policy; domain approver owns any business outcome. |

## Critical relationships and semantic traps

**F, F09/F10:** `ERP:src/db/schema.ts:42,71,108` defines two different opportunity concepts. `sales_opportunity_trackers` is pre-sales; `opportunities` is the downstream PQ tracker. `requisitions.opportunity_id` references **salesOpportunityTrackers.id**, while `talent_assignments.pq_tracker_id` and project document/contract/invoice `opportunity_id` reference **opportunities.id**. The external contract must use explicit typed references such as `sales_opportunity` and `commercial_pq`; UUID shape alone cannot distinguish them.

**F:** `employees.onboarding_request_id` is nullable and indexed, not unique (`schema.ts:274`). Employee display identity is often reached through onboarding→candidate; Sheets-created employees may lack that chain. Timesheets and attendance instead refer to users (`schema.ts:648–777`; `require-timesheet-access.ts`, `require-attendance-access.ts`). **R:** add a steward-reviewed user↔employee crosswalk, account for employees without logins and backoffice accounts without employee rows, and never silently join by email/name.

**F:** CRM explicitly matches client names by text (`schema.ts:1208` comment), and another `clients` table exists at line 1044. Free-text `client_name` appears across sales/requisitions. **I:** spelling/case/renames can split management totals or join the wrong account. **R:** propose `client_id` mappings with canonical name, aliases, provenance and exception queue; preserve historical names for documents. Do not automatically merge same-name clients.

**F:** free-text `current_skill`/`current_certification` and assignment start/end/status exist (`schema.ts:384`). Allocation percentage, working-calendar capacity and validated skill taxonomy are not present there. **R:** return capacity as `unknown` until TM/HR agree a calculation and supply allocation inputs. A headcount, assignment status or language-model guess is not available capacity.

## Integrity and historical correctness

| Finding | F: evidence / current behavior | I: risk | R: target |
| --- | --- | --- | --- |
| F10 — Weak natural-key boundaries | `schema.ts` indexes on tracker `lead_id`, employee onboarding ID, project document/contract opportunity ID, invoice opportunity/month and billing contract/month do not enforce each intended single-row relationship. Finance handoff opportunity and profitability assignment/year/month **are** unique. | Application check-then-insert can race; imported duplicates may already exist, but no dataset was inspected. | Profile duplicates first; BA confirms cardinality (multiple contracts may be valid). Add only approved unique/partial constraints and transaction-safe insert handling. Preserve legitimate amendments and installments. |
| F11 — Lead field continuity | `ERP:src/app/marketing/actions.ts` — `convertLeadToOpportunity` copies client/project summary/estimated deal/duration but not the target's position/headcount/level/price/price-period fields. | Re-entry or incorrect defaults in the next stage. The lead is not deleted. | Explicit mapping regression test and BA-approved carry-forward semantics; do not conflate estimated deal with per-person recurring price. |
| F12 — Cross-step partial state | `ERP:src/app/ta/onboarding/actions.ts:267` transaction creates employee/contract/BPJS; `onTalentPromoted` at 299 and activity writes follow it. `ttd-online/actions.ts` updates signature before downstream calls. | A failed follow-up can leave the main business change committed and a retry rejected as already processed. | Transactional outbox and idempotent recovery, preserving the existing local transaction. |
| F13 — Invoice/handoff mismatch | `schema.ts:595` unique handoff per opportunity; `ERP:src/app/pmo/actions.ts` — `upsertFinanceHandoff` accepts separate invoice and opportunity IDs, updates the invoice without binding their relationship. | Wrong invoice status or shared handoff overwritten across months. | Verify parent association server-side; BA decides invoice-specific handoff vs project dossier plus per-invoice links/receipts. Migrate explicitly after decision. |
| F14 — Mutation during reads / transition races | `pmo/actions.ts` — `syncOverdueInvoices`, `syncBillingScheduleToInvoices`, `syncDocumentTrackerFromContracts`; invoked by PMO pages. Finance acknowledgement reads state then updates by ID. | Viewing changes data; concurrent page requests may materialize duplicates; conflicting transitions can both pass a pre-check. | Move materialization to explicit command/job, enforce keys, compare-and-set state/version within transaction. |
| F15 — Money and historical recalculation | Numerous monetary fields use `integer`; `profitabilityEntries` has a unique monthly row; profitability sync recomputes using current assignment values. | PostgreSQL int4 maximum is 2,147,483,647; large contract totals may exceed it. Historical reruns may replace earlier economics. Actual overflow/loss is unproven. | Validate amount/currency/period, profile maxima, use exact decimal or appropriately sized integer policy; introduce locked periods and explicit revisions. |
| F16 — Provenance | `activityLogs` has actor, labels, action/time but no entity UUID, before/after, source revision or correlation ID. Generic attachments/signatures use polymorphic source IDs. | Cannot reliably reconstruct a cross-system transaction or enforce all parent FKs with the current log. | Append-only command audit + outbox; application-enforced parent authorization/integrity; document digest/version and source lineage. |

## Google Sheets: ten independent two-way writers

F: each module implements `connectSheet`, `saveColumnMapping`, `syncPull`, `syncPush` and helper/debug flows. Pull reads `A2:Z1000` (up to 999 data rows, 26 columns). Push clears a column range, then makes a separate write request. Partial pull updates remain if a later row fails. Unmapped/blank values frequently become null; unknown statuses can normalize into new strings. Mapping is JSON text on a connection, not an import run ledger.

All paths below are `ERP:src/app/<path>/sheet-sync/actions.ts`. Function evidence is `syncPull`/`syncPush`; line numbers indicate matching logic and clear→write pairs.

| Module path | Matching/upsert identity (F) | Clear/write lines | Specific risk (I) |
| --- | --- | --- | --- |
| `marketing` | `lead_no`, line 149; generate when absent | 226–227 | Repeated rows without stable IDs can create new leads. |
| `sales/opportunity-tracker` | `opty_no`, line 120 | 196–197 | Generated fallback ID is not stable source identity. |
| `sales` | PQ `opty_no`, line 141 | 221–222 | Different opportunity type shares similarly named number fields; mappings must not cross domains. |
| `ta` | requisition number, line 144 | 187–188 | Missing/incorrect number prevents reliable replay matching. |
| `ta/candidates` | **candidate name**, line 142 | 182–183 | Same-name people collide; renamed candidates duplicate. |
| `hr` | `employee_no`, line 122; generated if absent | 175–176 | Can create employees without onboarding linkage; repeat import of an unnumbered row is unsafe. |
| `tm` | employee number lookup 112; first requisition with client name 118; first assignment by employee ID 157 | 227–228 | Multiple roles/projects/assignments cannot be resolved safely by these keys. |
| `pmo` | PQ number, then first document by opportunity ID, 112/144 | 207–208 | Multiple dossier versions are ambiguous. |
| `pmo/contracts` | PQ number, then first contract by opportunity ID, 106/129 | 180–181 | Multiple/amended contracts can be overwritten. |
| `pmo/invoices` | PQ number + service month when present, 106/127 | 180–181 | Blank month skips matching; repeat import inserts again. |

F05: division editor/full checks are not consistently applied to these Server Actions. Pull/push generally require a session only; several connection/mapping writes have no actor check. F06: OAuth refresh/access tokens are plaintext DB strings (`schema.ts:1019`, `auth.ts` token persistence). F09: all ten pushes clear before writing; failure between calls may leave the Sheet empty. None were invoked against actual Sheets during audit.

## Proposed migration/cut-over protocol (R)

1. **Register each source.** Domain steward supplies workbook ID/tab, current editor list, row count, schema, mandatory columns, formulas, update cadence, date/currency rules, and authoritative fields. Include Excel/Jira/manual document sources, not only the ten connectors. Record “unknown” until attested.
2. **Snapshot and profile.** Export read-only with digest/time, retain original version securely; inventory duplicates, missing keys, orphan references, invalid dates/statuses, amount maxima and rows beyond 1000. Copy no real PII into a developer preview.
3. **Approve crosswalk.** Map source system + source entity + stable source ID to ERP UUID. Add explicit customer/user/employee/project mappings, mapping version and rejection reasons. Candidate name and row position are insufficient permanent IDs.
4. **Dry-run import.** Use a staging table/import batch with no operational writes; preview creates/updates/conflicts/rejections and field-level changes. Missing columns must not mean “erase ERP value.” Validate enums, date timezone/locale and financial totals. BA/domain owner approves the delta.
5. **Apply/reconcile.** Execute bounded transactional batches, idempotent row keys and expected ERP version checks. Record batch ID, source revision/digest, actor, counts and rejected rows. Rerun the same batch: zero duplicate entities and no repeated side effects. Quarantine changed rows rather than silently applying last-write-wins.
6. **Single-writer cut-over per domain.** Short announced source freeze; import final delta; reconcile key set and record count (with explicit rejected-row allowance), monetary totals by currency/period, relationship counts, document availability and a signed user sample. Owner signs a dated cut-over record. ERP becomes writer; old Sheet becomes read-only archive or versioned export.
7. **Rollback window.** Preserve pre-import backup, crosswalk and delta ledger; revert the approved batch or restore to a separate environment for reconciliation. Never blindly restore a whole database over legitimate post-cut-over writes. Disable old pull/push actions for that domain; revoke unneeded OAuth scopes/tokens. Reopening a Sheet as writer is an explicit incident decision with merge ownership.

Acceptance: 100% stable key mapping for accepted rows, all rejects acknowledged, exact agreed financial reconciliation, repeat import idempotent, no unresolved high-impact duplicates, and one named steward sign-off per domain. Counts/tolerances and source retention period are BA decisions, not invented findings.

## Sensitive data and retention

F: `ERP:src/lib/pii-crypto.ts` uses authenticated encryption; onboarding create/update encrypt NIK, NPWP, family-card and bank-account numbers. Decryption accepts legacy plaintext. Salaries, contact details, photos, signatures and OAuth tokens require separate classification. Storage URLs can outlive access changes for their signed lifetime, and metadata deletion does not prove physical object deletion.

R: approve a data classification and role/field matrix; mask identifiers in ordinary tables, exclude them from feedback screenshots and Intelligence retrieval, audit privileged reveal/download. Rotate credentials and encryption keys with versioned envelopes and recoverable key custody; do not simply replace the key and lose existing ciphertext. Establish owner-approved retention/legal requirements for employee documents, selfies, signatures and backups; this audit makes no legal compliance certification. Test restoration of DB, objects and decryption keys together.
