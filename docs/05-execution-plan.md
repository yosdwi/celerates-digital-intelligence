# Execution Plan

## Objective

Move from architecture to a functional, presentation-ready baseline quickly, without creating throwaway code, while aligning delivery with the confirmed dependency that **ERP is the Digital Operational Core and the critical near-term foundation**.

This plan has two views:

1. **Transformation roadmap** — how Celerates moves from fragmented operations to ERP-centered digital operations and then intelligence.
2. **Product implementation roadmap** — how this repository continues delivering functional intelligence capability without waiting for every ERP detail to be finalized.

The phases are dependencies, not a rigid waterfall. Parallel work is allowed when contracts and source-of-truth boundaries are stable.

---

## Transformation Phase A — Cloud / delivery foundation

Deliver / decide:

- production-like hosting for ERP user review;
- domain / reverse proxy / Cloudflare where appropriate;
- PostgreSQL persistence;
- document/object storage where required;
- baseline monitoring / backup expectations;
- infrastructure sizing before locking a long-term provider.

Exit condition: real users can access the ERP outside local development reliably enough for structured review.

## Transformation Phase B — ERP hardening through real user review

Deliver:

- deploy existing ERP baseline rather than redesign from zero;
- let users execute actual service workflows;
- Business Analyst captures service-specific requirement deltas;
- improve forms, flow, approval, data model, UX, RBAC/audit as required;
- release incrementally and repeat user review.

Core loop:

```text
User tries ERP
   ↓
BA captures delta
   ↓
Tech Lead reviews / prioritizes
   ↓
Web developer implements
   ↓
Release
   ↓
User reviews again
```

Exit condition: priority business workflows are usable in ERP with known remaining gaps rather than hidden assumptions.

## Transformation Phase C — source consolidation and cut-over

Deliver:

- inventory current Google Sheets / Excel / siloed operational sources;
- map each source to ERP ownership or retained external-source responsibility;
- migration/import mapping;
- deterministic validation and reconciliation;
- parallel-run only where necessary;
- cut-over plan per business process;
- provenance / audit for migrated data.

Exit condition: processes owned by ERP no longer depend on uncontrolled duplicate operational spreadsheets as the primary working surface.

## Transformation Phase D — Intelligence foundation

Deliver:

- ERP read/event/action adapter contracts;
- Context & Knowledge layer;
- PostgreSQL + pgvector + PostgreSQL FTS;
- document/object knowledge path;
- FastAPI Intelligence API;
- LangGraph workflow orchestration;
- LiteLLM Model Gateway;
- Langfuse tracing/evaluation boundary;
- deterministic rules / exception engine;
- human review / controlled action pattern.

Exit condition: Intelligence applications can consume trusted ERP context and knowledge through stable boundaries without direct schema coupling.

## Transformation Phase E — Intelligence applications

Deliver progressively:

- Pre-Sales Intelligence;
- Exception Management;
- Human Services;
- Management Intelligence.

Exit condition: each application has at least one complete real workflow with trusted input, structured output, human/control point, and ERP feedback where applicable.

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
