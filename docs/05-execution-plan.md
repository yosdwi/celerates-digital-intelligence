# Execution Plan

## Objective

Move Celerates from a broad existing ERP baseline into a production-usable Digital Operational Core while real users validate workflows, data ownership and usability. Intelligence continues in parallel only where ERP/system boundaries are stable.

This plan deliberately separates:

1. **Management Timeline** — the Oct 2026 to Feb 2027 delivery view used for alignment.
2. **Detailed execution/WBS** — the task-level breakdown maintained in the project spreadsheet.
3. **Repository product implementation track** — the implementation sequence for the Intelligence foundation in this repository.

The plan is not a rigid waterfall. Documentation, pilot feedback and implementation run in parallel.

## Delivery rules

- **Mature divisional workflows first.** Prioritize the connected Celerates service lifecycle before rebuilding commodity SaaS features.
- **Capability-driven migration.** For overlapping functions choose `retain / integrate / migrate / rebuild / retire`.
- **One write-owner.** Every operational state has one authority at a given transition stage.
- **Role-based experience.** Navigation follows the user's job; it does not need to mirror domain ownership.
- **Pilot early.** Do not wait for perfect documentation before selected users exercise real workflows.
- **Intelligence downstream.** AI consumes trusted governed context and cannot become operational truth.
- **Portable production.** Target deployment is Docker-based on the approved VPS baseline; historical provider-specific pilots are not target architecture.

---

## Timeline — Oct 2026 to Feb 2027

### October 2026 — Alignment & Sales Pilot

**Wave 1 decision (2026-10-05): Sales is the first end-to-end pilot domain.**

Focus:

- keep the approved high-level architecture/product principles as the baseline;
- harden the existing Sales journey from Opportunity handling through PQ/Requisition handoff;
- enable the approved backoffice login options: WebAuthn passkey/biometric plus corporate identities on `@celerates.com` and `@celerates.co.id`;
- review the production security/access baseline for actual Sales pilot accounts;
- provision selected Sales users and role/access levels;
- run a representative real Sales scenario before broad redesign;
- start one feedback/backlog loop;
- prepare only the technical design needed to unblock the pilot and production path.

Exit / gate:

- selected Sales users can access the system safely;
- the priority Sales workflow reaches a clean downstream handoff without a P0 blocker;
- critical state is traceable from Opportunity to generated PQ/Requisition;
- architecture and known source/write-owner assumptions for the pilot are explicit;
- user feedback enters one governed backlog.

Detailed execution and implementation status are maintained in `docs/23-sales-pilot-wave-1.md`.

### November 2026 — Validate & Fix

Focus:

- user shadowing and BA requirement capture;
- P0/P1 workflow and UX remediation;
- source-of-truth mapping;
- prioritize Talenta, ConForm/PAMA and other provider adapters only where needed;
- validate cross-module handoffs;
- reconcile critical data gaps.

Exit / gate:

- priority workflows are usable end-to-end;
- there is no critical access/security blocker;
- data ownership and retained external-system boundaries are clearer;
- fallback to uncontrolled manual/spreadsheet work is reduced.

### December 2026 — Consolidate & Mature

Focus:

- scale reusable ERP interaction patterns;
- execute priority data migration/reconciliation;
- implement selected integrations;
- mature PMO/Finance and other cross-division handoffs;
- demonstrate one Intelligence vertical slice only on trusted operational data.

Exit / gate:

- selected workflows are stable enough for broader rollout;
- source ownership and transition dependencies are explicit;
- selected integrations are live and governed;
- Intelligence demonstrates value without bypassing ERP authority.

### January 2027 — Production Rollout

Focus:

- controlled rollout of validated divisions/workflows;
- monitoring and operational runbook;
- independent security retest;
- infrastructure sizing from measured workload;
- adoption, reliability and actual operating-cost measurement.

Exit / gate:

