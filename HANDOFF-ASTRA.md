# GPT Astra Work Handoff — Celerates Digital Intelligence

## Mission

Turn this repository from an architecture baseline into a **functional, showable product foundation**. The result must be useful for two parallel presentations:

1. **Architecture / diagrams** — a clean explanation of how Celerates moves from current/transitional raw sources to ERP, intelligence, and business applications.
2. **Working product** — a polished web application that demonstrates the architecture through real user flows, especially Pre-Sales Intelligence.

Do not build a static prototype that only looks good. Build a production-shaped scaffold with real API boundaries, persistent data, seeded demo data, deterministic fallback behaviour, and clear extension points for the existing Celerates ERP and real LLM providers.

## Stakeholder alignment update — 2026-09-23

The stakeholder discussion with Mas Abi clarified the delivery sequence without invalidating the architecture.

Key interpretation:

- current Google Sheets / Excel / siloed sources are **transitional operational inputs**, not the permanent target working surface;
- Celerates ERP is the **critical Digital Operational Core** and the near-term product foundation;
- the ERP should mature through direct user access, real workflow testing, BA requirement-delta capture, incremental implementation, and repeated review;
- migration/cut-over from Google Sheets and other siloed sources must become explicit work;
- Intelligence can continue in parallel when ERP contracts/source-of-truth boundaries are stable enough;
- the four Intelligence Application domains remain valid: Pre-Sales, Exception Management, Human Services, Management Intelligence;
- final cloud/provider choice is still an infrastructure sizing decision, not a locked architecture brand choice.

Read `docs/07-meeting-alignment-mas-abi-2026-09-23.md` and `docs/architecture/12-current-transition-target.mmd` before changing roadmap assumptions.

## Read order before coding

1. `README.md`
2. `docs/07-meeting-alignment-mas-abi-2026-09-23.md`
3. `docs/01-product-and-architecture.md`
4. `docs/02-technology-stack.md`
5. `docs/06-intelligence-stack-explained.md`
6. `docs/03-product-ux-spec.md`
7. `docs/04-functional-demo-scope.md`
8. `docs/05-execution-plan.md`
9. `docs/workflows/presales.md`
10. `docs/workflows/exception-management.md`
11. `docs/workflows/human-services.md`
12. `docs/workflows/management-intelligence.md`
13. all files under `docs/architecture/`
14. all ADRs under `docs/adr/`

## Locked architecture

Do not silently replace these decisions during scaffolding.

- Current/transitional sources: Google Sheets, Excel/CSV, Jira/API, existing databases, documents, forms/manual input.
- Target operating direction: when a business process has matured in ERP, ERP becomes the primary working surface and legacy sheet-based operation is progressively cut over rather than preserved indefinitely.
- Primary integration mechanism: **Python Integration Core**.
- Supporting low-code integration: **n8n self-hosted**, optional profile. Critical domain logic must remain in code, tests, and Git.
- No Airbyte in v0.
- Existing Celerates ERP remains **Digital Operational Core** and canonical operational source of truth.
- ERP maturity must be driven by direct user review and service-specific requirement deltas rather than architecture assumptions alone.
- Intelligence storage: **PostgreSQL + pgvector + PostgreSQL full-text search**.
- Binary/object documents: **MinIO / S3-compatible storage**.
- Document parsing: **Docling** baseline.
- Intelligence API: **Python + FastAPI**.
- Stateful workflows / human-in-the-loop: **LangGraph**.
- Model Gateway: **LiteLLM** with OpenAI, Anthropic, Gemini, and open-source/local providers behind one abstraction.
- Cache / transient state: Redis only where it adds value.
- AI tracing/evaluation: Langfuse integration boundary; make it optional when credentials/service are unavailable.
- Web: **React + TypeScript + Vite + Tailwind CSS + shadcn/ui-style component system**. Use a clean component architecture and accessible responsive design.
- The app must run in **demo mode without external AI credentials**. Real providers become active through environment configuration.
- Permanent hosting provider is **not yet locked**. Railway may continue as P0/demo deployment, but future ERP/intelligence production infrastructure must be sized against actual workload before provider lock-in.

