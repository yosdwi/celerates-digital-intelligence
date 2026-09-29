# Celerates Enterprise Intelligence & Agentic Operating Model

Date: 2026-09-26

Status: **North-star product and architecture direction. Not a strict implementation specification.**

This document captures the latest product intent after the governed closed-loop foundation, the embedded Operational Assistance work, the independent Celerates Agent audit, and subsequent product-owner discussion.

Read together with:

- `docs/10-closed-loop-intelligence-and-erp-maturity.md`
- `docs/11-celerates-agent-direction-and-exploration-handoff.md`
- `docs/12-celerates-agent-visual-reference.md`
- `docs/13-celerates-agent-audit-and-recommendation.md`
- `docs/implementation/closed-loop-foundation.md`
- `docs/implementation/closed-loop-operations.md`

This document intentionally broadens the product objective beyond the first Sales / Pre-Sales engineering slice. The implementer should audit the repository and challenge details where evidence supports a better design.

---

## 1. Product objective

The target is not "ERP + chatbot" and not "another Intelligence SaaS beside ERP".

The target is:

> **Celerates Intelligence becomes a shared organizational brain that can understand enterprise information, connect structured and unstructured knowledge, search across the business, turn new data or documents into operational context, orchestrate tools and workflows, safely act back into ERP, and learn from outcomes. Celerates Agent is the primary embedded interface through which ERP users access that intelligence.**

The product should progressively reduce the effort required to find information, understand operational state, transform external data into ERP-ready work, execute controlled actions, and retain organizational learning.

---

## 2. Clear role of each layer

### Celerates ERP

The ERP is the **authoritative operational system**.

It owns transactional truth, business records, workflow state, permissions, approvals, and controlled writes.

Normal users should continue doing operational work in ERP.

### Celerates Agent

The Agent is the **embedded interaction and operating layer**.

It should live inside the ERP experience, understand the current user/page/entity, accept text or voice instructions, surface proactive attention, investigate, search, prepare work, propose actions, and execute only through controlled ERP capabilities.

The Agent is not a third standalone application.

### Celerates Intelligence Layer

The Intelligence Layer is the **brain**.

It contains the reusable capabilities behind the Agent and specialist workflows:

- ingestion/connectors;
- parsing and schema understanding;
- entity resolution;
- organizational memory;
- governed knowledge;
- full-text / semantic retrieval;
- relationship/graph understanding;
- context construction;
- model gateway;
- agent runtime and tool orchestration;
- workflow automation;
- policy/approval enforcement;
- outcome/evaluation/learning.

### Intelligence Workspace / Console

The separate Intelligence web should not evolve into another generic SaaS where normal users duplicate ERP work.

Its strongest role is a **Brain Console** for specialists and governance:

- Memory / Documents / Knowledge;
- source provenance and versions;
- Knowledge Graph / entity relationships;
- ingestion jobs and mappings;
- connectors and source health;
- Agent runs and tool traces;
- workflows / playbooks / automations;
- approvals and governance;
- model routing / evaluations / cost / latency;
- feedback / outcomes / corrections / candidate lessons;
- system health and audit.

Pre-Sales may remain a specialist workbench, but it should be a consumer of the shared Intelligence foundation rather than the definition of the product.

Mental model:

```text
Celerates ERP
= where operational work happens

Celerates Agent
= how users access and operate intelligence in context

Celerates Intelligence
= how the system understands, connects, reasons and acts

Intelligence Console
= how specialists inspect and manage the brain
```

---

## 3. The Agent must preserve and evolve Operational Assistance

The existing `Bantuan Operasional` is not throwaway work and should not regress into an empty chat box.

Its two current capabilities become foundational Agent capabilities:

```text
CURRENT

Bantuan Operasional
├── Perlu perhatian
└── Masukan

NEXT

Celerates Agent
├── Attention / proactive signals
│   └── existing `Perlu perhatian`
├── Ask / Search
├── Investigate / Audit
├── Prepare
├── Act
├── Feedback / Correction
│   └── existing `Masukan`
└── Outcome / Follow-up
```

### `Perlu perhatian` becomes proactive Agent context

Known operational conditions should remain deterministic where possible.

Example:

```text
qualified opportunity
AND no requisition / PQ
→ deterministic attention signal
```

The Agent should then be able to explain, investigate, enrich and act on the signal.

Example interaction:

```text
Perlu perhatian:
Qualified opportunity belum memiliki requisition / PQ

User: "Kenapa?"

Agent:
- qualified since ...
- no linked requisition found
- no commercial PQ found
- relevant Sales SOP found
- recommended next investigation/action
```

The user should also be able to ask globally:

- "Apa yang perlu aku perhatikan hari ini?"
- "Mana yang paling lama?"
- "Jelaskan nomor 2"
- "Siapkan tindak lanjut untuk semuanya"

