# Celerates Intelligence Stack — How the Pieces Fit Together

This document explains the core Intelligence Layer components in practical terms. The goal is to make the architecture understandable to product, engineering, management, and future implementation agents without reducing the system to “RAG + chatbot”.

## Mental model

```text
Business / User Workflow
        │
        ▼
     LangGraph
workflow, state, branching, human review
        │
        ├── exact business facts ───────► PostgreSQL / ERP tools
        │
        ├── knowledge retrieval ────────► pgvector + PostgreSQL FTS
        │
        └── model reasoning ────────────► LiteLLM Model Gateway
                                             │
                         ┌───────────────────┼───────────────────┐
                         ▼                   ▼                   ▼
                      OpenAI             Anthropic            Gemini
                                             │
                                             ▼
                                          Langfuse
                                  tracing, quality, cost, eval
```

The components are deliberately separate because they solve different problems.

| Component | Responsibility |
|---|---|
| LangGraph | Runs stateful intelligence workflows, including branching, tool calls, pauses, retries, and human review. |
| PostgreSQL | Stores structured intelligence metadata and other relational state. Live authoritative business state remains in ERP/read models. |
| pgvector | Finds knowledge by semantic similarity. |
| PostgreSQL FTS | Finds knowledge by lexical / exact text matching. |
| LiteLLM | Provides one controlled gateway to multiple model providers. |
| Langfuse | Traces, observes, evaluates, and measures model/retrieval/tool activity. |

---

## 1. LangGraph — workflow and state orchestration

LangGraph is not the AI model. It is the orchestration layer that defines **how an intelligence workflow proceeds**.

Pre-Sales is the flagship example:

```text
Opportunity created
      ↓
Load ERP context
      ↓
Parse TOR / RFP
      ↓
Extract requirements
      ↓
Retrieve relevant experience
      ↓
Check missing information
      ↓
Check capability / capacity in ERP
      ↓
Assess risks / assumptions
      ↓
Generate structured artifacts
      ↓
Human Pre-Sales review
      ↓
Approve / revise / clarify
```

A workflow can contain different kinds of steps:

- deterministic Python code;
- SQL/read-model queries;
- retrieval;
- business rules;
- model calls;
- controlled ERP actions;
- human approval.

Not every step should use an LLM. For example, `invoice due_date < today` is a deterministic rule and should remain deterministic.

The important design principle is:

> **LangGraph coordinates intelligence work; it does not replace business logic.**

---

## 2. PostgreSQL, pgvector, and PostgreSQL Full-Text Search

These three are related, but they are not the same thing.

### PostgreSQL — structured and exact data

Use relational queries for facts where correctness depends on exact values, filters, joins, or aggregation.

Examples:

- opportunity status;
- current project owner;
- available talent count;
- contract expiry date;
- invoice amount;
- approval state;
- source/document metadata;
- workflow and review state.

Do **not** use embeddings for authoritative operational facts.

### pgvector — semantic retrieval

pgvector extends PostgreSQL so that document chunks or knowledge items can store embeddings.

It is useful when the user asks for concepts that may use different wording from the source document.

Example:

```text
Query:
“AWS data engineering experience”

Relevant historical text:
“cloud-based data pipeline implementation using Python”
```

The wording differs, but the meaning is close. Semantic search can still retrieve it.

Good candidates include:

- TOR / RFP;
- proposals;
- SOW;
- project case studies;
- policies;
- meeting notes;
- CV / capability documents;
- reusable architecture and solution knowledge.

### PostgreSQL FTS — lexical / keyword retrieval

Full-text search is useful where exact terminology matters.

Examples:

- `SAP FI`;
- `ISO 27001`;
- specific product names;
- client names;
- identifiers or domain terminology.

Semantic search alone can broaden the meaning too much. FTS protects exact lexical intent.

### Why hybrid retrieval

For Celerates, the preferred pattern is:

```text
User / workflow query
      │
      ├──► PostgreSQL FTS ─────► keyword / lexical candidates
      │
      └──► pgvector ───────────► semantic candidates
                         │
                         ▼
                 combine / rank
                         │
                         ▼
                best evidence set
```

This is why a separate vector database is not required for the POC. PostgreSQL already provides relational storage, full-text retrieval, and—through pgvector—semantic retrieval in one operationally simple stack.

---

## 3. LiteLLM — Celerates Model Gateway

Applications should not scatter provider-specific SDK logic everywhere.

Without a gateway, code gradually becomes coupled to individual providers:

