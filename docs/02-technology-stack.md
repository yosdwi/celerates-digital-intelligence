# Technology Stack Baseline

> Detailed component responsibilities and the relationship between LangGraph, PostgreSQL/pgvector/FTS, LiteLLM/OpenRouter, and Langfuse are documented in [`06-intelligence-stack-explained.md`](./06-intelligence-stack-explained.md). See also the visual diagram [`architecture/11-intelligence-runtime-components.mmd`](./architecture/11-intelligence-runtime-components.mmd).

## Stack at a glance

| Concern | Baseline |
|---|---|
| ERP web application | Next.js + React + TypeScript |
| Intelligence web application | React + TypeScript + Vite |
| UI system | Tailwind CSS + reusable accessible components |
| Intelligence API | Python + FastAPI |
| Workflow orchestration | LangGraph |
| Integration Core | Python |
| Low-code automation | n8n self-hosted, supporting role |
| Relational intelligence store | PostgreSQL |
| Semantic retrieval | pgvector |
| Keyword retrieval | PostgreSQL full-text search |
| Object/document storage | MinIO / S3-compatible |
| Document parsing | Docling |
| Cache / transient state | Redis when useful |
| Model Gateway | LiteLLM |
| Model providers | OpenAI, Anthropic, Gemini, open-source/local |
| AI tracing/evaluation | Langfuse boundary/integration |
| Local development | Docker Compose |
| Diagrams | Mermaid in Git |

## Raw source integration

### Why Python is primary

Python provides a testable, versioned, vendor-neutral integration core with a broad ecosystem for files, APIs, databases, and documents. Critical mapping/validation/reconciliation logic stays reviewable in Git.

Suggested libraries, only where needed:

- FastAPI / Pydantic for contracts and endpoints;
- `httpx` for REST APIs;
- `polars` or `pandas` for CSV/data transforms;
- `openpyxl` for Excel specifics;
- `psycopg` / SQLAlchemy for PostgreSQL;
- `pyodbc` for SQL Server adapters when implemented;
- Docling for documents;
- boto3/S3-compatible SDK for MinIO/object storage.

### Why n8n remains useful

n8n is valuable for integrations where visual composition and prebuilt connectors save time:

- trigger on form submission;
- incoming email/attachment workflows;
- simple Google/Slack/Teams/WhatsApp-style connectors;
- calling the Celerates intake API;
- notification fan-out;
- low-risk operational automation.

n8n must not become the only location of business-critical mapping, validation, pricing, approval, or domain rules.

### Airbyte

Not included in v0. Reconsider only if the project develops a genuine need for large-scale database replication/CDC across many external databases.

## ERP boundary

Do not couple the intelligence service directly to the ERP schema as the default integration pattern. Define an adapter with:

- read models / APIs;
- events/webhooks or polling adapter where events do not exist yet;
- controlled actions/commands.

The first implementation should ship a local/demo ERP adapter plus a real HTTP-adapter interface.

## Intelligence data

### PostgreSQL + pgvector

Use one technology for relational intelligence metadata and vector retrieval during the first implementation.

Store examples:

- source and document metadata;
- document versions/chunks;
- embeddings;
- knowledge entities and links;
- artifact metadata;
- workflow state references;
- model/tool run metadata;
- feedback/evaluation records;
- ingestion audit.

Do not duplicate the entire ERP operational model. Store only what the intelligence concern needs, while accessing live business state via ERP tools/read models.

### Hybrid retrieval

Use semantic/vector retrieval and full-text retrieval together where useful. Exact identifiers, dates, states, and business filters should remain structured queries.

### MinIO

Use for raw/approved documents and generated export files in local/self-hosted environments. Keep an S3-compatible abstraction so managed object storage can replace it later.

## Intelligence Core

### FastAPI

Exposes typed endpoints for:

- opportunity analysis;
- artifact retrieval/update/approval;
- source ingestion status;
- exceptions/cases;
- management briefs;
- health/system status.

### LangGraph

Use for stateful workflows that combine deterministic steps, tool calls, model calls, and human review. Pre-Sales is the flagship example.

Do not use an agent for simple deterministic jobs. A clear function/service is preferable when no reasoning loop is required.

## Model Gateway — LiteLLM

Applications and workflows should not import provider-specific business code throughout the system. Route model calls through one boundary.

Required concepts:

- logical model aliases, e.g. `reasoning-strong`, `fast-general`, `embedding-default`;
- provider configuration through environment/secrets;
- retry/fallback;
- request metadata for tracing;
- per-use-case selection;
- demo provider/fallback when no external keys exist.

## Langfuse

Integrate tracing/evaluation in a way that can be disabled locally. Capture useful spans such as retrieval, ERP tool call, model call, workflow state, latency, token/cost metadata, and outcome evaluation.

## Deployment baseline

Target production deployment is **portable Docker on the approved Hostinger VPS baseline**, not a provider-specific PaaS dependency.

Initial planning uses the KVM 4 class (4 vCPU, 16 GB RAM, 200 GB NVMe) and keeps the topology intentionally small:

- Celerates ERP web/runtime;
- Intelligence API and worker;
- PostgreSQL with pgvector/FTS where used by Intelligence;
- private S3-compatible object storage in production; local/demo Compose may use the filesystem backend so CI does not depend on a discontinued public MinIO image;
- self-hosted observability/logging;
- Redis only when measured need justifies it;
- optional n8n profile;
- LiteLLM as a library/gateway boundary or optional service profile depending on runtime configuration.

The initial baseline may colocate these components on one VPS while resource and reliability measurements remain healthy. Scale up the VPS or split a component only when CPU, RAM, disk, concurrency, retention or failure-isolation evidence requires it.

Do not introduce Kubernetes, Kafka, a separate vector database, or high-availability topology until measured load/risk requires it. Cost figures remain in the management spreadsheet rather than this technical baseline.

See ADR-020 for the deployment and capability-migration decision.
