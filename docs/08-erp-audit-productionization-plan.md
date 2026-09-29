# ERP Audit & Productionization Plan

## Objective

Turn the current Celerates ERP from a broad but still evolving internal application into a **production-like operational core** that can be used by real users for structured review, feedback and iterative hardening, while preparing a controlled integration boundary for the Celerates Intelligence Layer.

This plan is based on three inputs:

1. the existing Celerates Digital Intelligence architecture and roadmap;
2. stakeholder direction from the 2026-09-23 discussion with Mas Abi;
3. an initial read-only inspection of the supplied `celerates-erp-main.zip` snapshot.

The snapshot audit must still be independently validated by GPT Astra before implementation decisions are treated as final.

## Guiding principle

Do not rewrite the ERP from zero.

The ERP already contains a wide business surface and cross-division workflows. The work is to understand, harden, deploy, validate with users, reduce transitional dependencies, and expose controlled contracts.

Target transformation:

```text
CURRENT
Google Sheets / Excel / Jira / documents / manual flows
        ↓
TRANSITION
Celerates ERP available to real users
        ↓
BA-led feedback and requirement delta loop
        ↓
ERP workflow/data hardening
        ↓
reconciliation + gradual source cut-over
        ↓
TARGET
Celerates ERP — Digital Operational Core
        ↓
controlled READ / EVENT / ACTION boundary
        ↓
Celerates Intelligence Layer
        ↓
Pre-Sales / Exception / Human Services / Management Intelligence
```

## Workstreams

### A. ERP as-is audit

Required outputs:

- business capability map;
- cross-domain flow map;
- technical/runtime map;
- data model and source-of-truth map;
- dependency map;
- security/auth/RBAC assessment;
- production-readiness findings;
- migration/cut-over risks;
- integration points for Intelligence.

### B. Production-like Railway deployment

The target environment is intended for stakeholder/user review, not fake static demonstration.

Minimum success path:

```text
GitHub
   ↓
CI verification
   ↓
Railway deploy
   ├── ERP web / Next.js service
   ├── PostgreSQL
   ├── persistent document/object storage
   └── scheduled/worker path where required
   ↓
custom/review URL
   ↓
real user validation
```

The exact storage topology must be decided from source evidence. Supabase Storage may remain temporarily, be replaced by S3-compatible object storage, or be bridged during migration. Do not choose based on aesthetics.

### C. User feedback loop

The production-like environment should include contextual feedback capture.

Every feedback item should capture, where possible:

- user identity;
- division/role;
- page/module;
- URL/route;
- current record/entity identifier;
- release/build version;
- timestamp;
- category;
- severity/business impact;
- user description;
- expected behavior;
- screenshot/attachment;
- BA clarification;
- acceptance criteria;
- engineering owner;
- linked GitHub issue/backlog item;
- release that contains the change;
- user validation outcome.

Preferred lifecycle:

```text
New
 ↓
BA Triage
 ↓
Need Clarification? ── yes ──> User Clarification
 ↓ no
Requirement Delta / Bug Confirmed
 ↓
Prioritized
 ↓
In Development
 ↓
Ready for Validation
 ↓
User Validated
 ↓
Closed
```

This creates evidence for iterative ERP maturity rather than relying on repeated informal meetings.

### D. Google Sheets transition

The current source inspection shows several Google Sheets synchronization paths. The target is not an abrupt shutdown.

Use a staged transition:

```text
Current Google Sheet
       ↓
map fields / ownership
       ↓
reconcile with ERP records
       ↓
dual-run / controlled sync if needed
       ↓
user validates ERP flow
       ↓
freeze source of truth direction
       ↓
cut-over
       ↓
archive / read-only legacy sheet
```

For each source, define:

- owner;
- business process;
- direction: import / export / bi-directional;
- conflict rule;
- record identity;
- duplicate rule;
- migration completeness metric;
- cut-over criteria;
- rollback/fallback.

### E. ERP -> Intelligence contract

Do not let Intelligence depend on arbitrary direct Drizzle/PostgreSQL access.

Target boundary:

```text
ERP UI / business logic
      ↓
ERP domain/service boundary
      ↓
┌─────────────────────────────────┐
│ READ        EVENT       ACTION  │
└─────────────────────────────────┘
      ↓
Celerates Intelligence Layer
```

The API/event contract should be added incrementally around stable business capabilities rather than forcing a full ERP service rewrite.

## Preliminary observations to verify

The supplied snapshot appears to include:

- Next.js 15 / React 19 / TypeScript;
- Drizzle ORM and PostgreSQL;
- roughly 60 tables in one main schema file;
- broad business modules across Marketing, Sales, TA, HR, TM, PMO, Finance and supporting operations;
- Google Sheets sync implementations in several domains;
- auth/access logic;
- reminder/document automation foundations;
- object/file storage usage;
- limited internal/public API surface compared with Server Actions;
- weak/absent production packaging evidence such as tests, CI, Docker, migration runbooks and `.env.example` in the supplied snapshot.