### `Masukan` becomes a general feedback/action capability

Current contextual Feature Request remains useful, but the Agent should make it natural-language and intent-aware.

Example:

> "Di halaman ini filter customer harusnya multi-select."

Agent structures:

```text
Module: Sales
Page: Opportunity Tracker
Type: Improvement
Issue: customer filter is single-select
Suggestion: support multi-select
```

Then offers a preview before creating the Feature Request.

The Agent should also distinguish between:

- business data correction;
- feature request;
- knowledge correction;
- agent feedback;
- operational action.

A complaint must not automatically become a Feature Request.

### Known signals vs discovered insights

The UI should distinguish:

- **Perlu perhatian** — deterministic/system-known condition;
- **Insight Agent** — inference derived from evidence.

Example Agent insight:

> TOR requests 8 engineers while the ERP requisition currently covers 5.

This need not be hard-coded as a client-specific rule; it can emerge by comparing governed document evidence with ERP state.

---

## 4. Agent interaction model — text + voice

The Agent should support both typed and spoken instructions.

A product-owner visual reference is the Certinia-style assistant interaction where a compact floating card/panel provides:

- a primary text input;
- a microphone action (`Speak now` / voice capture);
- suggested actions before typing;
- a compact assistant presence that does not take over the application;
- clear transition between listening, understanding, working, preview and result.

Voice is a **modality of the same Agent**, not a separate voice bot.

Conceptually:

```text
USER
 ├─ types instruction
 └─ speaks instruction
        ↓
   speech-to-text
        ↓
    same Agent run
        ↓
 context / tools / policy / result
```

The user should be able to say things such as:

- "Apa yang perlu aku perhatikan hari ini?"
- "Cari semua informasi Astra yang masih aktif"
- "Cek opportunity ini"
- "Buatkan follow-up untuk yang belum lengkap"
- "Ini sheet manpower dari user, coba cek"
- "Masukin data yang valid ke ERP, tapi kasih preview dulu"

Important interaction principles:

- push-to-talk / explicit microphone activation first; avoid always-on recording;
- show clear recording state and transcript before or during execution;
- allow correction of recognized text before high-impact actions;
- voice commands follow exactly the same authorization and approval policy as typed commands;
- do not let voice bypass confirmation for writes;
- retain text fallback everywhere;
- treat speech data as potentially sensitive and define retention/provider policy before broad rollout.

The exact speech provider is intentionally not locked here. The implementer should evaluate browser/native speech APIs versus server/provider transcription based on Bahasa Indonesia quality, latency, privacy, deployment portability and cost.

The visual direction in `docs/12` remains valid: compact launcher → right-side embedded panel → contextual suggestions → visible progress → proposal/result. Voice should be integrated into that same input surface, not added as a separate product path.

---

## 5. Three golden journeys that should define usefulness

The next platform increment should be judged against these journeys rather than a single Pre-Sales flow.

### Golden Journey A — Ask anything across Celerates

Example:

> "Cari semua yang kita punya tentang Astra dan apa yang perlu saya perhatikan."

The system should be able to combine authorized information from:

- ERP entities and state;
- documents;
- approved knowledge;
- previous projects / outcomes;
- people/talent relationships;
- contracts / PMO state where semantics are trustworthy;
- issues / tasks / exceptions;
- current user/page context.

Output should be one coherent, evidence-backed answer instead of forcing the user to know which module or source to search.

This is the basis of **universal business search**.

### Golden Journey B — Drop anything, Celerates understands it

Example:

> "Ini manpower planning dari client."

User provides a Google Sheet, Excel/CSV, document or other approved source.

Desired generic flow:

```text
read source
↓
inspect schema / structure
↓
extract entities / concepts
↓
match to known business entities
↓
detect duplicates / conflicts
↓
infer mapping
↓
show preview + uncertainty
↓
human confirms
↓
write through controlled ERP capabilities
↓
store provenance + outcome
```

For a TOR / requirement document, the same source could yield:

- detected client/project;
- requirements;
- requested roles / quantities;
- dates / duration;
- gaps / ambiguity;
- related prior knowledge;
- possible actions such as creating drafts or starting specialist workflows.

This journey is important because it proves Intelligence is not just a search/chat layer; it can turn messy external information into controlled operational work.

### Golden Journey C — Ask → action → outcome

Example:

> "Cari talent yang belum submit timesheet minggu ini, siapkan reminder dan summary PMO."

The Agent should be able to:

```text
search operational state
↓
identify the authorized target set
↓
prepare action(s)
↓
preview
↓
user confirms
↓
execute through controlled tools
↓
track result
↓
follow up unresolved items
```

The closed loop matters more than the initial message.

Example next-day result:

```text
9 completed
3 still pending

Suggested:
Follow up remaining 3
```

---