- selected priority workflows are production-usable;
- production monitoring/runbook and security evidence exist;
- management has real adoption, reliability and cost evidence for scale decisions.

### February 2027 — Stabilization & Next Roadmap

Focus:

- close remaining high-impact gaps;
- retire legacy surfaces only where replacement is proven;
- optimize usability and integrations;
- hand over operating procedures;
- define the next roadmap from measured outcomes.

Exit / gate:

- no unresolved P0 blocker in rolled-out workflows;
- legacy retirement is explicit and evidence-based;
- next investment priorities are agreed from usage data.

---

## Transformation workstreams

### A. ERP workflow maturity and adoption

Run the recurring loop:

```text
Selected user runs ERP workflow
        ↓
BA captures evidence / requirement delta
        ↓
Tech Lead triages business + architecture impact
        ↓
Implementation
        ↓
Release
        ↓
User validates again
```

A feature is not considered mature until Flow, Data, Experience, Control and Adoption are sufficiently proven.

### B. Source ownership, integration and migration

For each capability/source:

1. identify the current authority and users;
2. decide retain, integrate, migrate, rebuild or retire;
3. define the target write-owner and conflict policy;
4. implement adapter/import/reconciliation if needed;
5. parallel-run only where necessary;
6. cut over and retire duplicates only after validation.

Mekari Talenta is not assumed to be removed as an initial objective. A retained specialist capability may remain authoritative behind a governed adapter.

ConForm/PAMA integrations are treated as transitional operational dependencies where still required. Their user-facing replacement/cut-over follows proven ERP capability, not a big-bang rewrite.

### C. Security and production readiness

Maintain the current security baseline and close remaining production gaps:

- revocable sessions and lifecycle;
- role/capability authorization and record boundaries;
- sensitive-data classification and private documents;
- audit and step-up for sensitive operations;
- backup/restore;
- observability;
- deployment/rollback;
- independent security testing before broad rollout.

### D. Portable infrastructure

Initial target topology:

```text
Internet / Cloudflare
        ↓
Hostinger VPS baseline
        ↓
Docker runtime
├ ERP Web / services
├ Intelligence API / workers
├ PostgreSQL
├ Private S3-compatible object storage
└ Self-hosted observability
```

The baseline remains intentionally small. Scale the VPS or separate components only when measured CPU, RAM, storage, concurrency, retention or reliability requirements justify it.

Cost values live in the management spreadsheet rather than this architecture document.

### E. Intelligence foundation and applications

Deliver progressively only on governed operational context:

- ERP READ / EVENT / ACTION contracts;
- Context & Knowledge;
- Model Gateway;
- Pre-Sales Intelligence;
- Exception Management;
- Human Services;
- Management Intelligence;
- feedback/outcome evaluation.

The closed loop remains:

`ERP state → Intelligence → reviewed/controlled output → ERP action/state → outcome/evaluation`.

---

# Repository Product Implementation Track

This repository can continue moving in parallel with ERP maturity by keeping adapters explicit and demo mode functional.

## Product Phase 1 — Scaffold and run locally

Deliver:

- monorepo/application structure;
- React web shell;
- FastAPI service;
- PostgreSQL + pgvector migration baseline;
- MinIO integration boundary;
- Docker Compose;
- `.env.example`;
- seed data;
- health endpoints;
- demo ERP adapter;
- demo model provider/gateway adapter.

Exit condition: one command path runs the application and seeded overview page.

## Product Phase 2 — Flagship Pre-Sales vertical slice

Deliver one complete vertical slice before expanding broad scope.

1. Opportunity list and detail.
2. Create opportunity.
3. Register/upload TOR/RFP.
4. Store source metadata/object.
5. Analysis workflow state.
6. Generate all Pre-Sales Intelligence Pack artifact types in deterministic demo mode.
7. Persist artifacts.
8. Human edit/review/approve.
9. Clarification/ready-for-sales state transitions.
10. Persist outcome through ERP adapter.
11. Source/provenance visibility.
12. Contextual copilot UI shell against the same opportunity context.

