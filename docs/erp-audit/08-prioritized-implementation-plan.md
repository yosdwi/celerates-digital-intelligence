# 08 — Prioritized implementation plan and reconciliation

**Decision proposed:** harden the canonical ERP in place, deploy an invited Railway pilot through explicit gates, learn from contextual user/BA feedback, and integrate Intelligence through a versioned boundary. This audit commit changes documentation and audit tooling only. It does not migrate, refactor or deploy ERP.

## Reconciliation with available ChatGPT material

The available first-pass material is the preliminary observations in `HANDOFF-ERP-AUDIT-ASTRA.md` and `docs/08-erp-audit-productionization-plan.md`, not a separate detailed ChatGPT finding register. “Agreement” below means consistency with those supplied leads. It is **not** a second reviewer signature. Preserve pending differences; obtain that register/review before marking reconciliation accepted.

| Area | Available ChatGPT observation | Independent audit | Agreement / open question | Proposed decision |
| --- | --- | --- | --- | --- |
| Runtime | Next.js 15, React 19, TypeScript | Package/lock/build independently confirm Next 15.5.22 and React 19; 87 pages | Confirmed; Node support policy still undecided | Retain stack; pin tested supported runtime and patched lockfile |
| Architecture | Server Action monolith, Drizzle/Postgres | Direct loaders/actions → DB; 2 route handlers | Confirmed | Preserve monolith, strengthen shared service boundary |
| Schema | Approximately 60 tables | Exactly 60 `pgTable` definitions; manifest/table inventory retained | Confirmed | Version schema/migrations, avoid speculative splitting |
| Business breadth | Marketing/Sales/TA/HR/TM/PMO/Finance and support | Implemented linked handoffs, timesheet, attendance, LMS, signatures, tasks and CRM | Confirmed; UAT unknown | Exercise six actual journeys, not static demos |
| Build/readiness | Weak production packaging evidence | **Direct build, typecheck and start pass**; npm build/start scripts absent | Refines preliminary concern: “cannot compile” would be incorrect | Fix reproducibility and operations, no rewrite |
| Auth/access | Access logic present | Division ranks, signer and own-record checks exist; action-level gaps independently probed | Partial coverage, not “no RBAC” | Prioritize F03–F05 and active-account revocation tests |
| PII/storage | Supabase primarily storage | Service-role storage wrappers; selected AES-GCM field encryption; arbitrary signing/deletion boundaries | Existing protections acknowledged; actual bucket/data state unknown | Retain storage initially, fix authorization and recovery |
| Sheets | Several sync paths | Ten two-way modules; clear→write, 999-row pull window, ambiguous IDs | Confirmed and sharpened | Freeze unsafe live writes, reconcile per-domain single-writer cut-over |
| Feedback | Contextual user feedback required | Existing tracker already supports reports/attachments/status/notifications; lacks automatic context/BA/release closure | New implementation should **extend**, not duplicate tracker | Follow [05](05-user-feedback-and-requirement-loop.md) |
| Automation | Reminder/document foundations | Email/document code exists; WhatsApp explicit stub; cron redirected and time ignored | Foundations confirmed, readiness not confirmed | Durable scheduling/side-effect controls before outbound enablement |
| Production evidence | No obvious CI/tests/Docker/migrations/env/runbook | Manifest confirms absent in ZIP; external systems not supplied | Confirmed only within snapshot | Obtain canonical deployment artifacts; implement missing gates |
| Railway target | Web + DB + objects + jobs; provider choice open | Existing storage coupling favors retaining ERP Supabase first; dedicated Railway ERP DB/web recommended | Recommendation, not observed deployment | Keep Intelligence MinIO ADR unchanged; compare future consolidation with evidence |
| ERP–Intelligence | Controlled READ/EVENT/ACTION | No current versioned boundary; ambiguous entities/capacity/BAST/cases need mapping | Confirmed | Incremental contract, no direct table coupling |
| New findings | No detailed prior register supplied | F10–F16 concurrency/semantic/provenance issues, F19 seed gaps, F20 dependency advisories, F21 calendar/rule questions | Await independent second-reviewer disposition | Keep findings distinct with evidence, tests and owners |

Second-reviewer acceptance template: finding ID, agree/disagree/needs evidence, counter-evidence file/function/test, priority/effort change, business decision required, reviewer/date, resolution. A disagreement stays open until a reproducible check or named business decision resolves it. Do not average severity values or claim a reviewer conversation occurred.

