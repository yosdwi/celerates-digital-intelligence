# 05 — Contextual user feedback and BA requirement loop

**Recommendation: extend the existing Feature Request Tracker.** Do not replace it with a second suggestion box. This design is proposed, not implemented in the audit branch.

## Existing foundations and gaps

F: `ERP:src/components/feature-request-fab.tsx` links authenticated users to `/feature-requests`. `ERP:src/app/feature-requests/page.tsx`, `actions.ts` and `schema.ts:859` support title, module, request type, priority, current/expected behavior, impact, target date, reporter, attachments, assigned name, resolution and owner-managed status. Creation notifies owners; status change notifies the reporter. Delete has an owner/requester-new-state check, while update and attachment deletion do not have equivalent checks (F04).

F: route/release/record context is not automatically captured. BA is not a distinct role; status changes require owner. Active talent is redirected away from the feedback page despite the global FAB (F17). Existing UI constants use `new`, `pending`, `on_develop`, `testing`, `done`, `on_hold`, `rejected`; schema comments list some different names, and the status action accepts any nonempty string. Migration must inspect actual stored codes instead of trusting comments.

## User-facing submission (R)

The FAB opens a compact contextual panel without losing the user's unfinished form. It offers “Laporkan masalah / kebutuhan” and a success receipt containing the request number and tracking link. Reporter can save a draft and add clarification. A failed upload leaves the text draft intact and tells them whether the request was already created; retries use the same submission key.

| Field | Capture and validation |
| --- | --- |
| Module, screen and route | Populate from a controlled route registry. Store route template and sanitized pathname; strip arbitrary query strings, tokens and search text. Users may correct the module. |
| Record/workflow reference | Optional typed ID resolved and authorized by the server. UI label may be masked. A hidden ID is not proof of access. Store relevant workflow state/version, not the whole record. |
| Environment and release | Server sets `APP_ENV`, release commit/image ID and deployed-at time. Never trust a client-supplied release for audit. |
| Request category | Bug, missing field, flow mismatch, business rule, usability, request. Preserve legacy type in migration. Integration/data-fix become an additional tagged subtype when needed. |
| What happened / expected / reproduction | Short structured prompts and steps. Current/expected behavior fields already exist; preserve them. |
| Severity and impact | Reporter selects blocked / workaround exists / inconvenience and affected people/process/deadline. BA sets severity and priority separately; urgency is not automatic P0. |
| Reporter / division | Server identity and division snapshot; never allow spoofed reporter fields. Optional contact preference. |
| Screenshot/attachment | Explicit user selection with preview and redact/remove option. No silent screen recording. Enforce parent authorization, type/size/quota, malware handling and private storage. Do not include payroll/identity data automatically. |
| Diagnostic context | Optional correlation ID, browser family/version and viewport after minimization. No auth headers, cookies, session token, full console dump or raw request body. |

If the ERP is unavailable, a documented support intake channel may create the same tracker record later with `source=assisted`, reporter consent and incident correlation. A separate untracked chat thread is not closure evidence. Actual support recipients/channel must be designated by the sponsor; none were messaged in this audit.

## Proposed model additions

R: retain `feature_requests` as the aggregate and its stable request number. Add nullable fields in an additive migration: `reporter_division_id`, `route_template`, `sanitized_path`, `screen_key`, `source_entity_type/id`, `source_entity_version`, `release_sha`, `environment`, `severity`, `impact_scope`, `ba_owner_user_id`, `implementation_owner_user_id`, `triage_reason`, `duplicate_of_id`, `target_release`, `delivered_release`, `validated_by_user_id`, `validated_at`. Avoid using free-text assignee name as authority.

Add child records for `feedback_comments` (author/visibility/time), `requirement_deltas` (problem, current rule, proposed rule, affected roles/data/contracts, compatibility/migration impact, acceptance criteria, approving business owner), `feedback_backlog_links` (repository, issue number/URL and sync state), `feedback_state_events` (actor, previous/next state, reason, version) and `feedback_validation_runs` (release, scenario, result, sanitized evidence). Existing generic attachments may be reused only after F03/F04 resource checks are fixed.

DB/audit writes for each transition must be atomic. Notifications/GitHub synchronization are outbox effects; their failure must not lose the feedback. First iteration can link a manually created GitHub issue, with BA verifying the URL; automatic issue creation is a later authorized integration, not necessary for a functional loop.

