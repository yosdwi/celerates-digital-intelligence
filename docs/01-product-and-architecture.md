# Product & Architecture Definition

## 1. Problem statement

Celerates already has a broad ERP baseline and several existing operational systems. The next problem is not “build another ERP”, “replace every existing SaaS”, or “add a chatbot”. The problem is to mature Celerates into a reliable **Digital Operational Core**: connected cross-division workflows, clear data ownership, low-friction user experience, and trusted operational state that can later support Intelligence.

Business information can still originate from Excel/CSV, Jira, databases, documents, forms, Google Sheets, ConForm/PAMA integrations, Mekari Talenta and other specialist systems. These sources do not all have the same target treatment. Some are transitional and should be migrated or retired; some specialist capabilities may remain external when they are already mature and economically sensible.

The target therefore is **capability-driven**, not vendor-replacement-driven.

> **Apps adapt to user workflow, not the opposite.**

> **Configuration before customization.**

> **ERP maturity and trusted operational data come before Intelligence becomes the centre of value.**

## 2. Product and operating principles

### 2.1 Business capability architecture is not the sidebar

Logical ownership is organized by business capability/domain, while navigation is organized around the user's job.

A useful domain view is:

- **Commercial** — Marketing, Sales, Opportunity, Pre-Sales;
- **People / HRIS** — Recruitment, Onboarding, Employee, Talent, Attendance, Leave, Roster, Compensation, Learning;
- **Project Operations** — Project, Allocation, Task, Timesheet, Evidence, BAST;
- **Finance** — Billing, Invoice, Payroll-facing handoff, Payment, Closing;
- **Corporate Services** — Approval, Document, E-signature, Notification, Audit.

A role-based workspace may combine several of those domains. Talent self-service can show Attendance, Timesheet, Tasks and HR services without requiring the user to understand which backend domain or provider owns each capability.

Navigation changes are therefore validated by user workflow and pilot evidence; architecture changes do not automatically require a wholesale sidebar redesign.

### 2.2 Reusable interaction system

Celerates should converge on a consistent ERP interaction grammar:

`Workspace · List · Table · Kanban · Form · Record Detail · Search · Filter · Saved View · Status · Workflow · Approval · Quick/Bulk Action · History`.

Use configuration and reusable patterns before one-off custom screens:

1. **User preference** — saved filters/views, visible columns, sort and dashboard preference.
2. **Admin/business configuration** — required/visible fields, workflow/approval route, reference/master data.
3. **Product development** — new business process, complex domain rule, integration or genuinely new interaction.

This is not a requirement to build a generic no-code platform first. It is a guardrail against turning every user request into bespoke code.

### 2.3 Capability-driven system ownership

For every overlapping capability, choose one explicit direction:

- **retain** — the existing specialist system remains the authority;
- **integrate** — the capability stays external but Celerates consumes or links it through a governed contract;
- **migrate** — authority moves to Celerates after reconciliation and cut-over;
- **rebuild** — Celerates implements a business-specific capability because existing options do not fit;
- **retire** — the old surface/source is removed after replacement is proven.

At every transition stage, each operational datum/process must have one write-owner. Avoid uncontrolled bidirectional synchronization.

Mekari Talenta is therefore not assumed to be removed as an initial objective. Mature commodity HR capabilities such as payroll, roster or payslip may remain external while Celerates focuses engineering effort on differentiating cross-division workflows. The same rule applies to other external systems: keep or migrate them based on business value, control, cost and operational risk.

### 2.4 ERP maturity criteria

A workflow is not mature merely because a screen exists.

It must satisfy:

1. **Flow** — the end-to-end business journey works.
2. **Data** — required data is complete, reconciled and trusted.
3. **Experience** — the workflow is easy enough that users do not fall back to spreadsheets/manual work.
4. **Control** — authorization, approval, audit and security are explicit.
5. **Adoption** — real users actually execute the workflow.

The dependency is intentional:

`Good UX → User Adoption → Good Data Capture → Trusted Data → Mature Workflow → ERP Source of Truth → Intelligence`.

## 3. Transformation storyline

The target architecture and the migration path are related but should not be confused.