## Decisions and evidence still needed

| ID | Decision/evidence | Accountable role to name | Blocks |
| --- | --- | --- | --- |
| D01 | Canonical ERP repo/commit, current deployed version, migration history and divergence from ZIP | ERP maintainer | Editing production implementation; schema baseline |
| D02 | Reviewer roster, BA, domain owners, incident/support owner, budget and data classification | Sponsor + BA | Invited pilot acceptance |
| D03 | Which fields/records are authoritative in each Sheet/Excel/Jira/manual source; full counts and sample reconciliations | Domain stewards | Live migration/cut-over |
| D04 | Client identity, user↔employee mapping, project/PQ meaning, multi-contract/assignment cardinality | Sales + HR/TM + PMO | Constraints and reliable READ DTOs |
| D05 | Invoice vs project handoff semantics, BAST due/receipt rules, billing proration, overdue threshold, period cap | PMO + Finance | Consequential billing use and exception events |
| D06 | Skill verification/capacity formula, calendars, fractional allocations | TM + HR | Trustworthy staffing recommendations |
| D07 | BA permissions, confidential feedback visibility, critical business approval/override policy | Business owner + Security | Feedback and ACTION enablement |
| D08 | Railway plan/region/domain/account limits, actual DB/bucket config, backup retention and RPO/RTO, object volumes | Platform + sponsor | Cost/resource validation and G2 |
| D09 | Detailed first-reviewer register/disposition against this independent audit | Designated ChatGPT reviewer + ERP maintainer | G0 reconciliation sign-off |

These are implementation inputs to collect, not a request to stop the audit before producing concrete deliverables. Defaults proposed in [05–07](README.md) are visibly recommendations and must not silently become business facts.

## Assignable backlog

IDs below are proposed work-item IDs, **not newly created GitHub issue numbers**. Create/link them in the canonical ERP repository after D01 and reconciliation. Evidence/F IDs map to [04](04-production-readiness-audit.md). Owner labels are roles; named assignments remain D02. Estimates are rough person-days, not calendar dates. Uncertainty is M unless H is stated.

