# Functional Showcase Scope — v0

## Goal

Produce a working baseline that can be shown immediately while preserving the architecture required for real integration later.

The showcase must not depend on access to the production Celerates ERP or paid LLM credentials.

## Demo operating modes

### Demo mode — mandatory

- seeded ERP-like data;
- deterministic analysis/artifact generation;
- local documents/sample TOR;
- all main Pre-Sales actions work;
- exceptions, human-service cases and management briefs have meaningful data;
- clearly label environment as Demo, without making the UI feel like a toy.

### Connected mode — architecture-ready

Activated by environment configuration:

- real ERP HTTP adapter;
- real LiteLLM/model provider;
- MinIO/S3 storage;
- optional n8n;
- optional Langfuse.

The frontend contracts should be the same in both modes.

## P0 functional flow — Pre-Sales

Seed at least 3 opportunities in different states:

1. New / not analyzed.
2. Analyzed but clarification required.
3. Ready for Sales / approved.

A user can create an opportunity and run analysis.

Workflow states:

`NEW -> INGESTING -> ANALYZING -> REVIEW_REQUIRED -> CLARIFICATION_REQUIRED or READY_FOR_SALES -> APPROVED/ARCHIVED`

The UI should surface failures/retry state as well.

## Pre-Sales Intelligence Pack

### 1. Opportunity Brief

Fields/examples:

- customer;
- opportunity objective;
- summary;
- expected timeline;
- expected scope/domain;
- owner;
- source documents;
- completeness status.

### 2. Requirement Matrix

Structured rows:

- requirement;
- category;
- priority;
- source/evidence;
- confirmed/assumption/missing;
- notes.

### 3. Clarification List

Each item:

- question;
- why it matters;
- source/gap;
- owner (Sales/customer/internal);
- state.

### 4. Relevant Experience

- project/proposal name;
- customer/domain;
- matching capabilities;
- similarity/relevance explanation;
- evidence/source reference;
- reusable assets/lessons where available.

### 5. Capability & Capacity Fit

Required roles/capabilities compared to trusted ERP/demo data:

- required capability;
- fit status;
- candidate/available capacity summary;
- constraint/gap;
- evidence timestamp.

The model does not invent availability.

### 6. Risk & Assumption Register

- item;
- type;
- probability/impact label where used;
- rationale/evidence;
- mitigation/clarification;
- owner.

### 7. Solution Outline

- business problem;
- proposed solution;
- key capabilities;
- high-level architecture;
- integrations;
- security considerations;
- delivery approach.

### 8. Scope Draft

- in scope;
- out of scope;
- dependencies;
- acceptance assumptions.

### 9. BOQ / Effort Draft

- role/work package;
- activity;
- effort estimate;
- dependency;
- assumption;
- pricing source status.

Rates/prices are not generated unless supplied from trusted data.

### 10. Proposal Draft

Editable structured narrative assembled from approved artifacts.

### 11. Next Actions

- action;
- owner;
- due/urgency;
- blocking/not blocking;
- completion state.

## P1 support flows

### Exception Management

Seed meaningful examples such as:

- BAST overdue;
- contract nearing expiry;
- timesheet incomplete;
- approval/opportunity stuck.

Show deterministic trigger facts plus enriched context and actions.

### Human Service

Seed questions/cases that demonstrate:

- routine answer with source;
- routed case with context pack;
- human review/draft response.

### Management Intelligence

Seed Executive Action Briefs derived from demo metrics/exceptions. Let user drill into evidence.

## Acceptance criteria

- clean install/run instructions;
- no paid external dependency required for demo mode;
- all P0 actions persist across page refresh;
- primary Pre-Sales buttons actually work;
- source/provenance is visible;
- deterministic vs AI-assisted content is distinguishable in implementation, even if visually unified;
- responsive UI works at desktop and mobile widths;
- architecture diagrams align with code boundaries;
- tests cover analysis workflow state transition and artifact persistence at minimum.