```text
CURRENT
Existing ERP + specialist systems + fragmented operational sources
Mekari Talenta · ConForm/PAMA · Google Sheets/Excel · Jira · DB · Documents · Manual
        ↓
TRANSITION
Capability ownership decision
retain / integrate / migrate / rebuild / retire
        ↓
ERP user pilot + workflow hardening + adapters + reconciliation + selective cut-over
        ↓
TARGET
Celerates role-based operational experience
        ↓
Celerates ERP — Digital Operational Core for owned capabilities
+ governed retained specialist systems
        ↓
Trusted operational state
        ↓
Celerates Intelligence Layer
```

Key rules:

> **Mature divisional workflows first; do not make full HRIS replacement a prerequisite for ERP value.**

> **ERP is the critical dependency for owned workflows, but delivery can run in parallel where system ownership and contracts are stable.**

See `docs/05-execution-plan.md`, `docs/architecture/12-current-transition-target.mmd`, and [`ADR-020`](adr/ADR-020-capability-driven-migration-and-vps-target.md) for the execution and system-boundary decisions.

## 4. Canonical operating model

### Current / retained / transitional sources

Operational input may originate from:

- Google Sheets / Excel / CSV;
- Jira / external APIs;
- PostgreSQL / SQL Server / legacy databases;
- TOR, RFP, proposal, contract, BAST, CV, policy and other documents;
- forms and manual entry;
- ConForm/PAMA operational integrations during transition;
- Mekari Talenta or another specialist system for deliberately retained HR capabilities.

These sources do not automatically become permanent peers of ERP, and they do not feed Intelligence around ERP controls. Their authority is explicit per capability.

### Celerates Data Intake & Provider Integration

This is a capability between source/provider systems and the ERP/domain layer, not a separate business platform.

Responsibilities:

- connect/extract source data;
- normalize data into known contracts;
- validate deterministic fields/rules;
- reconcile conflicts/duplicates;
- preserve source provenance and ingestion audit;
- route rejected/conflicting records for review;
- support migration/cut-over from transitional sources;
- support governed reads from retained specialist systems;
- commit approved operational state only to the designated write-owner.

Primary critical integration logic remains testable code in Git. n8n is a supporting low-code connector/automation surface where appropriate.

UI and business-domain code should depend on stable domain/provider contracts rather than directly on Google Sheet, ConForm, Talenta or another provider schema.

### Celerates ERP — Digital Operational Core

The existing ERP remains the critical near-term product foundation.

It owns canonical state for the workflows and capabilities that have been validated and cut over, including business/master data, customer/opportunity state, employee/talent/project context, workflows/approvals, project delivery, documents/evidence and finance-related operational state as those domains mature.

The ERP should not be rebuilt from zero unless a concrete blocker demands it. Improve the existing baseline incrementally and let actual user usage expose service-specific requirements.

#### ERP maturity loop

```text
ERP available to selected users
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

The Intelligence layer integrates through controlled APIs/read models/events/actions rather than arbitrary direct ERP database writes.

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

## 5. Intelligence application intent

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

## 6. Closed-loop behaviour

The platform must not stop at “AI generated an answer”.

A healthy loop is:

`ERP state -> intelligence -> structured output/action -> human or controlled automation -> ERP state update -> next intelligence cycle`.

Examples:

- Pre-Sales approves a solution outline -> opportunity status/artifact reference updates in ERP.
- BAST exception is resolved -> exception closes because ERP state changes.
- Human Service case is answered -> case/outcome is recorded and can improve knowledge curation.

## 7. Deterministic vs generative boundary

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

## 8. Strategic positioning

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

## 9. Infrastructure is portable and sized from evidence

The current production baseline is the approved Hostinger VPS target described in ADR-020, initially using the KVM 4 class. This is a deployment decision, not an application coupling.

The stack remains Docker-based and portable. Initial components may share one VPS:

- ERP web/runtime;
- PostgreSQL;
- Intelligence API/worker;
- private object storage;
- self-hosted observability;
- optional Redis/n8n only when useful;
- Model Gateway boundary.

Scale-up or component separation should follow measured CPU, RAM, storage, concurrency, retention, reliability and recovery requirements. Cost figures and renewal assumptions are maintained in the management spreadsheet, not duplicated in architecture docs.