| Work item / wave / owner | Dependencies | Concrete change | Acceptance evidence / effort |
| --- | --- | --- | --- |
| ERP-001 / W0 / Maintainer + reviewer | D01, D09 | Record canonical commit, snapshot diff and finding dispositions | No contradictory finding silently closed; implementation branch starts from known canonical version. 1–2d H |
| ERP-002 / W0 / Platform + ERP engineer | ERP-001 | Build/start/typecheck commands, engine, env example, Docker/CI and pinned image (F01) | Fresh clone installs/builds/starts with documented commands and no production build secrets. Direct build result retained as baseline. 1–2d |
| ERP-003 / W0 / ERP engineer + Security | ERP-001 | Review/patch Next and affected transitive dependencies (F20) | Lockfile review, build and critical regression checks; each residual advisory has reachability/disposition, no blind major downgrade. 1–3d |
| ERP-004 / W0 / DB engineer | ERP-001, actual schema | Baseline/drift assessment, reviewed migrations and recovery discipline (F02) | Empty DB + masked upgrade + failed migration recovery exercised; no direct production schema push. 2–4d H |
| ERP-005 / W0 / ERP engineer | ERP-004, nominated owner | Idempotent complete reference seed and one-time bootstrap (F19) | All runtime divisions including Finance/School; rerun never re-elevates arbitrary existing user. 1–2d |
| ERP-006 / W0–1 / ERP engineer + Security | ERP-001 | Active actor/resource policy, tasks/feedback/attachment action audit (F04/F23) | HTTP test matrix owner/editor/viewer/talent/pending/rejected/deleted and foreign IDs; sensible login/register limits. 4–7d |
| ERP-007 / W1 / ERP engineer + Security | ERP-006 | Document-ID signing/download authorization, parent checks, safe uploads (F03/F08) | Cross-user/division path denied; private download, retry/orphan handling; large video denied server-side during pilot. 2–5d |
| ERP-008 / W1 / Platform | ERP-002–007, D08 | Isolated Railway staging/pilot, persistent DB/objects, runtime config, domain/OAuth (F18) | HTTPS URL, readiness, data/file persistence through redeploy, release identity and operator ownership recorded. 2–4d H |
| ERP-009 / W1 / Platform + Security | ERP-008 | Backup + logical export + key custody + restore/code rollback drill (F06/F18) | Timed restore with DB, object and encrypted-field checks; RPO/RTO accepted; previous image recovers compatibly. 2–4d H |
| ERP-010 / W1 / ERP engineer | ERP-006 | Server-side feature controls for unsafe Sheets writes/outbound/video | Direct action invocation denied, not just hidden UI; dry-run/test recipients only. 1–2d |
| ERP-011 / W2 / ERP engineer + BA | ERP-006/007/008, D02/D07 | Extend existing feedback model/UI with context, BA workflow, issue/release links (F17) | All six feedback acceptance scenarios from [05](05-user-feedback-and-requirement-loop.md); one reporter validates an actual release. 3–6d |
| ERP-012 / W3 / Domain engineer + BA | D04, ERP-004/006 | Pre-sales carry-forward and conversion uniqueness (F10/F11) | Approved field map; repeat/concurrent conversion produces one correct linked chain. 2–4d |
| ERP-013 / W3 / Domain engineer | ERP-004/006, D07 | Versioned approval/promotion commands, audit/outbox and recovery (F12/F14/F16) | Both PQ/promotion orders; injected failure recovered; racing sign/reject yields one transition; actor/digest/source trace preserved. 5–9d |
| ERP-014 / W3 / PMO/Finance engineer + BA | D04/D05, ERP-004/006 | Bind invoice/handoff IDs; agreed cardinality/constraints; explicit generation command (F10/F13/F14) | Mismatched IDs denied; two months/contract amendments preserved; concurrent generator harmless. 3–6d H |
| ERP-015 / W3 / Domain engineer + Finance/HR | D05/D06, ERP-004 | Monetary validation/period revisions/timezone and agreed calendar rules (F15/F21) | Large amount, closed period, local midnight, leap/month/proration and multi-year tests; BA sign-off. 3–6d H |
| ERP-016 / W3 / Automation engineer | ERP-010/013, approved recipients | Safe cron/job entry, occurrence locks, delivery retries and dead-letter controls (F07) | Machine auth passes; day/time correct; repeated trigger/restart sends at most one intended occurrence per recipient or flags unknown outcome; WA disabled. 3–5d |
| ERP-017 / W4 / Integration engineer + stewards | D03/D04, ERP-006, ERP-004 | Governed import staging/crosswalk/reject ledger, token security and division permissions (F05/F06/F09/F10) | >1000-row input handled, same-name candidates separated, multi-assignment preserved, dry-run/replay/conflict tests. 5–10d H |
| ERP-018 / W4 / BA + stewards | ERP-017; affected W3 fixes | Pilot one domain cut-over, then repeat per domain | Signed counts/key sets/totals/sample evidence; Sheet made read-only, rollback delta ledger retained; zero unresolved high-impact discrepancy. 2–5d per domain H |
| ERP-019 / W5 / ERP + Python integration engineer | ERP-012/013, D04 | Scoped commercial/customer READ DTOs, pagination/version/tombstone contract (F22) | C01–C03 and C08 provider/consumer tests; no ERP DB credential in Intelligence. 3–5d |
| ERP-020 / W5 / ERP + Python integration engineer | ERP-013/019 | Transactional outbox/event cursor, replay/dedupe/dead-letter, reconciler | C04 commit-order/crash/replay tests; stream never publishes rolled-back facts. 3–5d |
| ERP-021 / W5 / ERP + Security + integration engineer | ERP-019/020, D07 | One approval-bound artifact-reference command; receipt/idempotency/audit | C05–C09 concurrent/replay/denial/failure tests; rejected approval causes no side effects. 3–5d |
| ERP-022 / W6 / Intelligence engineer + Sales reviewer | ERP-019–021 | Replace one demo adapter path with real authorized pre-sales read/review/write-back | C10: ERP read → cited draft through Gateway → human review → one artifact ref → ERP read-back; source version changes force review. 3–6d |
| ERP-023 / W6 / BA + integration engineers | Relevant domain cut-over + D05/D06/D07 | Extend BAST/capacity/service-case contracts only after semantics exist | Unknown capacity stays unknown; no fabricated case model or BAST state; contract regression per added domain. 4–10d H |
| ERP-024 / W7 / Platform + Security + ERP engineer | Pilot metrics, G3 | Measured query/worker scaling, recovery cadence, token/key rotation and expanded security review (F24) | Agreed latency/load/cost objectives met, restore and rotation rehearsed, no widened permissions. 3–7d H |

