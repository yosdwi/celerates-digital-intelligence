# Product & Architecture Definition

## 1. Problem statement

Celerates already has an ERP and existing digital workflows. The next problem is not “build an ERP” and not “add a chatbot”. The problem is to make Celerates operational data and institutional knowledge usable as a reliable intelligence capability across Sales/Pre-Sales, operations, talent/people service, and management.

Today business information can originate from Excel/CSV, Jira, databases, documents, forms, APIs, and manual operational processes. The ERP remains the place where canonical business state is managed. Intelligence should consume trusted ERP context plus curated knowledge, use models safely, and return useful work products and actions back into business workflows.

## 2. Canonical model

### Raw Sources

Business and operational input can originate from:

- Excel / CSV
- Jira / external APIs
- PostgreSQL / SQL Server / legacy databases
- TOR, RFP, proposal, contract, BAST, CV, policy and other documents
- Forms
- Manual input

Raw Sources are not themselves the source of truth. They enter through controlled ingestion and validation.

### Celerates Data Intake

This is a capability between Raw Sources and ERP, not a separate business platform.

Responsibilities:

- connect/extract source data;
- normalize data into known contracts;
- validate deterministic fields/rules;
- reconcile conflicts/duplicates;
- preserve source provenance and ingestion audit;
- route rejected/conflicting records for review;
- commit approved operational state to ERP.

Primary implementation is Python Integration Core. n8n is a supporting low-code integration/automation surface.

### Celerates ERP — Digital Operational Core

The existing ERP remains the canonical operational source of truth.

Typical responsibility:

- business/master data;
- customer and opportunity state;
- employee/talent/capability data;
- project and allocation state;
- workflows and approvals;
- contracts, timesheet, BAST, invoice and finance-related operational state;
- identity/RBAC/audit within the ERP domain.

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

## 3. Closed-loop behaviour

The platform must not stop at “AI generated an answer”.

A healthy loop is:

`ERP state -> intelligence -> structured output/action -> human or controlled automation -> ERP state update -> next intelligence cycle`.

Examples:

- Pre-Sales approves a solution outline -> opportunity status/artifact reference updates in ERP.
- BAST exception is resolved -> exception closes because ERP state changes.
- Human Service case is answered -> case/outcome is recorded and can improve knowledge curation.

## 4. Deterministic vs generative boundary

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

## 5. Strategic positioning

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
