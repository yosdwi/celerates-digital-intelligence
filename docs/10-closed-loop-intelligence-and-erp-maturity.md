# Closed-Loop Intelligence + ERP Maturity Direction

Date: 2026-09-25

## Why this document exists

The first embedded operational-assistance increment proved an important interaction pattern: Celerates ERP can surface deterministic operational attention and contextual feedback without redesigning the ERP or turning it into a chatbot.

That is useful, but it is **not the product end-state**.

The broader direction is to build a persistent **Celerates Intelligence Layer** that learns from approved knowledge, ERP state, workflow outcomes, user feedback, and evaluation signals; then uses that context to improve operational work and controlled automation back into ERP.

ERP maturity and Intelligence development should therefore proceed **in parallel**, with ERP remaining the operational source of truth.

The target is not:

```text
ERP + floating panel
```

and not:

```text
ERP + chatbot
```

The target is closer to:

```text
                    CELERATES DIGITAL OPERATIONS

 Sources / Documents / ERP / Feedback / Outcomes
                    │
                    ▼
        Context & Knowledge Foundation
                    │
                    ▼
             Intelligence Core
       rules + retrieval + workflows + models
                    │
                    ▼
      Assistance / Exception / Automation
                    │
            human control where needed
                    │
                    ▼
                  ERP
                    │
                    ▼
        outcomes / feedback / evidence
                    │
                    └───────────────┐
                                    ▼
                          learning / evaluation
                                    │
                                    └──────► Intelligence
```

The floating `Bantuan Operasional` panel is one **surface** of this system, not the system itself.

---

## Product principle

> **Make ERP progressively easier to operate because the system understands trusted business context, remembers approved organizational knowledge, detects operational conditions, assists execution, and improves from observed outcomes.**

The Intelligence Layer should eventually support several surfaces at once:

- embedded operational assistance inside ERP;
- exception/action center;
- management intelligence;
- Pre-Sales intelligence;
- Human Services / people workflows;
- proactive reminders and controlled automation;
- API/workflow integrations;
- future conversational interaction where conversation is actually useful.

No single UI should define the architecture.

---

# 1. Current baseline already exists

The repository is not starting from zero.

## ERP operational core

`apps/erp` already contains real cross-domain workflows spanning Marketing, Sales, TA, HR, TM, PMO, Timesheet, Attendance, Finance, approvals, documents, and feedback.

The current operational-assistance increment has also added:

- deterministic operational rules;
- same-origin authenticated operational read API;
- contextual feedback reuse;
- explicit PMO preparation actions;
- removal of PMO page-read side effects;
- production-like Railway runtime.

These should remain ERP-owned capabilities.

## Intelligence runtime

`services/intelligence-api` already contains important foundation pieces:

- FastAPI-based Intelligence service;
- PostgreSQL persistence;
- pgvector support;
- PostgreSQL full-text search;
- object storage abstraction;
- document registration and parsing;
- Docling integration path;
- embedding gateway;
- hybrid retrieval;
- model gateway abstraction;
- ERP adapter boundary (`DemoERP` / `HttpERP`);
- workflow/artifact implementation for the existing Intelligence P0.

Current document ingestion is primarily **opportunity-scoped**. `documents.py` stores documents against an `opportunity_id`, parses them, chunks them, creates embeddings, and retrieves them with hybrid FTS + vector similarity.

That implementation should be **generalized**, not thrown away.

The key architectural gap is no longer “can we build RAG?” It is:

> **How do we turn the existing opportunity-scoped Intelligence P0 into a governed enterprise context/knowledge and automation loop connected to the real ERP?**

---

# 2. Closed-loop target

The Intelligence Layer should have six logical capabilities.

```text
1. INGEST
   ERP context + documents + approved external sources + feedback + outcomes

2. UNDERSTAND / INDEX
   normalize metadata + parse + chunk + embed + lexical index + provenance

3. BUILD CONTEXT
   combine exact ERP facts with relevant organizational knowledge

4. REASON / ORCHESTRATE
   deterministic rules + retrieval + model reasoning + workflow state

5. ACT
   surface assistance or execute a controlled ERP action after policy/review

6. LEARN
   capture outcome + human feedback + evaluation and improve future behavior

                     ┌─────────────────────────┐
                     │                         │
                     └──────── LOOP ───────────┘
```

This is the foundation behind future Intelligence products.

---

# 3. Keep three kinds of truth separate

A closed loop must not turn pgvector or an LLM into the source of truth.

## A. Operational truth — ERP

Exact current business state belongs to ERP/read models:

- opportunity state;
- requisition;
- employee;
- assignment;
- contract;
- invoice;
- approval;
- finance handoff;
- workflow ownership;
- dates and amounts;
- authoritative statuses.

For these, use controlled READ/EVENT/ACTION contracts.

## B. Knowledge — governed knowledge layer

Documents and reusable organizational knowledge belong to the Context & Knowledge layer:

- TOR / RFP;
- proposals;
- SOW;
- capability profiles;
- project case studies;
- policies / SOP;
- templates;
- meeting decisions;
- architecture patterns;
- approved lessons learned;
- validated FAQs / BA decisions;
- selected feedback once reviewed.

Use object storage for source objects, PostgreSQL metadata, FTS and pgvector for retrieval.

## C. Observations / learning signals

Not everything users say should immediately become knowledge.

Examples:

- feature requests;
- thumbs up/down;
- corrections;
- accepted/rejected suggestions;
- automation success/failure;
- artifact revisions;
- human override;
- workflow completion time;
- retrieval relevance;
- model/evaluation scores.

These are **signals** first.

They become durable knowledge, rules, examples or product changes only through an appropriate review path.

This avoids a dangerous model where one incorrect feedback message silently contaminates future outputs.

---

# 4. Knowledge ingestion pipeline

The next Intelligence foundation should evolve the existing document path into a reusable ingestion pipeline.

Conceptually:

```text
SOURCE
ERP attachment / upload / Drive / document / approved feedback / meeting note
   │
   ▼
SOURCE REGISTRY
who / where / scope / classification / ownership / checksum / version
   │
   ▼
RAW OBJECT
MinIO / S3-compatible storage
   │
   ▼
PARSER
Docling / deterministic parser / structured importer
   │
   ▼
NORMALIZED KNOWLEDGE ITEM
metadata + text + source provenance + security scope
   │
   ├────► PostgreSQL FTS
   │
   └────► pgvector embeddings
              │
              ▼
       HYBRID RETRIEVAL
```

Important evolution from the current implementation:

- knowledge should not always require `opportunity_id`;
- knowledge needs scope, for example:
  - company;
  - division;
  - client/account;
  - opportunity;
  - project;
  - talent/role where permitted;
- every item needs provenance and source version;
- access classification must be enforced before retrieval;
- re-ingestion should be idempotent by source/version/checksum;
- stale/deprecated knowledge must be distinguishable from current approved knowledge.

A simple lifecycle is enough initially:

```text
INGESTED
→ REVIEWED / APPROVED
→ ACTIVE
→ SUPERSEDED / DEPRECATED
```

Do not build a giant knowledge-management UI first. Build the pipeline and metadata contract first, then expose only what users need.

---

# 5. Context builder is more important than “chat”

The system needs a reusable way to construct context for any Intelligence workflow.

Example:

```text
Build context for Project X

Exact ERP facts
├─ client
├─ PQ / commercial context
├─ assigned talents
├─ contract
├─ billing state
└─ current operational exceptions

Relevant knowledge
├─ client history
├─ approved proposal / SOW
├─ similar project lessons
├─ applicable SOP
└─ recent validated decisions

Workflow memory
├─ previous recommendation
├─ human decision
└─ unresolved follow-up
```

The same context foundation can later feed:

- embedded ERP assistance;
- management briefs;
- project exception explanation;
- Pre-Sales generation;
- staffing support;
- reminder automation;
- human-service workflows.

This is more valuable than implementing many separate chat endpoints.

---

# 6. Feedback should become a real learning loop

The contextual `Feature Request` path is useful but should be understood as only one feedback source.

The future loop should look like:

```text
System produces signal / suggestion / artifact / automation
                   │
                   ▼
              Human uses it
                   │
          ┌────────┴─────────┐
          ▼                  ▼
       accepted           corrected
          │                  │
          └────────┬─────────┘
                   ▼
            outcome captured
                   │
                   ▼
             evaluation set
                   │
       ┌───────────┼────────────┐
       ▼           ▼            ▼
 retrieval     prompt/rule    product / ERP
 tuning        improvement    requirement
       │           │            │
       └───────────┴────────────┘
                   │
                   ▼
             next iteration
```

“Learning” here does **not** initially mean automatically fine-tuning model weights.

The first useful learning mechanisms are:

- better retrieval ranking;
- approved knowledge promotion;
- reusable examples;
- rule refinement;
- prompt/workflow version changes;
- exception threshold refinement;
- product requirement discovery;
- regression/evaluation datasets;
- automation confidence and approval policies.

These are measurable, auditable and safer than opaque automatic self-training.

Later, if enough high-quality reviewed examples exist, fine-tuning can be evaluated as a separate engineering decision.

---

