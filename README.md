# Celerates Digital Intelligence

Celerates Digital Intelligence is the architecture and implementation baseline for adding an intelligence layer on top of the existing Celerates ERP.

The goal is not to replace the ERP and not to build a generic chatbot. The ERP remains the **Digital Operational Core** and source of truth. The intelligence layer adds context, knowledge retrieval, reasoning, model routing, workflow orchestration, and business-facing intelligence applications.

## Canonical storyline

```text
Raw Sources
  -> Celerates Data Intake
  -> Celerates ERP (Digital Operational Core)
  -> Celerates Intelligence Layer
       - Context & Knowledge
       - Intelligence Core
       - Model Gateway
  -> Celerates Intelligence Applications
       - Pre-Sales
       - Exception Management
       - Human Services
       - Management Intelligence
  -> Human / controlled workflow action
  -> ERP status and outcome feedback
```

## Locked baseline decisions

- **Raw source intake:** Python Integration Core as the primary implementation; n8n is a supporting low-code automation/connector surface, not the home of critical business logic.
- **No Airbyte for the first implementation.** Add it only when database replication/CDC volume justifies it.
- **ERP:** keep the existing Celerates ERP as the canonical operational source of truth.
- **Intelligence data:** PostgreSQL + pgvector + PostgreSQL full-text search; object/document files in MinIO/S3-compatible storage.
- **Document parsing:** Docling baseline.
- **Intelligence API:** Python + FastAPI.
- **Stateful AI workflow:** LangGraph.
- **Model Gateway:** LiteLLM, with OpenAI / Anthropic / Gemini / open-source providers behind one abstraction.
- **Cache / short-lived state:** Redis where justified.
- **Observability and evaluation:** Langfuse baseline.
- **Applications are business capabilities, not separate chatbots.** Web workspace, copilot, in-app notification, WhatsApp, generated documents, and background automation are delivery surfaces.
- **Deterministic facts stay deterministic.** Metrics, deadlines, status, pricing/rate, availability, and business-rule checks must come from trusted systems/rules, not LLM generation.
- **Human review stays explicit** for business-critical outputs and external communication.
- **Closed loop:** approved actions and outcomes are written back to ERP.

## Start here for implementation

**GPT Astra / implementation agent:** read [`HANDOFF-ASTRA.md`](./HANDOFF-ASTRA.md) first, then all architecture and product documents under `docs/` before writing code.

## Primary deliverables

This repository is intended to produce two things that can be shown independently:

1. **Clean architecture diagrams and decision documents** explaining the Celerates Digital Intelligence concept.
2. **A functional showcase application** with production-shaped structure, full UI/UX, seeded demo data, and real integration boundaries so it can evolve into a working product rather than a static mockup.

## Visual reference

The public service pages at `bmsservices.id/en/services` are a **design and storytelling reference**, not a pixel-copy target. Preserve the qualities that make them effective: strong hierarchy, concise section copy, generous whitespace, clear cards, prominent use cases, process steps, technology visibility, measurable outcomes, and direct CTA/action language. Translate that visual language into a professional internal intelligence application.

## Functional P0 — Issue #1

The repository now contains a working React + FastAPI application. The flagship workflow persists opportunities through a demo ERP adapter, stores source documents, runs a durable LangGraph analysis, produces all 11 Pre-Sales artifacts, supports versioned edits and explicit human review, and writes approved/clarification outcomes back through the ERP action boundary.

| Route | Working surface |
|---|---|
| `/` | Product overview and intelligence storyline |
| `/app` | Attention queue and executive preview |
| `/app/presales` | Create, upload/register, analyze, edit, review, approve, ERP outcome |
| `/app/exceptions` | Seeded exception cases with trigger facts and evidence detail |
| `/app/human-service` | Seeded inbox, policy evidence and PIC context packs |
| `/app/management` | Deterministic KPIs and executive action briefs with drill-down |
| `/app/sources` | Connector readiness and persisted ingestion audit |
| `/app/system` | ERP/model/storage/workflow boundaries and configuration state |

Demo records are synthetic. Supporting operational surfaces are seeded read models; external reminders/messages and production case mutations are not enabled. P0 is a functional foundation, with a shared demo reviewer or workspace bearer token; it is not a production SSO/RBAC release.

Implementation detail: [`docs/implementation/README.md`](docs/implementation/README.md). Verification evidence: [`docs/implementation/VERIFICATION.md`](docs/implementation/VERIFICATION.md). ERP contract: [`packages/contracts/erp-http.md`](packages/contracts/erp-http.md). API schema: [`packages/contracts/openapi.json`](packages/contracts/openapi.json). Concrete runtime/lifecycle diagrams: [`09-p0-runtime.mmd`](docs/architecture/09-p0-runtime.mmd), [`10-p0-review-lifecycle.mmd`](docs/architecture/10-p0-review-lifecycle.mmd).

### Local run — Docker Compose

Requirements: Docker Engine/Desktop with Compose v2, Git, and network access for the initial image/dependency downloads. Allocate approximately 8 GB RAM and adequate image space for the CPU document parser. No external ERP or AI credentials are required for the sample demo.

Run from the repository root:

```bash
cp .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up --build -d
```

The one-shot `migrate` and `seed` services must finish before the API and worker start. The initial image build includes Docling and CPU model libraries, so it takes longer than subsequent starts. The supplied Markdown TORs do not need external model downloads. PDF parsing may download Docling model assets on first use; a failure is shown with a retry action.

Open:

- Web: http://localhost:5173
- API docs: http://localhost:8000/docs
- Readiness: http://localhost:8000/ready
- MinIO console: http://localhost:9001 (local demo credentials from `.env`)

Inspect services and stop without deleting data:

```bash
docker compose --env-file .env -f infra/docker-compose.yml ps -a
docker compose --env-file .env -f infra/docker-compose.yml logs --tail=100 intelligence-api integration-worker seed
docker compose --env-file .env -f infra/docker-compose.yml down
```

Persistent named volumes keep PostgreSQL and MinIO data. Do not use `down -v` unless you intend to erase the local demo data.

### Local development — native API and Vite

Start only the backing services, then run the application on the host:

```bash
cp .env.example .env
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres minio
uv sync --project services/intelligence-api --extra test
export DATABASE_URL='postgresql://celerates:celerates@localhost:5432/celerates'
export S3_ENDPOINT='http://localhost:9000'
uv run --project services/intelligence-api python -m cdi.migrate
uv run --project services/intelligence-api python -m cdi.seed
uv run --project services/intelligence-api uvicorn cdi.api:app --host 127.0.0.1 --port 8000
```

In a second terminal, export the same `DATABASE_URL` and `S3_ENDPOINT`, then:

```bash
uv run --project services/intelligence-api python -m cdi.worker
```

In a third terminal:

```bash
npm ci --prefix apps/web
npm run dev --prefix apps/web
```

Host development accepts TXT/Markdown/CSV immediately. Install the document extra for PDF/Office: `uv pip install --python services/intelligence-api/.venv/bin/python --torch-backend=cpu 'docling==2.129.0'`. For an existing local PostgreSQL+pgvector without MinIO, explicitly select `STORAGE_BACKEND=filesystem`; this is a storage adapter, not a database substitute.

### Verification commands

With PostgreSQL/pgvector running and `DATABASE_URL` / storage configured as above:

```bash
uv run --project services/intelligence-api pytest services/intelligence-api/tests
uv run --project services/intelligence-api ruff check services/intelligence-api/cdi services/intelligence-api/tests --config services/intelligence-api/pyproject.toml
npm run build --prefix apps/web
```

Browser acceptance requires the seeded API, worker and Vite running together. Run it on a disposable demo database because it creates opportunities and reviews packs:

```bash
cd apps/web
npx playwright install --with-deps chromium
npm run test:e2e
```

Browser tests cover all routes at desktop/mobile widths and the create → upload → analyze → edit → approve → ERP-outcome journey. The tests save screenshots to `docs/implementation/exports/`.

### Connected configuration

Keep `ERP_MODE=demo` and `MODEL_MODE=demo` for the credential-free walkthrough. To connect an ERP, configure `ERP_MODE=http`, `ERP_BASE_URL`, `ERP_TOKEN`, and `API_ACCESS_TOKEN`, then implement/verify the documented HTTP contract. Enter the workspace token via the reviewer access control in the sidebar. No fallback to demo ERP occurs on an HTTP failure.

Set `MODEL_MODE=litellm`, `REASONING_MODEL`, and `EMBEDDING_MODEL` to use real providers through LiteLLM. Configure provider credentials, or set `MODEL_API_BASE` / `MODEL_API_KEY` for a LiteLLM proxy. `FALLBACK_MODEL` is optional; both failures leave the run failed and retryable. Empty optional API base/key values are treated as unset. Optional proxy profile configuration is in `infra/litellm/`; set `PROVIDER_REASONING_MODEL`, `PROVIDER_EMBEDDING_MODEL` and `PROVIDER_API_KEY` before starting it. Model narrative always remains a draft; live ERP facts are source-owned.

Langfuse: install the `observability` extra, set `LANGFUSE_ENABLED=true` and the standard Langfuse keys/host. Optional n8n setup is documented under `infra/n8n/`. Neither optional service is required by P0.

### Exact demo walkthrough

1. Open `/` to present the product storyline, four business capabilities and technology foundation. Choose **Explore Pre-Sales**.
2. Observe the three seed states: **Digital operations workspace** (New), **Talent capacity planning** (Clarification Required), and **Customer service intelligence** (Ready for Sales).
3. Open the new opportunity and inspect/download its sample TOR. Click **Start analysis**. The worker moves through ingestion and analysis into **Review Required**; page refresh does not lose progress.
4. Open each of the **11 artifact tabs**. Inspect **Evidence & provenance**, the source panel, workflow history and **Find evidence** search.
5. Open **Solution → Edit artifact**, change the reviewer narrative, then **Save changes**. The version increments; refresh and confirm the edit persists.
6. Choose **Review & approve pack**. Review the exact version list, enter a note, and tick the human-review confirmation. Choose **Approve current versions**.
7. Choose **Ready for Sales**, enter a handoff note, then **Record outcome**. Wait for **ERP Acknowledged** in history and verify the ERP status changes to **Ready for Sales**. Download the JSON pack with **Export pack** if needed.
8. To demonstrate gaps, create a new opportunity and register a short `.md` brief without `Acceptance:`, `Timeline:`, `Integration:` or `Budget:` fields. Analyze it. Open **Clarifications** and either record answers with state **Resolved**, or choose **Request clarification** to return the status to Sales. Ready for Sales is blocked while gaps remain.
9. After **Clarification Required**, add a supplemental source and run a new analysis. Prior run artifacts and audit history remain persisted. For the most predictable demo, use `samples/tor-digital-operations.md` or its labeled fields.
10. Show **Exceptions** for deterministic trigger facts, **Human Service** for PIC/policy context, **Management** for derived action briefs, and **Sources / System** for integration provenance and boundaries.
