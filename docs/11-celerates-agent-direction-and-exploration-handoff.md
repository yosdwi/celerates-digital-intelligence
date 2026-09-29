# Celerates Agent — Product Direction and Exploration Handoff

Date: 2026-09-26

Status: **directional handoff, not a strict implementation specification**

This document captures the current product thinking after the first governed closed-loop Intelligence foundation was implemented and deployed. It is intentionally written to support handoff to another strong engineering/reasoning agent (for example Astra, Claude Opus, Fable, or another implementation agent) without forcing that agent to blindly reproduce a predetermined design.

The implementer is expected to inspect the repository, current runtime, existing ERP behavior, existing Intelligence foundation, user flows, and relevant reference products before deciding the best concrete implementation.

If repo evidence suggests a better architecture or interaction model than what is proposed here, improve it. Preserve the intent and safety boundaries, not every example.

---

## 1. Why the direction changed

The first ERP embedded `Bantuan Operasional` increment was useful because it proved that the ERP can surface deterministic operational attention and capture contextual feedback without redesigning existing modules.

However, that surface is currently limited mainly to:

- showing conditions that need attention;
- explaining deterministic rules;
- navigating users to existing ERP pages;
- submitting contextual Feature Requests.

That is valuable, but it is not enough to represent the wider Celerates Intelligence vision.

The broader product direction is now:

> **Move from a passive help panel into an embedded agentic operating layer that can understand context, reason with governed knowledge, inspect ERP state, use controlled tools, prepare work, request approval, execute allowed actions, verify outcomes, and feed the result back into the Intelligence learning/evaluation loop.**

The goal is not to add a chatbot to ERP.

The goal is to make the ERP progressively easier to operate because the system can actively help users do the work.

---

## 2. Current product topology: why there are two web applications

Today there are two intentional web surfaces.

### A. Celerates ERP

This is the operational application and intended source of truth.

Users operate real workflows here across areas such as:

- Marketing;
- Sales;
- Talent Acquisition;
- HR;
- Talent Management;
- PMO;
- Finance;
- Timesheet;
- Attendance;
- approvals;
- documents;
- Task Board;
- Feature Request;
- other operational modules.

ERP owns authoritative business state, permissions, workflow transitions, commercial/HR records, and controlled write actions.

### B. Celerates Digital Intelligence Workspace

This is currently a workbench/control surface for the Intelligence system.

It contains or is evolving toward capabilities such as:

- Pre-Sales Intelligence;
- governed Knowledge;
- Outcomes & Feedback;
- source/integration visibility;
- workflow review;
- context/evaluation evidence;
- Intelligence governance and observability.

This second web app should not be interpreted as a second operational ERP product.

A better mental model is:

```text
Celerates ERP
= where operational work happens

Celerates Intelligence Workspace
= where Intelligence knowledge, review, governance, evidence and specialized workbench flows are managed
```

Most normal users should not eventually need to leave ERP merely to access Intelligence assistance.

The Intelligence Workspace can remain valuable for curators, reviewers, advanced Pre-Sales users, admins, evaluators, and future Intelligence operations.

---

## 3. Current shared Intelligence foundation already exists

Do not restart this architecture from zero.

The current branch and deployment already contain the first governed closed-loop foundation.

At the time of this handoff, the relevant branch is:

```text
audit/erp-production-readiness
```

The implementation and deployment records should be re-read before changing anything, especially:

- `docs/10-closed-loop-intelligence-and-erp-maturity.md`
- `docs/implementation/closed-loop-foundation.md`
- `docs/implementation/closed-loop-operations.md`
- `docs/adr/ADR-007-governed-closed-loop-foundation.md`
- `packages/contracts/erp-http.md`
- the current ERP integration implementation;
- the current Intelligence API, worker, Knowledge, Context and workflow code.

The existing foundation already includes important primitives.

### Governed knowledge

The system now supports reusable knowledge with concepts such as:

- company/division/opportunity scope;
- classification;
- immutable source versions;
- checksums;
- explicit approval;
- active/superseded/deprecated lifecycle;
- object storage;
- parsing/chunking;
- PostgreSQL FTS;
- pgvector retrieval;
- provenance.