These are audit leads, not final verdicts.

## Audit method

### Pass 1 — ChatGPT audit

Produce evidence-backed findings from the snapshot and existing project docs.

### Pass 2 — GPT Astra independent audit

Astra must independently inspect the snapshot and produce its own findings.

### Pass 3 — Reconciliation

Create a matrix:

| Area | ChatGPT | Astra | Agreement | Open question | Decision |
|---|---|---|---|---|---|

Conflicts remain open until supported by code evidence or stakeholder clarification.

## Priority model

### P0 — blocks production-like review

Examples:

- cannot build/start reproducibly;
- env/secrets contract unclear;
- data/file persistence unsafe;
- migrations not controlled;
- auth critical defect;
- critical workflow crashes;
- deployment cannot be rolled out or smoke-tested.

### P1 — before broad user rollout

Examples:

- no contextual feedback loop;
- weak error/loading/recovery UX;
- missing auditability on critical action;
- background jobs unreliable;
- important role/access inconsistencies;
- source synchronization conflicts.

### P2 — hardening / architecture improvement

Examples:

- modularizing oversized boundaries;
- richer observability;
- performance optimization;
- reducing transitional dependencies;
- API/event contract expansion.

## Suggested implementation waves

### Wave 0 — Baseline reproducibility

- verify supported Node/package manager versions;
- add production build/start scripts;
- add `.env.example`;
- document required environment variables;
- define migration/bootstrap path;
- add basic smoke tests;
- add CI.

Exit: clean checkout can build and run from documented commands.

### Wave 1 — Railway production-like foundation

- deploy ERP app;
- attach PostgreSQL;
- make file/object persistence explicit;
- configure env/secrets;
- add health/readiness;
- configure scheduled jobs where required;
- establish custom/review domain;
- smoke-test critical login/module flows.

Exit: real stakeholder can access the environment reliably.

### Wave 2 — Feedback / BA operating loop

- contextual feedback UI;
- feedback entity/storage;
- triage states;
- screenshot/attachment;
- GitHub/backlog link;
- release/build reference;
- reviewer/owner/validation lifecycle.

Exit: user feedback produces traceable requirement deltas.

### Wave 3 — Critical workflow hardening

Use real user feedback and audit findings. Avoid speculative redesign.

Prioritize business flows with the highest operational value and cross-division dependency.

### Wave 4 — Source migration & cut-over

For each Google Sheet/source:

- ownership;
- mapping;
- reconcile;
- dual-run where justified;
- validation;
- cut-over;
- archive.

### Wave 5 — ERP controlled integration boundary

Add tested read/event/action contracts around stable entities/workflows.

### Wave 6 — Bind Intelligence Layer

Replace demo ERP adapters gradually with real contracts.

First candidates:

- Pre-Sales: opportunity/customer/capability/capacity/relevant project references;
- Exceptions: BAST/contract/timesheet/approval state;
- Human Services: employee/case/policy/service context;
- Management: deterministic metrics/read models.

### Wave 7 — Scale and governance hardening

- observability;
- backup/restore drills;
- security review;
- cost/performance optimization;
- release/rollback discipline;
- operational ownership.

## Railway target questions that must be answered by audit

Do not size from guesswork. Determine:

- Next.js runtime memory profile;
- database concurrency/pool behavior;
- expected initial reviewer count;
- object/file volume;
- Google API usage;
- scheduled job frequency;
- upload size limits;
- image/document processing load;
- backup retention;
- staging vs production-like isolation;
- custom domain/Cloudflare topology.

Then produce minimum / recommended sizing and monthly cost estimates.

## Product review experience

The production-like ERP should be presentable, but presentation polish must not hide incomplete behavior.

A stakeholder should be able to:

1. log in with an authorized account;
2. navigate the actual ERP modules;
3. execute supported business flows;
4. see clear loading/error/empty states;
5. submit contextual feedback from the current page;
6. understand what version is being reviewed;
7. see whether feedback is acknowledged/in progress/ready for validation;
8. validate a delivered fix without a separate spreadsheet.

## Relationship with the Intelligence P0

The Railway Intelligence demo remains useful as a reference/showcase, but it must not become an alternate source of operational truth.

The intended convergence is:

```text
Production-like ERP
      ↓
stable controlled contracts
      ↓
Intelligence Layer
      ↓
existing Intelligence web/application surfaces
```

The Intelligence repository is therefore the right place to keep the cross-system architecture, audits, integration contracts and roadmap, while the canonical ERP implementation should ultimately remain in its own ERP repository.