## 6. Generic capability layers — avoid thousands of bespoke `if/else`

The system will still need deterministic business invariants, but Intelligence should not be implemented as one custom rule tree per user request.

Build generic capabilities that the Agent can compose.

### Source / Connector Layer

Potential capabilities:

- file upload;
- Google Sheets / Excel / CSV;
- document sources;
- APIs;
- databases;
- approved external connectors;
- ERP event/read interfaces.

### Understanding Layer

Potential capabilities:

- parsing;
- schema inspection;
- data type inference;
- entity extraction;
- entity resolution;
- relationship discovery;
- duplicate/conflict detection;
- mapping proposal;
- classification.

### Memory / Knowledge Layer

Reuse and extend the governed foundation:

- source versions;
- object storage;
- chunks;
- full-text retrieval;
- pgvector;
- approved knowledge;
- decisions / lessons;
- prior outcomes;
- provenance.

A relationship/graph representation may become valuable as entity breadth grows, but the implementer should not add a separate graph database merely for architecture aesthetics. First determine whether relational edges / materialized relationship views are sufficient.

### Search / Context Layer

Capabilities should support:

- universal search;
- entity-centric search;
- relationship traversal;
- current-user/current-page/current-record context;
- subject-generic context building;
- distinction between ERP facts, documents, approved knowledge, observations and inferred insights.

### Agent Runtime

The Agent should be able to:

- understand intent;
- select or compose tools;
- plan bounded work;
- ask clarification when uncertainty matters;
- execute safe reads automatically;
- show progress;
- produce previews;
- request approval where needed;
- resume/track outcome.

Deterministic playbooks and model-driven tool use may coexist. Do not force every workflow into an LLM loop.

### Tool / Capability Registry

The Agent should operate through reusable capabilities, for example:

```text
search
retrieve
read_entity
resolve_entity
inspect_schema
parse_document
map_dataset
transform_data
compare_sources
create_draft
propose_import
upsert_records
create_task
create_feature_request
send_notification
schedule
start_workflow
check_outcome
```

Tools should be narrow, typed, permissioned, observable and testable.

Avoid arbitrary model-generated SQL or unrestricted database writes.

### Policy / Action Layer

The model may understand or plan; deterministic policy must protect execution.

Examples:

```text
READ / SEARCH
→ auto when authorized

PREPARE / DRAFT / MAP
→ auto prepare, show preview

LOW-RISK WRITE
→ explicit user confirmation

SENSITIVE WRITE
→ stronger approval or unavailable
```

ERP remains the authority for mutations.

### Learning / Evaluation Layer

Capture meaningful evidence from:

- user instruction;
- context used;
- tools selected;
- proposal;
- user edits;
- execution receipt;
- outcome;
- rating / correction;
- unresolved follow-up.

Feedback should remain an observation until explicitly promoted into approved knowledge or business rules.

---

## 7. Search should feel enterprise-wide, not module-by-module

A major product value is reducing search friction.

Current enterprise reality often looks like:

```text
ERP
+ Drive
+ Sheet
+ chat messages
+ someone else's memory
```

The target experience is:

```text
ask once
→ search authorized sources
→ resolve entities
→ return evidence-backed answer
```

The current retrieval implementation should therefore be audited for multilingual/Bahasa Indonesia quality, embedding-version compatibility, source scoping, entity matching and relationship-aware ranking.

The independent audit in doc 13 already identified that lexical retrieval currently uses an English text-search configuration and that generation/embedding configuration is coupled. These are important constraints for a real enterprise-search experience and should not be dismissed as cosmetic follow-up work.

---

## 8. The Intelligence Console should become a visible "brain"

If the Intelligence web remains, its value should be obvious and non-redundant with ERP.

A stronger conceptual information architecture could be:

```text
Brain Overview

Memory
├─ Documents
├─ Knowledge
├─ Decisions
├─ Lessons
└─ Sources

Knowledge / Entity Graph
├─ Clients
├─ Projects
├─ People
├─ Opportunities
├─ Contracts
└─ Relationships

Ingestion
├─ Uploads
├─ Sheets
├─ APIs
├─ Databases
├─ Mappings
└─ Failed / ambiguous items

Agent
├─ Runs
├─ Steps / Tools
├─ Playbooks
├─ Automations
└─ Approvals

Models
├─ Providers
├─ Routing
├─ Usage
└─ Evaluations

Learning
├─ Feedback
├─ Outcomes
├─ Corrections
└─ Proposed Knowledge

System
├─ Connectors
├─ Health
└─ Audit
```

This is a direction for exploration, not a demand to redesign the entire web immediately.

The important distinction is:

> ERP is where people operate the business. The Intelligence Console is where trusted users inspect, govern and evolve the brain.

---

## 9. How doc 13 should be interpreted

`docs/13-celerates-agent-audit-and-recommendation.md` is valuable and should remain.