### Reusable Context Builder

The current context work separates different kinds of information rather than blending everything into one opaque prompt.

Conceptually:

```text
operational ERP facts
+
source evidence
+
approved reusable knowledge
+
prior observations/outcomes
+
policy/workflow versions
```

The context can be persisted with a digest so the system can later explain what information a workflow used.

### Controlled ERP contract

The Intelligence service no longer needs direct database write access to ERP.

A bounded machine contract now supports the beginning of:

```text
READ
EVENT
REVIEW
COMMAND
RECEIPT
```

with important controls around machine identity, read/action separation, record grants, source version, human approval, idempotency and receipts.

### First closed-loop workflow

Pre-Sales is the first implemented vertical slice.

The current conceptual loop is:

```text
ERP Sales Opportunity
        ↓
explicit Intelligence access
        ↓
source/TOR evidence
+
approved knowledge
        ↓
context build
        ↓
Pre-Sales output/artifacts
        ↓
human review
        ↓
ERP approval
        ↓
controlled idempotent ERP action
        ↓
receipt
        ↓
outcome
        ↓
feedback/correction
        ↓
proposed lesson
        ↓
explicit knowledge approval
```

This is the beginning of a real closed loop, not just RAG.

---

## 4. Current limitation: the user-facing Intelligence experience is still fragmented

The foundation is stronger than the current user experience.

At present:

- ERP has `Bantuan Operasional`;
- the Intelligence Workspace is a separate app;
- the production Intelligence Workspace currently has its own named workspace access credential;
- the ERP and Intelligence systems correctly fail closed, but this creates a temporary double-authentication/product-fragmentation experience.

The manual workspace token flow is acceptable as a secure pilot baseline, but it should not become the normal final user journey.

A user already authenticated in ERP should eventually be able to access Intelligence capabilities without copying a long-lived shared secret into the browser.

This is particularly important before the embedded Agent becomes the primary interaction surface.

---

# 5. Product direction: Celerates Agent

The next product concept is **Celerates Agent**.

The working name can still change after exploration. The more important idea is the role it plays.

Celerates Agent should be an **embedded agentic interface to the shared Celerates Intelligence Layer**.

It is not intended to become a third standalone web application.

The preferred product direction is:

```text
ERP page
   │
   ├─ current authenticated user
   ├─ current role / authorization
   ├─ current page/module
   ├─ current record/entity
   └─ current operational state
   │
   ▼
Celerates Agent
   │
   ▼
Shared Intelligence Layer
   ├─ Context Builder
   ├─ Governed Knowledge
   ├─ Model Gateway
   ├─ Workflow / orchestration
   ├─ Tool registry
   ├─ Policy / approval
   └─ Outcome / evaluation
   │
   ▼
Controlled ERP tools/actions
```

The Agent should feel like it belongs inside the ERP rather than redirecting normal users into a separate AI product.

---

## 6. Interaction direction

A visual interaction reference discussed by the product owner is a compact floating entry point that expands into a richer agent panel.

The desired quality is approximately:

- minimal launcher when closed;
- polished/cinematic sense of motion and presence;
- useful suggested actions before the user types anything;
- contextual awareness of the current ERP page;
- natural instruction input;
- visible progress when the agent investigates or uses tools;
- clear previews before meaningful writes;
- clean result/action states;
- does not cover or redesign the core ERP unnecessarily.

Do not treat any reference screenshot as a pixel-perfect clone requirement. Study modern enterprise agent/copilot patterns and the existing Celerates ERP visual language, then create an interaction that feels native to the product.

The current `Bantuan` launcher may evolve into this surface, but the implementer should inspect whether evolving the existing component or introducing a cleaner internal abstraction is the better engineering decision.

---

# 7. What the Agent should eventually be able to do

Do not interpret “agent” as “free-form chat with database access”.

The value comes from **tool-backed operational capability**.

Potential capability families include the following.

### Ask / explain

Examples:

- explain why a workflow is blocked;
- summarize this opportunity;
- show what changed;
- explain which documents or facts support a recommendation;
- answer questions using exact ERP facts plus governed knowledge.

### Investigate / audit

Examples:

- audit this opportunity;
- identify missing requirements;
- inspect incomplete handoffs;
- find missing documents;
- inspect an onboarding/contract/billing flow for blockers;
- detect inconsistent or incomplete operational state.

### Prepare

Examples:

- prepare a Pre-Sales pack;
- draft a reminder;
- prepare a Feature Request;
- prepare an extension request;
- build a management summary;
- prepare a filtered worklist;
- draft a follow-up task.

### Act

Examples, only through controlled tools/policies:

- create a task;
- create a Feature Request;
- create a reminder;
- attach an approved artifact reference;
- start a safe workflow;
- create a draft ERP object;
- perform other allowlisted actions as maturity grows.

### Monitor / automate

Future capabilities may include:

- event-driven exception detection;
- proactive suggestions;
- scheduled follow-up;
- safe playbook automation;
- escalation under explicit policy.

The implementer should not attempt to support all of these in the first Agent increment.

Choose a coherent, demonstrable initial toolset after auditing the existing code and workflows.

---

# 8. Suggested agent maturity model

This is a useful way to think about progressive capability, not a mandatory release plan.

```text
Level A — Assist
Q&A, explain, summarize, contextual suggestions

Level B — Investigate
Audit, inspect blockers, identify missing context, gather evidence

Level C — Prepare
Prepare draft work products or proposed actions

Level D — Execute with approval
Perform allowlisted ERP actions after explicit confirmation/review

Level E — Policy-controlled automation
Run selected high-confidence playbooks proactively or automatically
```

The system should be able to expand in breadth over time without pretending every workflow is already safe for autonomous execution.

---

# 9. Model Gateway role

The Agent should not bind product behavior directly to one model vendor.

The repo already has the beginning of a Model Gateway direction. Continue that abstraction rather than embedding provider-specific behavior everywhere.

Potential providers may include OpenAI, Anthropic, Gemini, self-hosted/open models or future providers.

The model is useful for capabilities such as:

- reasoning;
- planning;
- summarization;
- language generation;
- tool selection;
- synthesis of retrieved evidence.

The model must **not** become the source of truth for ERP state.

Exact business facts should continue to come from typed/controlled ERP reads or other authoritative sources.

A strong architecture should make it possible to evaluate or switch model providers without changing the business contracts.

---

# 10. Tool-use is the core of the Agent

The most important technical evolution is likely a reusable tool/action layer.

Possible categories:

```text
ERP READ TOOLS
- get opportunity
- get requisition
- get employee/assignment
- get contract
- get invoice/BAST
- get finance handoff
- get workflow status

CONTEXT / KNOWLEDGE TOOLS
- build governed context
- retrieve approved knowledge
- inspect source provenance
- retrieve prior reviewed outcome

INVESTIGATION TOOLS
- audit workflow
- identify missing fields/evidence
- detect blockers/exceptions

PREPARATION TOOLS
- prepare Pre-Sales output
- draft reminder
- draft task
- structure Feature Request

ERP ACTION TOOLS
- create allowed draft/work item
- attach approved reference
- create task/reminder
- other allowlisted commands
```

Do not build arbitrary SQL tools for the model.

Prefer narrow, typed, explainable tools that can be permissioned and tested.

---

# 11. Approval and action policy

Agentic capability should not mean uncontrolled mutation.

A useful product policy might distinguish classes of action such as:

```text
READ / EXPLAIN
may execute automatically when authorized

NAVIGATE / FILTER
may execute automatically

PREPARE / DRAFT
may execute and show preview

LOW-RISK WRITE
explicit user confirmation

SENSITIVE / HIGH-IMPACT WRITE
stronger approval workflow or not available to the Agent
```

Examples of sensitive areas include commercial values, payroll, signatures, hiring decisions, payment states, and destructive changes.

The current ERP contract and review/idempotency guarantees should be treated as useful foundations, not bypassed for convenience.

---

# 12. Identity direction before broad Agent rollout

The current named workspace token is a deliberate secure pilot boundary, but it is poor normal-user UX.

Explore a proper ERP-to-Intelligence identity bridge.

The desired experience is closer to:

```text
ERP authenticated session
        ↓
server-mediated identity/session exchange
        ↓
short-lived Intelligence identity
        ↓
role/scope derived from authoritative access
        ↓
Agent / Intelligence tools
```