## State machine and responsibilities

Keep existing persisted top-level codes initially; add explicit substates/transition rules and migrate only known legacy codes. The following transition design is R.

| Step / existing code | Responsible actor | Required evidence to advance |
| --- | --- | --- |
| Submitted / `new` | Reporter; server records receipt | Category, title, expected/actual behavior, context, stable submission ID |
| Clarification or triage / `pending` | Assigned BA | Reproduction attempt, impact/severity, domain owner, scope, duplicate search. Clarification request and response remain attached. |
| Accepted backlog / `pending` + accepted substate | BA + business owner | Approved requirement delta, testable acceptance criteria, affected roles/data, effort/dependencies, GitHub issue link. Security/incident bugs may use an expedited documented path. |
| In implementation / `on_develop` | Assigned engineer | Linked issue/PR, regression scenario reproduces defect or validates new rule, no undocumented business change |
| Released for validation / `testing` | Engineer/QA → BA/reporter | Deployment URL/environment, immutable release ID, test evidence, known limitations and rollback reference |
| Verified / `done` | Reporter or named domain delegate; BA records closure | Acceptance criteria exercised on delivered release, result/evidence, validator identity/time. Deployment or PR merge alone cannot close the request. |
| Deferred / `on_hold` | BA/business owner | Reason, accountable owner and next review date |
| Rejected / `rejected` | BA/business owner | Rationale and alternative/duplicate link; reporter sees disposition |
| Reopened / return to `pending` | Reporter/BA | Failed criterion, new evidence and observed release; prior closure evidence remains immutable |

Reporter may edit their own untriaged request and add comments thereafter. BA may triage only assigned/authorized divisions, request clarification and propose deltas; BA does not need ERP owner privileges or access to payroll documents. Business owner accepts rule changes. Engineer updates delivery metadata; QA provides evidence; release manager controls deployment. Owner may reassign/override with a reason and audited event. Viewers and talent can submit and see their own reports; cross-user listing is restricted. Confidential/security feedback has a narrower group and is not mirrored to a public issue with sensitive evidence.

Canonical diagram: [15-erp-feedback-loop.mmd](../architecture/15-erp-feedback-loop.mmd).

## BA operating cadence and concrete example

R: proposed initial targets are acknowledgement within one business day, BA triage within two business days, and immediate incident routing for suspected data exposure/corruption or total outage. Assign actual on-call coverage before treating these as commitments. Weekly review examines ageing requests, unresolved clarifications, repeated module failures and accepted-but-unreleased deltas; it does not auto-close old requests.

**Synthetic example, not a recorded user complaint:** a Marketing reviewer converts a qualified lead and reports missing headcount in Sales. Context captures `/marketing/[id]/edit`, a typed lead reference and release `example-sha`; screenshot has client details redacted. BA reproduces F11, checks whether headcount should copy or require Sales confirmation, and records a delta approved by Marketing/Sales. Acceptance: converting a 3-person lead preserves the agreed quantity/role/price-period; second conversion does not duplicate; unauthorized viewer is denied. Engineer links the regression/PR, deployment moves it to testing, and the reporter validates the specific release. If the rule is deliberately “Sales confirms,” the accepted delta specifies that UI rather than silently changing commercial semantics.

## Release acceptance tests

1. Talent and backoffice viewer open feedback from their own page; context is correct and no protected data is copied. Pending/rejected accounts cannot mutate feedback.
2. Foreign feedback/attachment IDs cannot be read, edited, signed or deleted. BA triage does not grant broad HR or owner access.
3. Double submit and retry after attachment failure create one request, preserve text and report the upload outcome accurately.
4. BA records a delta, acceptance criteria, owner and GitHub reference; invalid transition or stale version returns conflict.
5. One real authorized reviewer exercises the full report→clarification→backlog→release→validation loop and supplies closure evidence; a failed criterion reopens the record.
6. Release rollback identifies affected `testing` requests; they do not remain “verified” solely because a reverted version briefly deployed.

Measure time-to-triage, requests missing context/AC, reopened rate, unresolved severity, ageing by owner and accepted-to-validated lead time. Counts of suggestions alone do not show whether the ERP fits user work.