## Delivery principle

Do not interpret the stakeholder direction as a rigid waterfall.

Preferred rule:

> **ERP is the dependency, but delivery can run in parallel where contracts and source-of-truth boundaries are stable.**

Examples:

- ERP UI/workflow hardening can proceed with the web developer while Intelligence adapters and runtime boundaries are developed.
- Pre-Sales can remain a working vertical slice against the demo ERP adapter while real ERP read/event/action contracts mature.
- Human Service/chatbot work can proceed where identity/context is stable enough.
- Do not let Intelligence own or fabricate authoritative facts that belong to ERP.

## Suggested repository shape

```text
apps/
  web/                         # React application
services/
  intelligence-api/            # FastAPI + LangGraph
  integration-worker/          # Python source adapters / ingestion
packages/
  contracts/                   # shared API schemas / generated types if useful
infra/
  docker-compose.yml
  litellm/
  n8n/
  postgres/
docs/
  architecture/
  workflows/
  adr/
scripts/
```

You may refine this structure if there is a concrete reason, but preserve the boundaries.

## Functional target for the first execution

### P0 — Must be demonstrable

Build a coherent web application with:

- Public/product overview at `/` explaining the Celerates Digital Intelligence story.
- Application shell with navigation and responsive layout.
- `/app/presales` — flagship Pre-Sales Intelligence workspace.
- `/app/exceptions` — Exception Action Center with meaningful seeded cases.
- `/app/human-service` — Human Service inbox/case flow.
- `/app/management` — Management Intelligence / Executive Action Brief.
- `/app/sources` — source/integration visibility and ingestion status.
- `/app/system` — architecture/system status, model gateway status, and data-source health.

### Pre-Sales must be genuinely functional

A user should be able to:

1. View seeded opportunities.
2. Create a new opportunity.
3. Attach or register a TOR/RFP/document.
4. Start an analysis workflow.
5. Observe workflow progress / status.
6. Open structured artifacts rather than a single AI paragraph.
7. Edit/review/approve outputs.
8. Mark clarification required or ready for Sales.
9. See the resulting opportunity status update.

The output is a **Pre-Sales Intelligence Pack** consisting of:

- Opportunity Brief
- Requirement Matrix
- Clarification List
- Relevant Experience
- Capability & Capacity Fit
- Risk & Assumption Register
- Solution Outline
- Scope Draft
- BOQ / Effort Draft
- Proposal Draft
- Next Actions

In demo mode, generate credible deterministic artifacts from seeded data. When a model provider is configured, run the same workflow through the Model Gateway without changing the web contract.

## Intelligence Application interpretation

### Pre-Sales Intelligence

Structured opportunity-to-proposal intelligence with requirements, experience, fit, risk, solution, scope, BOQ/effort, proposal, evidence and next actions.

### Exception Management

Treat this as the shared operational alert/exception capability, including examples such as BAST/operational milestones, SLA/client issues, timesheet issues, contract expiry, project deadlines, and other states requiring attention. Deterministic conditions remain rule/event-driven; AI enriches context and follow-up.

### Human Services

Employee/talent chatbot, confirmations, reminders, and HR/Talent/Finance service interactions with human escalation/case handling when required.

### Management Intelligence

A management point of view that explains what changed, why, impact, ownership, and the action that needs attention — not merely a second KPI dashboard.

## Data rules

- ERP facts are authoritative. Do not let the LLM invent employee availability, pricing, rates, project status, contract dates, BAST state, invoice state, or business metrics.
- Vector search is for retrieval, not a replacement for relational business queries.
- Keep source provenance for generated/derived outputs.
- Any artifact based on documents should retain source/document references.
- Human approval is explicit for business-critical outputs.
- Approved workflow outcomes should update local ERP-adapter state in demo mode; design the adapter so the real ERP can replace it later.

## ERP integration contract

Implement an adapter boundary rather than coupling Intelligence code to the ERP database directly.

The boundary should conceptually support:

- **Read**: opportunity, customer, employee/talent, skills, project, allocation, contract, BAST, invoice, timesheet, capability/capacity.
- **Event**: opportunity created/updated, approval changed, BAST pending, contract expiring, workflow state changed.
- **Action**: create/update task, create case, update status, persist approved artifact reference, acknowledge reminder.