Avoid exposing long-lived machine/workspace secrets to normal browser users.

Do not assume full company SSO must be built immediately. A secure first-party session handoff may be sufficient for the next increment if it fits the current architecture.

The implementation agent should study the existing NextAuth/session model, ERP role model, Intelligence principal model, deployment topology, and threat boundaries before choosing the mechanism.

---

# 13. Agent runs should become part of the closed loop

The Agent should not only produce an answer and forget it.

A mature run can eventually capture something like:

```text
user instruction
↓
identity / page / entity context
↓
context snapshot
↓
model / workflow / prompt version
↓
tools selected
↓
tool inputs + bounded outputs
↓
proposal / result
↓
human confirmation / correction
↓
ERP command + receipt (if any)
↓
outcome
↓
feedback / evaluation
```

This is useful for:

- traceability;
- evaluation;
- debugging;
- prompt/workflow improvement;
- retrieval improvement;
- understanding common user corrections;
- future automation confidence;
- discovering ERP/product gaps.

Do not automatically convert every conversation or correction into approved knowledge.

Keep the current distinction between operational truth, approved knowledge, and observations/learning signals.

---

# 14. Example future experiences

These are examples to communicate intent. They are not a mandatory feature list.

### Sales

User is viewing an opportunity.

Suggested actions could include:

```text
Audit opportunity
Prepare Pre-Sales
Find requirement gaps
Summarize TOR
Prepare follow-up
```

An audit might combine ERP state, source evidence and approved knowledge, then show which items are verified, missing or ambiguous.

### PMO

User is viewing an invoice/project flow.

Possible Agent actions:

```text
Audit billing
Explain blocker
Check missing evidence
Prepare Finance handoff
Draft reminder
```

The Agent may inspect contract, schedule, BAST, project documents and handoff state through controlled tools, then explain the blocker and propose a next action.

### Talent Management

Possible future capabilities:

```text
Find promoted employees missing assignment setup
Review contracts ending soon
Prepare extension review
Summarize staffing exceptions
```

Again, the first implementation does not need to cover every module.

---

# 15. What should remain separate

Do not collapse everything into one monolith merely to make the Agent easier to code.

The current separation is useful:

```text
ERP
= authoritative operational system

Intelligence service
= context / knowledge / orchestration / evaluation

Intelligence Workspace
= specialist governance/workbench surface

Embedded Agent
= primary contextual interaction surface for ERP users
```

The Agent should consume the Intelligence foundation; it should not duplicate its own independent retrieval, memory and business logic inside the ERP frontend.

Likewise, Intelligence should not silently take ownership of ERP business state.

---

# 16. Parallel ERP maturity remains important

The Agent is not an excuse to stop improving ERP.

ERP maturity and Intelligence maturity should continue in parallel.

Examples of ongoing ERP concerns include:

- workflow correctness;
- source-of-truth cleanup;
- identity consistency;
- historical profitability/versioning;
- scheduled jobs instead of read-triggered writes;
- security/RBAC;
- production operations;
- BA requirement refinement;
- source cutover from transitional spreadsheets/silos.

A good Agent can help reveal these gaps, but it should not hide them behind generated explanations.

---

# 17. What the next implementation agent should do

Do not start by blindly coding this document.

First:

1. inspect the latest branch/commit and deployed services;
2. read `AGENTS.md`, relevant handoffs, architecture docs, ERP audit docs, ADRs, and the closed-loop implementation record;
3. inspect the current ERP `Bantuan Operasional`, navigation/layout, auth/session handling, machine contract, Intelligence API, Context Builder, knowledge lifecycle, workflow/outcome models, Model Gateway and web workspace;
4. verify what is actually deployed rather than assuming documentation is perfectly current;
5. study the product references and current enterprise agent/copilot interaction patterns where useful;
6. identify the smallest coherent Agent increment that proves the architecture without becoming a toy chatbot.

Then propose and execute the strongest practical next step.

The implementer is encouraged to challenge the current ideas if repo/runtime evidence supports a better solution.

Good questions to answer before implementation include:

- Should the existing `Bantuan Operasional` component evolve directly into the Agent shell, or should it consume a cleaner new internal Agent UI abstraction?
- What is the best secure ERP → Intelligence identity/session bridge for the current topology?
- Which initial toolset demonstrates real operational value without creating unsafe breadth?
- Should Agent orchestration reuse the current LangGraph workflow layer directly, introduce a general tool orchestration abstraction, or combine both?
- How should tool permissions map to ERP roles and current record/module context?
- What should be synchronous versus worker-driven?
- How should streaming/progress/tool-use be represented in the embedded UI?
- Which model gateway/provider configuration is appropriate for the first live-model evaluation?
- What evidence should be stored for every Agent run?
- Which write actions are safe enough for the first end-to-end Agent demonstration?
- How can the Agent remain useful when the model provider is unavailable?

---

# 18. Suggested first Agent milestone — directional, not locked

A reasonable first milestone may look like:

```text
ERP authenticated user
        ↓
opens embedded Celerates Agent
        ↓
Agent knows current module/page/entity
        ↓
shows context-aware suggested actions
        ↓
user asks for an investigation/audit
        ↓
Agent builds governed context
        ↓
uses typed ERP + knowledge tools
        ↓
returns evidence-backed result
        ↓
user asks Agent to prepare one safe action
        ↓
Agent shows preview
        ↓
user confirms
        ↓
controlled idempotent ERP action
        ↓
receipt / outcome recorded
```

One good demonstration may be Sales/Pre-Sales because the shared foundation already exists there, but the implementer should evaluate whether another existing ERP workflow produces a stronger demonstration with less special-case code.

The milestone should feel materially more capable than the current static `Bantuan` panel.

---

# 19. Product success criteria

The desired user reaction is not:

> “There is an AI chatbot in ERP.”

It is closer to:

> “The ERP understands what I am working on, can investigate the situation, brings the right evidence, prepares the next work, and can safely execute what I approve.”

From a platform perspective, success means that new Intelligence applications can increasingly reuse:

```text
Identity
+
Context
+
Knowledge
+
Model Gateway
+
Tools
+
Approval
+
Outcome/Evaluation
```

rather than implementing a separate mini-AI stack per feature.

---

# 20. Guardrails that should not be casually removed

Preserve these unless there is a strong, documented reason to change them:

- ERP remains authoritative for operational truth;
- no arbitrary model-generated SQL against business databases;
- no silent direct mutation of sensitive ERP state;
- meaningful writes remain bounded, permissioned and idempotent;
- human approval remains available where risk warrants it;
- feedback is not automatically promoted into trusted knowledge;
- approved knowledge retains provenance/versioning;
- PII/payroll/commercial access follows authorization boundaries;
- model-provider output is not treated as factual authority;
- existing production data/volumes must not be destroyed during experimentation;
- existing stable ERP workflows should not be broadly rewritten just to accommodate the Agent.

---

# 21. Final mental model

The current product direction can be summarized as:

```text
                         CELERATES ERP
                    authoritative operations
                              │
                              │
                    embedded Celerates Agent
                              │
                              ▼
                  CELERATES INTELLIGENCE LAYER

             Identity / Authorization / Context
                        │
              Governed Knowledge
                  FTS + pgvector
                        │
                   Model Gateway
                        │
              Agent / Workflow Orchestration
                        │
                     Tool Registry
                        │
               Policy / Human Approval
                        │
                  Controlled ERP Action
                        │
                Receipt / Outcome / Feedback
                        │
                   Evaluation / Learning


        Intelligence Workspace remains available for:
        knowledge · review · governance · outcomes · observability
```

The closed-loop foundation is the engine.

Celerates Agent is the emerging operating interface to that engine.

ERP remains where the business actually runs.

---

## Handoff note for the next agent

Treat this document as high-context product intent, not an order to implement every box.

Explore the repository deeply, validate current behavior, identify weaknesses in this proposal, and improve the architecture where appropriate.

Prefer one genuinely functional, well-governed agentic vertical slice over a broad collection of mocked “AI” features.

Do not stop at a conceptual plan if implementation is requested. Build, test, integrate and demonstrate the resulting workflow end-to-end, while documenting important decisions and unresolved trade-offs for the next handoff.
