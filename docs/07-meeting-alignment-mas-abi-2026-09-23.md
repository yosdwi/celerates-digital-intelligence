# Meeting Alignment — Mas Abi — 2026-09-23

> Source: discussion transcript from the 2026-09-23 meeting. The available transcript ends at approximately minute 30, so this document only records decisions and direction supported by the available portion.

## Why this document exists

This meeting materially clarified the transformation sequence, ERP role, delivery model, and team operating model. The technical architecture remains valid, but the implementation priority is now more explicit: **ERP maturity is the dependency for the wider intelligence roadmap**.

## 1. Confirmed architecture direction

The discussion aligned with the architecture already defined in this repository:

```text
Current / Transitional Sources
Google Sheets • Excel • Jira • Databases • Documents • Forms / APIs
        ↓
controlled intake / migration
        ↓
CELERATES ERP
Digital Operational Core
        ↓
CELERATES INTELLIGENCE LAYER
Context & Knowledge • Intelligence Core • Model Gateway
        ↓
CELERATES INTELLIGENCE APPLICATIONS
Pre-Sales • Exception Management • Human Services • Management Intelligence
        ↓
Human / controlled action
        ↓
ERP state update
```

The key clarification is that raw sources are not the permanent end-state operating model. Many current sources — especially Google Sheets — are **transitional**. The target is for users to work primarily in ERP once the relevant workflows are mature.

## 2. ERP is the critical foundation

The ERP was originally built as a base case to make the organization start using a digital workflow. User feedback is now exposing real service-specific requirements and process differences.

Target direction:

- ERP becomes the canonical operational workspace and source of truth.
- Current siloed Google Sheets / spreadsheets are migrated or retired progressively.
- Users should eventually stop operating daily processes from scattered sheets where ERP has taken ownership of that workflow.
- ERP needs to mature before the broader intelligence layer can depend on its data contracts confidently.
- Intelligence should extend ERP, not bypass or replace it.

### Consequence for architecture

`Raw Sources -> ERP -> Intelligence` must be read as a **transformation path**, not as a promise that all raw-source connectors remain permanent forever.

## 3. User-review loop becomes part of the product strategy

A major near-term requirement is to put ERP in an accessible production-like environment so real users can test it directly.

Expected loop:

```text
ERP available to users
      ↓
User tries real workflow
      ↓
Business Analyst captures delta requirement
      ↓
Tech Lead validates architecture / priority
      ↓
Web developer implements
      ↓
Release
      ↓
User reviews again
```

The intent is incremental delivery based on actual usage rather than long requirement meetings based mainly on assumptions.

Existing ERP is not expected to be rebuilt from zero. The meeting expectation is that significant parts can be retained and improved based on requirement deltas.

## 4. Intelligence application domains remain valid

### Pre-Sales Intelligence

Confirmed direction:

- brief / opportunity context;
- requirements;
- relevant experience;
- risk and assumptions;
- solution;
- scope;
- BOQ / effort;
- proposal;
- supporting source/evidence.

The existing Pre-Sales Intelligence Pack direction remains valid and should improve further once more Celerates knowledge and ERP context are available.

### Exception Management

Treat this as the shared operational **alert / exception capability**, for example:

- BAST / related operational milestone delay;
- SLA/client issue;
- timesheet issue;
- contract expiry;
- project deadline;
- other operational states that require attention/escalation.

The detection should remain rule/event-driven where the condition is deterministic. AI may enrich context, explain impact, summarize, or prepare follow-up.

### Human Services

Can include:

- employee/talent chatbot;
- confirmation flows;
- reminders;
- HR/Talent/Finance service interactions;
- escalation to a human case where required.

### Management Intelligence

Management needs a point of view above operational modules — not only dashboards, but answers to questions such as:

- what changed?
- why did it change?
- what is causing the decline?
- what operational issue is affecting cash flow or delivery?
- who owns the next action?

This reinforces the Executive Action Brief direction already defined in the repository.

## 5. Closed loop to ERP is confirmed

Human review and controlled action must return the outcome to ERP.

```text
ERP state
   ↓
Intelligence
   ↓
Recommendation / artifact / alert
   ↓
Human review or controlled automation
   ↓
ERP state updated
```

The intelligence platform is incomplete if it produces an answer but does not update or resolve the operational workflow.

## 6. Revised delivery priority

The architecture remains the same, but the practical roadmap becomes:

### Phase A — Cloud / delivery foundation

- decide and size a proper hosting environment;
- make ERP accessible to users outside local development;
- use a proper domain / reverse proxy / Cloudflare where appropriate;
- avoid locking the roadmap to the current slow or unsuitable hosting setup.

### Phase B — ERP hardening through real user review

- deploy the existing ERP baseline;
- let users test actual workflows;
- collect service-specific delta requirements;
- improve forms, workflow, approval, data model, UX, and audit;
- progressively replace operational spreadsheets with ERP workflow.

### Phase C — Source consolidation / migration

- migrate current siloed sheet/data sources where ERP takes ownership;
- define cut-over per business process;
- keep temporary parallel operation only where needed for safe transition;
- preserve provenance and reconciliation for migration/import flows.

### Phase D — Intelligence foundation

- ERP read/event/action adapter;
- Context & Knowledge;
- PostgreSQL + pgvector + FTS;
- document/object knowledge;
- Intelligence Core / LangGraph;
- LiteLLM Model Gateway;
- Langfuse tracing/evaluation;
- deterministic rules and exception engine.

### Phase E — Intelligence applications

- Pre-Sales Intelligence;
- Exception Management;
- Human Services;
- Management Intelligence.

## 7. Parallel work is allowed

The phases above are dependencies, not a rigid waterfall.

Parallel implementation is reasonable when a contract is stable enough. Examples:

- ERP hardening can be handled by the web developer while the Tech Lead defines ERP adapter contracts and Intelligence Layer foundations.
- Human Service/chatbot experiments can proceed if they depend on stable identity/context or an isolated existing data source.
- Pre-Sales intelligence can continue as a functional vertical slice while real ERP integration is introduced behind the adapter boundary.

Rule:

> **ERP is the dependency, but delivery can be parallel where contracts and source-of-truth boundaries are already clear.**

## 8. Team operating model clarified

Expected operating model from the discussion:

### Tech Lead / Intelligence Architecture

- architecture and roadmap;
- technology decisions;
- integration contracts;
- review implementation quality;
- lead Intelligence Layer / AI workflow direction;
- hands-on coding where it adds leverage, but not required for every feature.

### Business Analyst

- work directly with users;
- capture service-specific workflow and form requirements;
- record requirement deltas from the ERP baseline;
- help acceptance/review after changes are released.

### Web Developer

- ERP UI/workflow implementation;
- bug fixing and incremental product improvement;
- execute against reviewed requirements and architecture boundaries.

### Supporting developers / interns

- implementation tasks under clear contracts and review;
- can use shared AI development tooling where appropriate.

## 9. Infrastructure decisions still open

The meeting discussed limitations of the current hosting setup and possible alternatives, but **did not lock a final provider**.

Do not treat OVH, Hostinger, Supabase, Vercel, or Railway as the permanent architecture decision purely because they were discussed.

Next infrastructure decision should be based on sizing for at least:

- ERP web/backend;
- PostgreSQL;
- Intelligence API / workers;
- object storage;
- optional Redis;
- Model Gateway;
- tracing/evaluation;
- optional n8n;
- expected number of users and workload pattern.

## 10. Legacy / no-code simplification direction

The discussion raised concern that existing no-code database tooling consumes resources and constrains the application to the tool's own data/query patterns.

Direction:

- progressively reduce unnecessary no-code runtime dependency;
- move core ERP workflows toward owned/custom web development where justified;
- preserve data and migration safety during transition;
- do not rewrite purely for technology preference — prioritize user value and operational stability.

## 11. What changes in existing repository documents

This meeting requires the following interpretation across the repository:

1. `Raw Sources` means **current/transitional business inputs**, not the permanent operational UX.
2. ERP is the **critical digital foundation and primary near-term workstream**.
3. Real user review is part of the ERP maturity strategy.
4. Data migration/cut-over from Google Sheets and other siloed sources is explicit work.
5. Intelligence development continues behind ERP adapter contracts and can partially run in parallel.
6. The four Intelligence Application domains remain valid.
7. Cloud/provider choice remains an open infrastructure sizing decision.

## 12. New diagrams introduced from this meeting

See:

- `docs/architecture/12-current-transition-target.mmd`
- existing master/technology/application diagrams for the stable target architecture.

The new diagram explains **how Celerates gets there**, while the master architecture explains **what the target system is**.
