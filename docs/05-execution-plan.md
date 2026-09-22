# Execution Plan

## Objective

Move from architecture to a functional, presentation-ready baseline quickly, without creating throwaway code.

## Phase 1 — Scaffold and run locally

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

## Phase 2 — Flagship Pre-Sales vertical slice

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

## Phase 3 — Intelligence infrastructure adapters

Add real extension points while preserving demo mode:

- LiteLLM gateway configuration;
- model aliases and provider routing;
- embeddings provider abstraction;
- pgvector hybrid retrieval;
- Docling document parsing;
- LangGraph workflow with human-review checkpoint;
- optional Langfuse traces;
- n8n optional Docker profile and example webhook -> intake API workflow.

Exit condition: real provider can be enabled only through config, without frontend changes.

## Phase 4 — Supporting application surfaces

Build production-shaped P1 surfaces:

- Exception Action Center;
- Human Service inbox/case detail;
- Management Intelligence / Executive Action Brief;
- Sources & Integrations;
- System status.

Use meaningful seeded scenarios. Avoid adding screens with no workflow value.

## Phase 5 — Presentation hardening

- responsive QA;
- loading/error/empty states;
- accessibility pass;
- consistent terminology;
- realistic copy;
- architecture diagrams rendered/exported;
- sample data reviewed for coherence;
- demo walkthrough in README;
- screenshots if useful;
- tests green.

## Implementation priority rule

When there is tension between breadth and depth, prefer:

`one complete real workflow > many static pages`.

## Suggested issue/work breakdown

### Foundation

- scaffold web/api/worker/infra;
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
- demo script.