Provide a demo/local adapter now and an HTTP adapter interface/configuration for the real ERP later.

## ERP user-review and migration workstream

The intelligence repository does not own the ERP product backlog, but implementation must account for the confirmed operating model:

```text
ERP deployed for users
   ↓
Users test real workflow
   ↓
BA captures requirement delta
   ↓
Tech Lead reviews boundary / priority
   ↓
Web developer implements
   ↓
Release and repeat
```

For current Google Sheets / Excel / siloed data:

- inventory each operational source;
- decide whether ERP owns the process or the source remains external;
- map/import/reconcile data where ERP takes ownership;
- run in parallel only where cut-over safety requires it;
- progressively retire duplicate sheet-based operational workflow after successful cut-over.

## Integration Core

Build source adapters behind a common Python interface. Initial adapters:

- CSV / Excel
- Generic REST API
- PostgreSQL
- SQL Server interface placeholder
- Jira REST interface placeholder
- Document upload / object storage

A connector should conceptually cover discover/extract/normalize/validate/load and preserve ingestion audit/provenance.

n8n is a supporting workflow surface for triggers/connectors such as form submission, incoming email, simple SaaS integrations, and notification fan-out. Domain validation and critical transformations belong in Python.

## UI/UX direction

Reference: `https://bmsservices.id/en/services` and the BMS AI/Automation service page.

Do **not** clone BMS. Borrow the qualities:

- strong hierarchy and large confident headings;
- concise explanatory copy;
- generous whitespace;
- clean light surfaces and rounded cards;
- strong metric/status callouts;
- clear “problem → capability → use case → process → technology → outcome” storytelling;
- polished technology chips / capability labels;
- obvious next actions and CTAs;
- responsive, presentation-friendly sections.

Translate this into a serious internal enterprise product. Avoid generic purple-gradient “AI dashboard” clichés, excessive glassmorphism, neon, decorative robots/brains, and empty chatbot-first home screens.

The app home should explain value and show work/status. Chat/copilot is contextual, not the entire product.

## UI information architecture

Primary navigation:

- Overview
- Pre-Sales
- Exceptions
- Human Service
- Management
- Sources & Integrations
- System

Reusable patterns:

- compact KPI strip;
- work/action queue;
- artifact cards;
- source/provenance indicators;
- confidence/state badges where meaningful;
- timeline / workflow state;
- split detail layout with contextual copilot drawer;
- notification center;
- responsive tables/cards;
- human review/approval controls.

## Architecture diagrams

Mermaid under `docs/architecture/` is canonical. Do not make Figma the source of truth. Generated SVG under `docs/architecture/rendered/` is the presentation artifact.

Two architecture stories are intentionally separate:

1. **Target architecture** — master/technology/intelligence/application diagrams.
2. **Transformation path** — `12-current-transition-target.mmd`, showing current fragmented sources -> ERP maturity/user review -> target intelligence architecture.

## Definition of “showable”

The first implementation is successful when someone unfamiliar with this discussion can:

1. open the repository and understand both the target architecture and transformation path;
2. run the stack with documented commands;
3. open the web UI and immediately understand the product;
4. complete the Pre-Sales demo flow without any external credentials;
5. see how real ERP and model providers plug in later;
6. inspect architecture diagrams matching the implemented boundaries;
7. understand that the current raw/sheet landscape is transitional and ERP is the target operational core.

## Engineering expectations

- `.env.example`, never commit secrets.
- Docker Compose development path.
- database migrations and seed command.
- typed API schemas.
- health/readiness endpoints.
- minimal unit/integration tests for critical paths.
- deterministic demo mode.
- sensible error/empty/loading states.
- no fake buttons in the primary demo flow.
- README must end with exact local-run and demo walkthrough instructions.

## Do not overbuild v0

Do not add Kubernetes, Airbyte, Kafka, separate vector DB, multi-region infrastructure, or complex microservice choreography unless a concrete blocker requires them. Keep the first implementation operable on one development machine while preserving clean boundaries for later scale.
