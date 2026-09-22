# GPT Astra Work Handoff — Celerates Digital Intelligence

## Mission

Turn this repository from an architecture baseline into a **functional, showable product foundation**. The result must be useful for two parallel presentations:

1. **Architecture / diagrams** — a clean explanation of how Celerates moves from raw sources to ERP, intelligence, and business applications.
2. **Working product** — a polished web application that demonstrates the architecture through real user flows, especially Pre-Sales Intelligence.

Do not build a static prototype that only looks good. Build a production-shaped scaffold with real API boundaries, persistent data, seeded demo data, deterministic fallback behaviour, and clear extension points for the existing Celerates ERP and real LLM providers.

## Read order before coding

1. `README.md`
2. `docs/01-product-and-architecture.md`
3. `docs/02-technology-stack.md`
4. `docs/03-product-ux-spec.md`
5. `docs/04-functional-demo-scope.md`
6. `docs/workflows/presales.md`
7. `docs/workflows/exception-management.md`
8. `docs/workflows/human-services.md`
9. `docs/workflows/management-intelligence.md`
10. all files under `docs/architecture/`
11. all ADRs under `docs/adr/`

## Locked architecture

Do not silently replace these decisions during scaffolding.

- Raw sources: Excel/CSV, Jira/API, existing databases, documents, forms/manual input.
- Primary integration mechanism: **Python Integration Core**.
- Supporting low-code integration: **n8n self-hosted**, optional profile. Critical domain logic must remain in code, tests, and Git.
- No Airbyte in v0.
- Existing Celerates ERP remains **Digital Operational Core** and canonical operational source of truth.
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

Mermaid under `docs/architecture/` is canonical. Do not make Figma the source of truth. If exporting diagrams for presentation, commit generated SVG/PNG only under an `exports/` folder and keep `.mmd` authoritative.

## Definition of “showable”

The first implementation is successful when someone unfamiliar with this discussion can:

1. open the repository and understand the architecture;
2. run the stack with documented commands;
3. open the web UI and immediately understand the product;
4. complete the Pre-Sales demo flow without any external credentials;
5. see how real ERP and model providers plug in later;
6. inspect architecture diagrams matching the implemented boundaries.

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