```text
Pre-Sales → OpenAI SDK
Human Service → Anthropic SDK
Management → Gemini SDK
```

That makes model switching, fallback, policy, cost tracking, and provider changes harder.

The intended boundary is:

```text
Celerates Intelligence Core
          │
          ▼
       LiteLLM
          │
  ┌───────┼────────┬────────────┐
  ▼       ▼        ▼            ▼
OpenAI  Anthropic Gemini   Open-source/local
```

Applications should preferably call logical model aliases such as:

```text
reasoning-strong
fast-general
embedding-default
```

The gateway determines which concrete provider/model serves that logical role.

This keeps Celerates IP above the model providers: business context, workflow, rules, tools, retrieval, approvals, and evaluation remain ours.

---

## 4. LiteLLM vs OpenRouter

They can look similar because both can expose access to multiple models, but they occupy different architectural positions.

### OpenRouter

OpenRouter is useful as a hosted aggregation/provider endpoint. From the application perspective:

```text
Celerates
   ↓
OpenRouter
   ↓
multiple model providers
```

It is convenient for fast access to many models through one external service.

### LiteLLM

LiteLLM is our **gateway boundary**. It can sit inside Celerates infrastructure and route to direct providers, local models, or even OpenRouter.

```text
                         ┌── OpenAI direct
                         ├── Anthropic direct
Celerates → LiteLLM ─────┼── Gemini direct
                         ├── OpenRouter
                         └── local / future provider
```

Therefore the architectural choice is not necessarily `LiteLLM OR OpenRouter`.

For Celerates:

- **LiteLLM = our model gateway/control boundary**;
- **OpenRouter = an optional upstream model provider/aggregator behind that boundary**.

This avoids coupling the business applications directly to any single aggregator.

---

## 5. Langfuse — observability and evaluation

Langfuse is not the workflow engine. It is the **observability and evaluation layer** around intelligence execution.

A useful trace can show:

```text
Opportunity OPP-0021
  ├─ ERP context lookup       210 ms
  ├─ knowledge retrieval      380 ms
  ├─ requirement extraction
  │    model: reasoning-strong
  │    input/output usage
  │    latency / cost metadata
  ├─ capability check
  ├─ solution draft
  └─ human review
       status: revised
```

The practical questions it should help answer are:

- Which model was used?
- Which prompt/version was used?
- What knowledge was retrieved?
- Which ERP/tool calls were executed?
- How long did each step take?
- How much model usage/cost was incurred?
- Did the human reviewer accept or revise the output?
- Which model/prompt performs better on Celerates use cases?

This becomes important because model output is probabilistic. We need evidence-based evaluation rather than “this model feels better”.

---

## 6. LangGraph vs Langfuse

A simple analogy:

- **LangGraph = the engine and workflow controller**;
- **Langfuse = the flight recorder, telemetry, and evaluation console**.

```text
LangGraph executes
Start → Retrieve → Analyze → Decide → Human Review → Complete

Langfuse observes
trace → latency → model → retrieved evidence → cost → feedback → quality
```

They complement each other rather than compete.

---

## 7. End-to-end example — Pre-Sales

```text
Sales creates Opportunity in ERP
          │
          ▼
TOR / RFP stored and parsed
          │
          ▼
LangGraph starts Pre-Sales workflow
          │
          ├── PostgreSQL / ERP tool
          │      exact opportunity, customer, capability, capacity
          │
          ├── pgvector + FTS
          │      previous proposal, project, case study, knowledge
          │
          ├── LiteLLM
          │      selected reasoning/model capability
          │
          └── Langfuse
                 trace retrieval, tools, model call, latency, quality
          │
          ▼
Pre-Sales Intelligence Pack
          │
          ▼
Human review
          │
          ▼
Approved status / action recorded back to ERP
```

The output is not merely a chat answer. It is a structured business artifact set: Requirement Matrix, Clarification List, Relevant Experience, Capability/Capacity Fit, Risk & Assumptions, Solution Outline, Scope Draft, BOQ/Effort Draft, Proposal Draft, and Next Actions.

---

## Architecture rule to preserve

```text
Structured live business truth  → ERP / SQL / controlled tools
Unstructured business knowledge → pgvector + FTS retrieval
Workflow / state                → LangGraph
Model access                    → LiteLLM
Tracing / evaluation            → Langfuse
```

No component above should become the “brain” by itself. The Celerates Intelligence capability comes from the combination of **business context + knowledge + rules + workflow + tools + model capability + human governance + evaluation**.