Exit condition: stakeholder can complete the flow without a developer explaining hidden steps.

## Product Phase 3 — Intelligence infrastructure adapters

Add real extension points while preserving demo mode:

- LiteLLM gateway configuration;
- model aliases and provider routing;
- embeddings provider abstraction;
- pgvector + PostgreSQL FTS hybrid retrieval;
- Docling document parsing;
- LangGraph workflow with human-review checkpoint;
- optional Langfuse traces;
- n8n optional Docker profile and example webhook -> intake API workflow.

Exit condition: real provider can be enabled only through config, without frontend changes.

## Product Phase 4 — Supporting application surfaces

Build production-shaped P1 surfaces:

- Exception Action Center;
- Human Service inbox/case detail;
- Management Intelligence / Executive Action Brief;
- Sources & Integrations;
- System status.

Use meaningful seeded scenarios. Avoid adding screens with no workflow value.

## Product Phase 5 — Real ERP integration

As ERP contracts stabilize, replace demo reads/actions incrementally behind the existing adapter boundary.

Priorities:

- opportunity/customer read model;
- capability / talent / allocation context;
- relevant project/history context;
- workflow-state events;
- controlled status/task/artifact actions;
- exception signals such as BAST, contract, deadline, SLA/timesheet states.

Do not couple the Intelligence Core directly to unstable ERP tables as a shortcut.

Exit condition: at least one flagship workflow runs against real ERP context through the adapter contract.

## Product Phase 6 — Presentation hardening

- responsive QA;
- loading/error/empty states;
- accessibility pass;
- consistent terminology;
- realistic copy;
- architecture diagrams rendered/exported;
- transformation roadmap visible;
- sample data reviewed for coherence;
- demo walkthrough in README;
- screenshots if useful;
- tests green.

---

## Implementation priority rules

When there is tension between breadth and depth, prefer:

`one complete real workflow > many static pages`.

When there is tension between rapid intelligence development and unstable ERP structure, prefer:

`stable adapter contract > direct coupling to temporary ERP tables`.

When a source has moved operationally into ERP, prefer:

`ERP as working source of truth > permanent duplicate Google Sheet workflow`.

## Parallel work guidance

Parallel work is explicitly allowed.

Examples:

- Web developer hardens ERP while Tech Lead defines Intelligence contracts and evaluates stack/runtime.
- Pre-Sales vertical slice continues in demo mode while the real ERP adapter matures.
- Human Service/chatbot work can progress where required identity/context is already stable.
- Exception rules can be specified before all notification channels are implemented.

The constraint is not “ERP must be 100% finished first”. The constraint is that Intelligence must not invent or own business truth that belongs to ERP.

## Suggested work breakdown

### Cloud / ERP maturity

- infrastructure sizing;
- ERP production-like deploy;
- user access;
- BA review loop;
- service-specific requirements;
- source inventory and migration;
- cut-over tracking.

### Foundation

- web/api/worker/infra;
- schema + migrations + seed;
- ERP adapter contract;
- object storage abstraction;
- auth/demo user context baseline;
- health/system status.

### Pre-Sales

- opportunity CRUD/read model;
- document intake;
- analysis run state machine;
- artifact schemas;
- artifact generation demo engine;
- artifact review/approval;
- capability/capacity read model;
- relevant experience retrieval;
- proposal composition;
- workflow timeline/provenance.

### Intelligence

- LangGraph workflow;
- LiteLLM adapter;
- hybrid retrieval;
- Docling parser;
- tracing hooks;
- prompt/version metadata;
- evaluation hooks.

### Applications

- exceptions;
- human service;
- management;
- notifications/cross-application action center.

### Presentation

- overview landing;
- product copy;
- responsive pass;
- architecture page/links;
- current → transition → target diagram;
- demo script.
