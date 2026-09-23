# GPT Astra Work Handoff — ERP Audit & Production Readiness

## Mission

Audit the supplied Celerates ERP snapshot independently and turn the findings into a production-readiness and implementation plan that supports the Celerates Digital Intelligence roadmap.

This is an **audit-first workstream**. Do not begin broad refactors before the audit is complete, reconciled, and prioritized.

The target outcome is not merely a code review. The result must tell the team how to move the current ERP into a production-like environment that real users can access, how feedback will be captured and converted into requirement deltas, how Google Sheets/current siloed sources are transitioned into ERP, and how the ERP later exposes a controlled boundary to the Intelligence Layer.

## Read order

1. `README.md`
2. `docs/01-product-and-architecture.md`
3. `docs/07-meeting-alignment-mas-abi-2026-09-23.md`
4. `docs/08-erp-audit-productionization-plan.md`
5. `docs/02-technology-stack.md`
6. `docs/06-intelligence-stack-explained.md`
7. all Mermaid files under `docs/architecture/`
8. all ADRs under `docs/adr/`
9. `references/erp/README.md`
10. extract and inspect `references/erp/celerates-erp-main.zip` when the binary snapshot is present.

Do not treat the existing Intelligence P0 implementation as proof that the ERP is production-ready. The ERP and Intelligence Layer are separate concerns with a controlled integration contract between them.

## Stakeholder direction already established

The current operating state contains data/processes spread across Google Sheets, Excel, Jira, documents, databases and manual flows. The desired target is:

`transitional sources -> Celerates ERP -> Celerates Intelligence Layer -> Intelligence Applications`.

The ERP is the **Digital Operational Core** and should become the primary operational workspace. Current Sheets/siloed sources are transitional and should be cut over gradually after reconciliation and user validation.

ERP is a dependency for trustworthy intelligence, but development may run in parallel where source-of-truth boundaries and contracts are stable.

The immediate business priority is to expose ERP in a production-like environment so users can work with it directly and a Business Analyst can capture requirement deltas from actual usage.

## Snapshot facts already observed

These are observations from the supplied ZIP and should be independently verified by Astra:

- Next.js 15 / React 19 / TypeScript application.
- Predominantly a Next.js monolith using Server Components / Server Actions with Drizzle ORM and PostgreSQL.
- A large business surface across Marketing, Sales, TA, HR, Talent Management, PMO, Finance, Timesheet/Attendance, automation, document flows and management views.
- Approximately 60 PostgreSQL tables in `src/db/schema.ts`.
- NextAuth with Google OAuth and email/password patterns.
- Division/user access concepts and cross-division workflows.
- Multiple Google Sheets synchronization implementations.
- PostgreSQL access through Drizzle/postgres-js; Supabase is more visibly coupled to file/object storage than to application logic.
- Existing reminder/document automation foundations.
- Very small public/internal API surface compared with direct Server Action -> database usage.
- No obvious test suite, CI workflow, Docker production path, migrations directory, `.env.example`, or production deployment runbook were observed in the supplied snapshot.

Do not accept these as final conclusions without inspecting the snapshot yourself.

## Required audit outputs

Produce concrete files under `docs/erp-audit/`.

### 1. `01-as-is-business-capability-map.md`

Map implemented modules and cross-domain workflows. Distinguish:

- implemented and apparently usable;
- implemented but operationally incomplete;
- placeholder/prototype;
- duplicated/legacy/transitional functionality;
- unknown and requiring stakeholder validation.

### 2. `02-as-is-technical-architecture.md`

Document:

- runtime topology;
- Next.js/server action/API boundaries;
- database/data access;
- auth/RBAC;
- file/object storage;
- Google integration;
- automation/cron patterns;
- external dependencies;
- configuration/secrets;
- deployment assumptions;
- observability/error handling.

Create Mermaid diagrams where useful.

### 3. `03-data-model-and-source-of-truth-audit.md`

Assess:

- key master entities;
- ownership/source of truth;
- cross-module relationships;
- duplicate or risky representations;
- Google Sheets synchronization direction and conflicts;
- migration/cut-over risk;
- audit/provenance gaps;
- PII/security-sensitive data handling.

### 4. `04-production-readiness-audit.md`

Assess, with evidence:

- build/start reproducibility;
- configuration/env contract;
- migrations;
- seeding/bootstrap;
- tests;
- CI/CD;
- health/readiness;
- logging/monitoring;
- cron/background jobs;
- file persistence;
- database connection strategy;
- backup/restore;
- security headers/secrets/auth;
- rate limiting/abuse boundaries where applicable;
- error/loading/failure recovery;
- deployment rollback.

