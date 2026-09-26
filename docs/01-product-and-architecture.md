# Product & Architecture Definition

## 1. Problem statement

Celerates already has an ERP and existing digital workflows. The next problem is not “build an ERP” and not “add a chatbot”. The problem is to make Celerates operational data and institutional knowledge usable as a reliable intelligence capability across Sales/Pre-Sales, operations, talent/people service, and management.

Today business information can originate from Excel/CSV, Jira, databases, documents, forms, APIs, Google Sheets, and manual operational processes. Many of these are **current/transitional sources**, not the target operating model. The target is for users to work primarily through Celerates ERP where the relevant business workflow has matured.

The ERP remains the place where canonical business state is managed. Intelligence should consume trusted ERP context plus curated knowledge, use models safely, and return useful work products and actions back into business workflows.

## 2. Transformation storyline

The target architecture and the migration path are related but should not be confused.

```text
CURRENT
Fragmented operational inputs
Google Sheets • Excel • Jira • DB • Documents • Forms
        ↓
TRANSITION
ERP production access • user review • BA requirement deltas
workflow hardening • migration • reconciliation • cut-over
        ↓
TARGET
Celerates ERP — Digital Operational Core
        ↓
Celerates Intelligence Layer
        ↓
Celerates Intelligence Applications
```

Key rule:

> **ERP is the critical dependency, but delivery can run in parallel where integration contracts and source-of-truth boundaries are already stable.**

See `docs/07-meeting-alignment-mas-abi-2026-09-23.md` and `docs/architecture/12-current-transition-target.mmd` for the delivery/transformation view.

## 3. Canonical model

### Current / Transitional Raw Sources

Business and operational input can originate from:

- Google Sheets / Excel / CSV
- Jira / external APIs
- PostgreSQL / SQL Server / legacy databases
- TOR, RFP, proposal, contract, BAST, CV, policy and other documents
- Forms
- Manual input

These sources are not themselves the long-term source of truth. They enter through controlled ingestion, validation, migration, or transition workflows.

For a business process that has successfully moved into ERP, the target is to reduce or retire parallel operational use of spreadsheets/sheets rather than maintain duplicate sources indefinitely.

### Celerates Data Intake

This is a capability between current/transitional sources and ERP, not a separate business platform.

Responsibilities:

- connect/extract source data;
- normalize data into known contracts;
- validate deterministic fields/rules;
- reconcile conflicts/duplicates;
- preserve source provenance and ingestion audit;
- route rejected/conflicting records for review;
- support migration/cut-over from siloed sources;
- commit approved operational state to ERP.

Primary implementation is Python Integration Core. n8n is a supporting low-code integration/automation surface.

### Celerates ERP — Digital Operational Core

The existing ERP remains the canonical operational source of truth and is the **critical near-term product foundation**.

Typical responsibility:

- business/master data;
- customer and opportunity state;
- employee/talent/capability data;
- project and allocation state;
- workflows and approvals;
- contracts, timesheet, BAST, invoice and finance-related operational state;
- identity/RBAC/audit within the ERP domain.

#### ERP maturity loop

The ERP should mature through real usage rather than requirement guessing alone:

```text
ERP available to users
      ↓
User runs real workflow
      ↓
Business Analyst captures delta requirement
      ↓
Tech Lead reviews architecture / priority
      ↓
Web team implements
      ↓
Release and review again
```

The ERP should not be rebuilt from zero unless a concrete blocker demands it. Improve the existing baseline incrementally and let actual user usage expose service-specific requirements.

The intelligence layer should integrate through controlled APIs/read models/events/actions rather than making arbitrary direct writes to the ERP database.

### Celerates Intelligence Layer

This is the new shared intelligence capability above ERP. It has three major internal concerns.

#### A. Context & Knowledge

Provides the evidence required for intelligent work:

- structured business context from ERP read tools/models;
- approved historical project/proposal knowledge;
- documents and extracted structure;
- search/retrieval indexes;
- metadata and entity relationships;
- access metadata and provenance;
- freshness/version metadata.

Important: this is not “copy all ERP data into a vector database”. Current structured business state should generally be read as structured data; semantic retrieval is for knowledge/document similarity and contextual evidence.

#### B. Intelligence Core