It is best interpreted as:

- a grounded audit of what really exists;
- a safe first engineering slice;
- useful identity/action/tooling proposals;
- a concrete Sales demonstration.

It should **not** be interpreted as the final product boundary.

Keep the strongest recommendations from doc 13:

- ERP-issued short-lived user delegation;
- Agent authority = ERP user authority ∩ tool allowlist ∩ current context;
- typed tool registry;
- ERP-held proposals and ERP-side execution;
- idempotent receipts;
- persisted agent runs/steps/outcomes;
- embedded panel;
- model is not the source of truth;
- useful degraded mode without a model.

But do not make Sales Opportunity / Pre-Sales the center of the platform. It should be one proving workflow among several domains.

---

## 10. What should be showable to stakeholders

A stakeholder should not leave the demo thinking:

> "Celerates added a chatbot."

They should understand:

> "Celerates now has a shared Intelligence Layer. I can ask across the business, provide new data or documents and have the system understand them, prepare safe operational actions, execute through ERP with human control, and preserve outcomes as organizational memory."

A strong demo surface combines:

- existing proactive `Perlu perhatian`;
- contextual suggestions;
- typed or voice command;
- evidence-backed search/investigation;
- visible source types;
- preview before write;
- ERP confirmation/action;
- outcome / follow-up;
- Brain Console showing the underlying memory / ingestion / run / provenance.

---

## 11. Product-value hypotheses to validate

The platform should materially reduce:

### Search friction

From many systems and people → one authorized search surface.

### Data-entry / migration friction

From manual Excel/Sheet mapping → inspect → infer mapping → review → controlled import.

### Knowledge loss

From tacit knowledge and scattered documents → governed organizational memory with provenance.

### Operational handoff latency

From noticing → messaging → manually creating follow-up → remembering again,

toward:

```text
system detects or user asks
→ Agent investigates
→ proposes action
→ user confirms
→ system executes
→ outcome tracked
```

### Repetitive coordination work

Reminders, summaries, worklists, follow-up and status synthesis should increasingly be generated from real operational context.

These are hypotheses to validate with actual users and workflows; do not claim measured business impact before evidence exists.

---

## 12. Open exploration questions for the next strong implementation agent

The next implementer should not merely implement doc 13. Audit the repository against this broader operating model and answer at least:

1. What is the minimum generalization needed to make current Pre-Sales-shaped context/run/outcome primitives subject-generic without rewriting the foundation?
2. How should universal search span ERP facts, knowledge, documents and relationship context while preserving authorization and provenance?
3. What entity-resolution model is sufficient now: relational canonical IDs and edges, or is a graph database actually justified?
4. What connector/ingestion architecture best supports files, Sheets/Excel/CSV, APIs and future enterprise sources without one bespoke pipeline per source?
5. How can schema inference and mapping proposals be generic while ERP-side validation remains deterministic?
6. Which initial tools demonstrate breadth across at least two domains without exploding scope?
7. How should the existing `Perlu perhatian` rules become proactive Agent signals while keeping known conditions deterministic?
8. How should `Masukan` evolve into intent-aware correction / Feature Request / knowledge feedback / Agent feedback?
9. How should typed and voice commands share the same Agent run and authorization model?
10. Which speech-to-text approach gives acceptable Indonesian accuracy, privacy, latency and portability?
11. How should the Agent expose evidence types in the UI so users can distinguish ERP fact, document, approved knowledge, observation and inference?
12. What should stay in ERP versus Intelligence versus Brain Console?
13. How should model-provider evaluation begin early enough to inform tool/orchestration design without making the system dependent on an LLM?
14. How should Indonesian/multilingual retrieval and embedding-version migration be corrected before claiming enterprise-wide search?
15. What is the smallest shared-platform increment that can demonstrate the three Golden Journeys without implementing three bespoke workflows?

---

## 13. Instruction for Opus / Astra / Fable / another implementation agent

Treat this document as product intent and system direction, not as a rigid ticket.

Before proposing implementation:

- read the repo and runtime evidence;
- read docs 10–14 and ADRs;
- inspect current ERP, Operational Assistance, Intelligence API/worker/web, knowledge/context/outcome code and deployment boundaries;
- identify where this north star is supported or contradicted by the implementation;
- challenge assumptions;
- prefer shared capabilities over one-off features;
- preserve the trusted ERP/knowledge/action boundaries already proven;
- avoid broad rewrites where thin generalization is enough.

Then recommend the strongest next increment that moves the product toward a reusable enterprise-intelligence operating model and makes at least one meaningful cross-source/cross-action journey demonstrable.

Do not reduce the problem to "build a Sales chatbot".

Do not overbuild a theoretical platform with no visible workflow.

The desired balance is:

```text
shared substrate
+
visible business value
+
controlled action
+
measurable outcome
```