# 7. Advanced automation: Intelligence must be able to close the loop back into ERP

The final value is not merely insight.

A useful Intelligence workflow should eventually be able to move through:

```text
DETECT
→ UNDERSTAND
→ RECOMMEND
→ REVIEW / POLICY CHECK
→ ACT
→ VERIFY
→ LEARN
```

Example:

```text
Contract approaching end
        ↓
ERP event / deterministic detector
        ↓
load employee + project + contract context
        ↓
retrieve extension policy / prior approved pattern
        ↓
prepare extension recommendation / draft
        ↓
TM / Sales human approval
        ↓
controlled ACTION to ERP
        ↓
ERP records actual new state
        ↓
outcome captured for future evaluation
```

Another example:

```text
Invoice submission exception
        ↓
exact ERP rule
        ↓
collect project/document context
        ↓
identify likely blocking requirement
        ↓
propose next action / reminder
        ↓
PMO approves
        ↓
create ERP task / send approved reminder / update workflow
        ↓
observe resolution time
```

The action layer must use explicit allowlisted contracts and idempotency keys. Intelligence must not receive unrestricted database write access.

---

# 8. Event + action boundary with ERP

The repository already has an `ERPAdapter` abstraction and an HTTP-mode shape. That is the correct direction.

The real ERP should progressively expose stable boundaries such as:

```text
READ
GET opportunity / project / requisition / employee / assignment / contract / invoice
GET context summaries required by approved workflows

EVENT
opportunity.qualified
requisition.created
employee.created
assignment.created
contract.created
invoice.attention
finance.handoff.changed
feature_request.created
...

ACTION
create task
prepare approved artifact reference
request review
update an allowlisted workflow state
create approved operational record
send approved notification through the appropriate channel
```

The exact contract should be derived from real workflows, not designed as a giant generic ERP API in advance.

Start with the minimum contract needed for one useful closed-loop workflow and grow it version-by-version.

---

# 9. ERP maturity continues in parallel

Intelligence does not remove the need to mature ERP.

The two tracks reinforce each other.

```text
ERP MATURITY TRACK                 INTELLIGENCE TRACK

workflow correctness              knowledge ingestion
business semantics                context builder
idempotency / concurrency         retrieval
RBAC / sensitive data             orchestration
historical snapshots              evaluation
background jobs                   exception detection
source cutover                    controlled automation
stable ERP contracts              feedback / learning
         │                                │
         └──────────────┬─────────────────┘
                        ▼
              CLOSED-LOOP DIGITAL OPS
```

An Intelligence feature should only rely on ERP facts that are sufficiently trusted.

When Intelligence exposes an ambiguity, that can itself become an ERP-maturity requirement.

Examples:

- Finance handoff cardinality unclear → BA decision → ERP model correction → Intelligence rule becomes safe.
- historical profitability unstable → ERP snapshot/version fix → Management Intelligence can use historical profit.
- talent skills remain free-text → ERP/data maturity first → staffing intelligence later.

This is the desired feedback relationship between both tracks.

---

# 10. Execution model — broaden beyond the floating panel

Do not spend the next iterations only adding more conditions to `Bantuan Operasional`.

The panel can continue improving, but the main engineering program should now split into parallel streams.

## Stream A — ERP maturity

Continue the highest-impact operational corrections:

- reliable cross-module transitions;
- background/scheduled processing where page reads still own side effects;
- historical financial snapshots;
- Finance/PMO business semantics;
- RBAC and PII boundaries;
- backup/restore/monitoring;
- source cutover.

## Stream B — Enterprise knowledge foundation

Evolve the current document P0 into generalized knowledge ingestion:

- source registry;
- source scope and classification;
- object provenance/version;
- parser pipeline;
- chunking;
- FTS + pgvector;
- approved/deprecated lifecycle;
- retrieval API;
- security-aware filters.

Start by ingesting a **small but real, useful corpus**, not “every company file” blindly.

Good first corpora could include:

- approved company/service capability documents;
- prior proposals / case studies;
- BA-approved ERP workflow decisions;
- SOP/policies relevant to one selected workflow;
- selected Pre-Sales historical artifacts.

## Stream C — Context + workflow runtime

Build a reusable Context Builder and connect it to LangGraph/workflow orchestration.

The workflow should be able to combine:

```text
exact ERP read
+ operational rules
+ retrieved knowledge
+ workflow state
+ model call where useful
+ human checkpoint
```

## Stream D — Feedback / evaluation loop

Capture:

- source of recommendation;
- generated output version;
- accepted / rejected / edited;
- reviewer;
- reason/correction where available;
- workflow outcome;
- retrieval evidence;
- model/prompt/workflow version.

