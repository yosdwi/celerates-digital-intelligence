# Technology Stack Baseline

## Stack at a glance

| Concern | Baseline |
|---|---|
| Web application | React + TypeScript + Vite |
| UI system | Tailwind CSS + shadcn/ui-style accessible components |
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

For v0, optimize for one-machine operability:

- `web`
- `intelligence-api`
- `integration-worker`
- PostgreSQL with pgvector
- MinIO
- Redis (if actually used)
- optional n8n profile
- optional LiteLLM profile or external endpoint

Do not introduce Kubernetes, Kafka, separate vector DB, or high-availability topology until load/risk requires it.