Classify findings as `P0 blocker`, `P1 before broad user rollout`, `P2 hardening`, or `informational`.

### 5. `05-user-feedback-and-requirement-loop.md`

Design a real operating loop:

`user -> production-like ERP -> feedback/evidence -> BA triage -> requirement delta -> prioritized backlog -> implementation -> release -> user validation`.

Define:

- how a user submits feedback from inside the ERP;
- module/page/URL/context captured automatically;
- screenshot/attachment support;
- category: bug / missing field / flow mismatch / business rule / usability / request;
- severity and business impact;
- reporter, division, owner, status;
- BA clarification and acceptance criteria;
- link to GitHub issue/backlog;
- release/version validation;
- closure evidence.

Do not create a generic suggestion box with no workflow.

### 6. `06-railway-production-like-target.md`

Define a minimal but serious Railway topology for user validation.

At minimum evaluate:

- ERP web/application service;
- PostgreSQL;
- object storage choice/persistence;
- scheduled/worker jobs;
- reverse proxy/custom domain/Cloudflare implications;
- volumes/backups;
- env/secrets;
- observability;
- migration/seed process;
- staging vs production-like environment separation;
- cost/resource sizing.

Do not assume Supabase/Vercel must remain. Also do not remove them merely because they are currently used. Make the decision from evidence and operational trade-offs.

### 7. `07-erp-to-intelligence-contract.md`

Define the controlled integration boundary for the Intelligence Layer.

At minimum:

**READ**
- opportunity/customer;
- employee/talent/skills;
- project/allocation;
- contract/BAST/invoice/timesheet;
- capability/capacity;
- approval/workflow state.

**EVENT**
- opportunity changed;
- approval changed;
- BAST pending/updated;
- contract expiry proximity;
- project/workflow milestone changed;
- user/service case state changed.

**ACTION**
- create/update task;
- create case;
- update status;
- persist approved artifact reference;
- acknowledge/escalate reminder;
- attach generated document/reference.

Specify auth, idempotency, audit, error semantics, and what must never be written directly by AI.

### 8. `08-prioritized-implementation-plan.md`

Turn findings into executable waves, owners, dependencies and exit criteria.

Prefer a roadmap like:

- Wave 0 — reproducible local/build baseline;
- Wave 1 — Railway production-like deployment foundation;
- Wave 2 — user/BA feedback loop;
- Wave 3 — ERP critical workflow hardening;
- Wave 4 — Google Sheets migration/reconciliation/cut-over;
- Wave 5 — ERP controlled API/event/action boundary;
- Wave 6 — bind Intelligence Layer to real ERP contracts;
- Wave 7 — scale/observability/security hardening.

Adjust based on evidence.

## Two-pass audit model

This workstream is intentionally reviewed by both ChatGPT and GPT Astra.

Astra should produce an **independent audit first**, not merely agree with previous observations.

For each finding include:

- evidence/file/function;
- current behavior;
- risk or limitation;
- proposed target;
- whether it is fact, inference, or recommendation;
- priority;
- estimated effort/uncertainty;
- affected business flow.

After the independent audit, reconcile it with the ChatGPT audit. Differences should be kept visible until resolved; do not average away conflicting findings.

## Implementation rules after audit

When implementation begins:

- preserve business behavior unless change is intentional and documented;
- add tests around critical behavior before invasive refactors;
- avoid a full rewrite;
- keep ERP as operational source of truth;
- treat Google Sheets as transitional until cut-over is verified;
- do not couple Intelligence directly to ERP tables;
- make deployment reproducible;
- add migration and rollback discipline;
- expose health/readiness;
- establish durable persistence and backup for production-like user testing;
- never commit production secrets;
- keep user feedback tied to page/module/release context;
- make every primary demo/review flow functional, not static.

## Definition of success

This workstream is successful when:

1. the ERP can be built and deployed reproducibly;
2. a Railway production-like URL is available to real reviewers;
3. operational data persists across deploys;
4. critical workflows are smoke-tested;
5. users can submit contextual feedback;
6. BA can convert feedback into traceable requirement deltas/backlog;
7. Google Sheets migration/cut-over is explicitly planned rather than implicit;
8. ERP read/event/action contracts are documented and testable;
9. Intelligence can integrate without direct arbitrary database coupling;
10. the repo contains evidence-backed audit docs and an executable implementation backlog.