Coordinates how work is performed:

- retrieval and hybrid search;
- context assembly;
- business rules and policy checks;
- ERP/tool calls;
- stateful reasoning workflows;
- human review/approval checkpoints;
- exception context enrichment;
- structured artifact generation;
- controlled automation coordination;
- guardrails and evaluation hooks.

#### C. Model Gateway

A first-class capability, not a hard-coded provider.

Responsibilities:

- OpenAI / Anthropic / Gemini / open-source access;
- provider abstraction;
- model selection per workload;
- fallback/retry;
- budget/cost visibility;
- quality/latency benchmarking;
- future policy-based routing.

The Model Gateway is important to the Intelligence Layer, but deterministic workflows do not become LLM-dependent just because the gateway exists.

### Celerates Intelligence Applications

These are business capabilities built on the shared layer, not separate AI stacks.

- Pre-Sales Intelligence
- Exception Management
- Human Services
- Management Intelligence

They may surface through web workspace, contextual copilot, in-app notification, WhatsApp, email/Teams, generated documents, or background automation.

A channel is not an application. For example, Exception Management can appear in the web Action Center, an in-app notification, a WhatsApp escalation, and management summary while remaining one business capability.

## 4. Application intent clarified by stakeholder discussion

### Pre-Sales Intelligence

The target output remains a structured Pre-Sales Intelligence Pack covering:

- brief/opportunity context;
- requirements;
- relevant experience;
- risk and assumptions;
- solution;
- scope;
- BOQ/effort;
- proposal;
- next actions and supporting evidence.

### Exception Management

Treat this as the shared operational alert/exception capability. Example signals include:

- BAST/operational milestone delays;
- SLA/client issue;
- timesheet issue;
- contract expiry;
- project deadline;
- other states requiring attention or escalation.

Detection remains deterministic/rule/event-based where the condition is objective; AI enriches context, impact, explanation, and follow-up drafts.

### Human Services

Can include employee/talent chatbot, confirmation flows, reminders, service questions, and human case routing for HR/Talent/Finance-related support.

### Management Intelligence

Management Intelligence should explain **what changed, why it matters, what is causing it, who owns it, and what action needs attention**, not merely provide another dashboard.

## 5. Closed-loop behaviour

The platform must not stop at “AI generated an answer”.

A healthy loop is:

`ERP state -> intelligence -> structured output/action -> human or controlled automation -> ERP state update -> next intelligence cycle`.

Examples:

- Pre-Sales approves a solution outline -> opportunity status/artifact reference updates in ERP.
- BAST exception is resolved -> exception closes because ERP state changes.
- Human Service case is answered -> case/outcome is recorded and can improve knowledge curation.

## 6. Deterministic vs generative boundary

### Deterministic / trusted source

- status and dates;
- counts and business metrics;
- employee/talent availability;
- project allocation;
- pricing/rate/margin inputs;
- contract/BAST/invoice state;
- SLA/deadline checks;
- explicit business rules.

### AI-assisted

- summarize documents;
- identify requirement themes;
- retrieve and explain relevant prior experience;
- surface ambiguity/missing information;
- explain why an exception matters using trusted facts;
- draft solution narrative;
- prepare response/action drafts;
- synthesize management context.

AI may explain and prepare; it must not fabricate authoritative facts.

## 7. Strategic positioning

The differentiator is not “Celerates has GPT”. The reusable capability is the combination of:

- ERP business context;
- curated organizational knowledge;
- retrieval and data provenance;
- domain rules;
- controlled ERP tools;
- workflow orchestration;
- model routing;
- human decision points;
- application-specific outputs.

This enables Celerates to prove the capability internally first and later productize reusable patterns for client digitalization/intelligence engagements.

## 8. Infrastructure is a sizing decision, not a brand decision

The permanent hosting provider is not yet locked by architecture. Current/proposed providers can be used for POC or transition, but the next production choice should be based on measured requirements for:

- ERP web/backend;
- PostgreSQL;
- Intelligence API/worker;
- object storage;
- optional Redis;
- Model Gateway;
- tracing/evaluation;
- optional n8n;
- user count and workload pattern.

Provider selection should follow workload sizing and operational requirements rather than drive the architecture itself.