## Waves and exit gates

**Wave 0 — reproducible baseline and immediate security prerequisite.** Resolve canonical version/review, runtime, dependency and schema/bootstrap basics. Start F04 guard work here; security is not deferred until users are invited. Exit G1: clean image, isolated schema and reference data, known credentials, synthetic tests. The successful audit build reduces uncertainty but does not replace this gate.

**Wave 1 — Railway foundation.** Complete document/actor protection, persistence, readiness, logs, backup/key recovery and rollback. Keep unsafe features server-disabled. Exit G2 foundation: controlled URL can support invited review, with sensitive modules gated until their P1 fixes. No external outbound messages during setup.

**Wave 2 — BA loop.** Extend existing feature tracker and include release context. Exit: one actual reviewer raises a contextual item, BA links an accepted delta/issue, engineer releases, reporter validates. A “Done” checkbox without release/evidence is insufficient.

**Wave 3 — highest-value workflow hardening.** Prioritize lead→Sales→TA→HR/TM/PMO and invoice→Finance; preserve approved current behavior. Add failure/concurrency regression before invasive refactors. Exit: selected journey acceptance, monetary/calendar rules and critical approval invariants pass. Real billing/payroll/approval use waits for its affected fixes even if the general pilot is already reachable.

**Wave 4 — source reconciliation/cut-over.** One domain first, not simultaneous bidirectional migration. Exit per domain: stewards approve [03](03-data-model-and-source-of-truth-audit.md) metrics, legacy writer freezes, ERP becomes operational writer, recovery exists. Do not wait for every source to cut over before read-only contracts for already stable data.

**Wave 5 — controlled boundary.** Introduce READ, outbox EVENT and one reviewed ACTION incrementally, with C01–C09 provider/consumer tests. Exit: no direct-table integration, audit/idempotency/version/permission tests pass, non-implemented projections explicitly unavailable.

**Wave 6 — real Intelligence binding.** C10 pre-sales first. Exceptions, Human Services and Management use only accepted domain contracts; deterministic metrics remain deterministic, model provider access stays through Gateway, retrieval is provenance/ACL controlled. Exit: real end-to-end record and approved artifact returned to ERP, not a static demo or mock fallback masquerading as live.

**Wave 7 — measured operations.** Extend performance, resilience, security review and support maturity based on observed pilot load. Basic backups, authorization, release/rollback and monitoring are already Wave 1 requirements; only depth/scale is deferred.

## How to start the first implementation PR

After G0/D01, create a small canonical ERP PR for ERP-002/003/005 with its migration dependency explicit. Attach the audit build baseline, runtime/env instructions and clean-CI proof. Next, make a separate actor/document-boundary PR with adversarial tests (ERP-006/007). Do not combine UI redesign, schema normalization, storage migration and Intelligence integration into the deployment PR. Preserve source behavior unless the linked BA delta approves a change; if an accepted architecture decision truly blocks implementation, record a new/superseding ADR with evidence first.

## Completion state for Issue #3

All eight requested audit files, evidence manifests/probes and proposed contract artifacts are now present. The available preliminary claims are reconciled above. **Still pending:** distinct second-reviewer agreement, stakeholder decisions, canonical ERP implementation, actual Railway URL/recovery evidence, live business smoke/UAT, cut-over and real Intelligence binding. Keep Issue #3 open; this audit supplies the implementation basis rather than declaring its broader production outcome complete.

### Implementation continuation checkpoint

The user subsequently requested implementation to continue. A read-only access check on 2026-09-23 against the stakeholder-specified `abirohmattest/celerates-erp` returned GitHub API **404** through the configured connection; unauthenticated Git also could not retrieve it. This does not establish whether the repository is private, missing, renamed or outside the connection's access. No permission workaround, fork, deployment or ERP code mutation was attempted. D01 remains a blocking input: connect/authorize the canonical repository, supply its correct accessible location, or explicitly designate an alternative implementation repository and approve the ZIP as its starting baseline. Never silently promote the read-only audit snapshot into canonical production source.