Use this to build evaluation datasets and improve the system deliberately.

## Stream E — Controlled automation

Start with automation that is valuable but recoverable.

Examples to explore:

- create/route ERP task;
- prepare structured handoff;
- generate draft reminder;
- schedule follow-up;
- prepare an extension/pre-sales/document artifact;
- propose a state transition requiring confirmation.

Only after confidence grows should some low-risk actions become automatic.

---

# 11. Recommended near-term vertical slice

The next implementation should prove the **closed loop**, not just another UI component.

A strong vertical slice has all of these:

```text
real source
→ ingest
→ retrieve/contextualize
→ detect or trigger workflow
→ produce useful operational output
→ human review
→ controlled ERP action
→ outcome captured
→ feedback/evaluation stored
```

The exact business workflow should be selected after reviewing which current ERP semantics are trustworthy enough and which corpus is available.

Possible candidates include:

- Pre-Sales opportunity/TOR → knowledge-assisted output → human review → ERP outcome;
- PMO operational exception → relevant SOP/project context → recommended next action → approved task/handoff;
- employee/contract extension → policy/history context → draft recommendation → approval → ERP workflow action.

Do not lock the entire architecture to the first use case. The first use case proves the shared pipeline.

---

# 12. Infrastructure direction

The existing technology direction remains suitable for the near term:

```text
ERP Web / PostgreSQL
        │
        │ controlled READ / EVENT / ACTION
        ▼
Intelligence API / Worker
        │
        ├── PostgreSQL metadata + workflow state
        ├── pgvector
        ├── PostgreSQL FTS
        ├── MinIO / S3-compatible objects
        ├── LangGraph
        ├── LiteLLM gateway
        └── Langfuse / evaluation boundary
```

For Railway, this likely means progressively running the already-containerized Intelligence service alongside ERP and shared/supporting infrastructure with **separate credentials and boundaries**, while keeping Docker portability for a future VPS deployment.

Do not add Kafka, a dedicated vector database, Airbyte, or a large event platform until real throughput/integration needs justify them.

A simple outbox/event worker or reliable job queue can be introduced first where event-driven workflows need durability.

---

# 13. What the floating panel becomes

`Bantuan Operasional` should stay, but its role changes conceptually.

Today:

```text
ERP rule → panel attention item
```

Later:

```text
ERP state
+ knowledge
+ workflow memory
+ exception rules
+ reviewed recommendations
        ↓
embedded operational assistance
```

It can progressively expose:

- current attention;
- why a condition exists;
- source/evidence;
- relevant approved policy/context;
- next action;
- review/approve;
- follow-up state;
- contextual feedback.

But dedicated surfaces such as Exception Management, Management Intelligence and Pre-Sales should still exist where the workflow needs more room than a floating panel.

---

# 14. Guardrails

The closed loop must preserve these boundaries:

1. ERP remains authoritative for operational state.
2. pgvector is retrieval infrastructure, not business truth.
3. feedback does not automatically become approved knowledge.
4. model output does not directly mutate ERP without an allowlisted action/policy.
5. sensitive knowledge retrieval respects role/scope classification.
6. every important output/action should retain provenance and version information.
7. workflow outcomes and human corrections should be measurable.
8. build reusable platform capability through real workflows, not architecture for architecture's sake.

---

# 15. Definition of meaningful progress

The project should not measure progress only by number of screens or number of AI features.

Meaningful milestones include:

- a real document can enter the knowledge pipeline and be retrieved with provenance;
- one workflow combines real ERP context + retrieved knowledge;
- one output is human-reviewed and the correction is captured;
- one controlled action is written back into ERP idempotently;
- the final outcome becomes an evaluation/learning signal;
- an ERP business ambiguity discovered by Intelligence is corrected in the ERP maturity track;
- a subsequent workflow measurably benefits from prior approved knowledge or feedback.

When these work together, Celerates has moved from “ERP with assistance” toward a true **closed-loop Human Services Intelligence platform**.

---

# 16. Direction for the next implementation agent

Before implementing broadly:

1. inspect the latest ERP and Intelligence code, not only this document;
2. identify which current Intelligence P0 components can be reused/generalized;
3. verify Railway/deployment topology and existing PostgreSQL/object-store services;
4. choose one real vertical slice that can demonstrate the complete loop;
5. build shared primitives only when the vertical slice actually needs them;
6. continue ERP maturity fixes in parallel when a trusted Intelligence workflow depends on them;
7. preserve the current ERP UX unless a workflow genuinely requires a new surface.

The implementation agent is encouraged to improve this design based on repository evidence. This document defines the **direction and boundaries**, not a fixed low-level design.
