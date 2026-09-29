# Celerates Reference Product Study — ERP + Intelligence Rework

**Research date:** 2026-09-24  
**Purpose:** use mature enterprise products as references for product architecture, workflow, and embedded intelligence patterns. This is not a feature-copy exercise and does not change Celerates' canonical architecture decisions.

## 1. Why this study exists

Celerates already has a broad ERP baseline covering Marketing, Sales, Talent Acquisition, HR, Talent Management, PMO, Finance, Timesheet, Attendance, Automation, dashboards, document workflows, and related support functions.

The next question is therefore not "what more modules should we add?". The more important question is:

> How should the existing ERP be reworked so it becomes the trusted operational foundation for one reusable Celerates Intelligence Layer, while keeping intelligent experiences embedded in the same user workflow?

The reference pattern we are looking for is:

```text
Operational System of Record
        +
Trusted business context
        +
Shared intelligence / agent layer
        +
Controlled tools and actions
        +
Embedded user experience
```

The desired Celerates outcome remains:

```text
Celerates ERP
Digital Operational Core
        ↓
Controlled READ / EVENT / ACTION contract
        ↓
Celerates Intelligence Layer
Context & Knowledge • Intelligence Core • Model Gateway
        ↓
Intelligent Experiences
Pre-Sales • Exceptions • Human Services • Management Intelligence
        ↓
Human / controlled action
        ↓
ERP state updated
```

The ERP and Intelligence Layer should be **logically separated but product-integrated**. Users should not need to manually switch between an ERP and a separate generic AI application for normal workflows.

---

## 2. Reference products and what Celerates should learn

### 2.1 Certinia Professional Services Cloud + Veda AI

**Why it matters**

Certinia is the closest overall reference for Celerates' professional-services operating model. Certinia positions Professional Services Cloud as a connected lifecycle across sales, staffing, delivery, billing, financials, and renewal. Veda adds agentic and intelligent capabilities on top of the connected operational foundation.

**Useful pattern**

```text
Sell
 ↓
Estimate / Scope
 ↓
Staff
 ↓
Deliver
 ↓
Time / Project control
 ↓
Bill / Financials
 ↓
Renew / Grow
```

**Pattern to adopt, not product to copy**

- one connected services lifecycle;
- sales context continues into delivery instead of being re-entered;
- resource/talent information is operational, not just HR master data;
- project health, margin, staffing and billing share the same business context;
- AI is grounded in the connected services data and executes within permissions / approval thresholds;
- AI can be surfaced natively or headlessly while retaining the same underlying context.

**Celerates mapping**

```text
Sales / Opportunity
     ↓
Pre-Sales Intelligence
     ↓
TA / Talent / Capability
     ↓
PMO / Project / Allocation
     ↓
Timesheet / BAST
     ↓
Billing / Finance
     ↓
Management Intelligence
```

**Primary lesson:** the differentiator is not a chatbot. It is continuity of business context across the services lifecycle.

Official references:
- https://www.certinia.com/solutions/professional-services-cloud/
- https://www.certinia.com/solutions/veda-ai
- https://www.certinia.com/blog/certinia-unveils-system-of-action-for-services-and-largest-expansion-of-veda-ai-to-date/

---

### 2.2 Microsoft Dynamics 365 Project Operations + Copilot

**Why it matters**

Dynamics 365 Project Operations is a strong reference for how sales, resourcing, project management, time/expense and finance can form one project-centric operational lifecycle.

**Useful pattern**

```text
Opportunity / Quote
       ↓
Project estimate
       ↓
Resource planning
       ↓
Project execution
       ↓
Time / Expense / Actuals
       ↓
Invoice / Revenue / Finance
```

Project Copilot is contextual to the project scope and assists with task planning, risk assessment and status reporting rather than acting as a disconnected generic chat box.

**Celerates mapping**

- Sales opportunity → PMO project handoff;
- talent/resource planning should be tied to skills, availability and project demand;
- project financial state should be deterministic and traceable;
- AI should summarize/explain project context, not become the source of financial truth;
- project/workspace-level intelligence is preferable to forcing users to provide context manually.

**Primary lesson:** operational truth and financial/project transactions remain deterministic; Copilot sits in context of those records.

Official references:
- https://learn.microsoft.com/en-us/dynamics365/project-operations/welcome-to-project-operations
- https://learn.microsoft.com/en-us/dynamics365/project-operations/project-management/copilot-features
- https://learn.microsoft.com/en-us/dynamics365/project-operations/actuals/actuals-overview

---

### 2.3 Bullhorn ATS/CRM + Amplify

**Why it matters**

Bullhorn is highly relevant to Celerates' Talent Acquisition, staffing, candidate, job/requisition and client workflows. Bullhorn describes its ATS/CRM as one source of truth for staffing operations, while Amplify operates on the staffing records and can answer questions or trigger actions.

**Useful pattern**

```text
Client / Job demand
        ↓
Candidate / Talent pool
        ↓
Search / Match / Screen
        ↓
Submission / Hiring
        ↓
Placement / Relationship
```

**Celerates mapping**

- Client / Opportunity / TA Requisition should not become disconnected entities;
- Candidate → hired person → employee/talent identity should have explicit lineage;
- skills/capability data must be operational enough to support matching;
- AI chat should understand current job, candidate and client context;
- actions initiated by AI should use controlled application operations, not direct database writes.

**Primary lesson:** for staffing use cases, AI becomes valuable when it is grounded in canonical candidate/job/client records and can act inside the system of record.

Official references:
- https://www.bullhorn.com/products/applicant-tracking-crm/
- https://www.bullhorn.com/products/amplify/

---

### 2.4 ServiceNow Now Assist + AI Agents

**Why it matters**

ServiceNow is the strongest workflow reference for Celerates Exception Management, Action Center and human escalation. Its architecture separates workflow state from AI assistance and agentic execution.

Now Assist augments workflows with generation, summarization and search, while AI Agents can perform tasks using defined roles, instructions and tools. Agentic workflows orchestrate one or more agents toward a defined outcome.

**Useful Celerates pattern**

Instead of a generic exception chatbot:

```text
BAST #123
Status: Pending 5 days

Exception
- reason
- impact
- owner
- source evidence
- SLA / due date

Suggested actions
[Remind]
[Escalate]
[Assign]
[Open business record]
```

AI can explain and prepare actions; the exception itself should usually be generated from deterministic ERP state/rules/events.

**Celerates mapping**

- BAST delay;
- contract expiry;
- missing timesheet;
- invoice overdue;
- approval bottleneck;
- project/SLA issue;
- talent/people-service cases.

**Primary lesson:** make intelligence part of a record/task/action workflow, not a separate conversation-only experience.

Official references:
- https://www.servicenow.com/industries/technology-providers.html
- ServiceNow AI Agents Prompting Guide / Now Assist documentation

---

### 2.5 Salesforce Agentforce + Data 360

**Why it matters**

Salesforce is the strongest architectural reference for a shared intelligence/agent platform operating on trusted business data, metadata, workflows and actions.

Agentforce combines business data/context, deterministic logic, adaptive AI, observability, security and application actions. The important point for Celerates is not the Salesforce product itself; it is the separation between:

```text
trusted business data
        ↓
context / metadata
        ↓
reasoning / AI
        ↓
controlled actions / workflows
        ↓
observability and governance
```

**Celerates mapping**

```text
ERP structured truth
        +
approved documents / knowledge
        ↓
Context & Knowledge
        ↓
Intelligence Core
        ↓
Model Gateway
        ↓
ERP Tools / Actions
```

**Primary lesson:** do not make model calls the architecture. The durable value is trusted context, tools, workflows, permissions, observability and evaluation around the models.

Official reference:
- https://www.salesforce.com/platform/agentforce-platform/

---

### 2.6 Workday Illuminate

**Why it matters**

Workday is a useful reference for Human Services and employee-facing intelligence because HR facts, organizational context and service interactions share a governed system of record.

**Celerates mapping**

A Human Service assistant should distinguish between:

```text
"When does my contract end?"
→ structured ERP fact

"What is the reimbursement policy?"
→ knowledge retrieval

"Please request leave"
→ controlled workflow/action

"Why was this rejected?"
→ workflow state + policy/context explanation
```

**Primary lesson:** employee AI should be context-aware and permission-aware, not a generic RAG bot over every HR document.

Official reference:
- https://www.workday.com/en-us/artificial-intelligence.html

---

### 2.7 Oracle Fusion Applications AI Agents

**Why it matters**

Oracle is a useful reference for governance of AI actions inside transaction-heavy ERP domains. Its Fusion AI agents are embedded with access to enterprise data, workflows and application actions, with observability/evaluation capabilities.

**Celerates mapping**

- AI actions must respect ERP permissions and approval rules;
- critical writes should execute through application tools/contracts;
- financial, HR and contractual facts should not be invented by a model;
- actions and agent behavior must be observable and auditable.

**Primary lesson:** intelligence can act, but the operational system still governs what an action is allowed to do.

Official reference:
- https://www.oracle.com/applications/fusion-ai/

---

## 3. Combined reference model for Celerates

No single benchmark product maps exactly to Celerates. The useful combination is:

```text
BUSINESS / SERVICE LIFECYCLE
Certinia + Dynamics Project Operations

STAFFING / TALENT OPERATIONS
Bullhorn

EXCEPTION / ACTION WORKFLOW UX
ServiceNow

SHARED INTELLIGENCE ARCHITECTURE
Salesforce Agentforce + Oracle Fusion AI

EMPLOYEE / HUMAN SERVICE EXPERIENCE
Workday
```

That combination produces a clearer target than copying any one vendor.

---

## 4. What this means for the existing Celerates ERP

The existing ERP should **not** be treated as a temporary UI that will later be replaced by the Intelligence product.

It should become the Digital Operational Core.

The existing AI/chatbot/automation capabilities should be classified by ownership rather than automatically deleted or kept where they are today.

### Initial capability decomposition

| Existing capability | Target ownership | Initial action |
|---|---|---|
| Marketing / Lead | ERP Core | KEEP |
| Sales / Opportunity / Account | ERP Core | KEEP |
| TA Requisition / Candidate / Pipeline | ERP Core | KEEP, normalize identity relationships |
| Employee / HR | ERP Core | KEEP |
| Talent / skills / capability | ERP Core | KEEP, strengthen canonical data |
| PMO / Project / Contract / Billing | ERP Core | KEEP |
| Finance / Invoice workflow | ERP Core | KEEP |
| Timesheet / Attendance | ERP Core | KEEP |
| Google Sheet sync | Data Intake / Transition | REWORK / gradually retire per process |
| Document metadata | ERP Core | KEEP |
| Binary object storage | Shared Infrastructure | STANDARDIZE |
| Existing generic chatbot | Human Services / contextual assistant surface | REWORK |
| Existing AI generation logic | Intelligence Layer | EXTRACT |
| Reminder detection rules | Exception / Automation | REWORK |
| Notification delivery | Shared delivery capability | STANDARDIZE |
| Executive dashboard metrics | ERP / deterministic metric layer | KEEP |
| Management explanation / diagnosis | Management Intelligence | EXTRACT / BUILD |
| Feature request / product feedback | Product Ops / ERP | KEEP and extend context capture |
| Document generation | split by purpose | REVIEW / SPLIT |

This table is a hypothesis for the decomposition audit, not yet a final implementation decision.

---

## 5. Target product experience

Logical separation should not create user context switching.

### Example: Pre-Sales inside Opportunity

```text
Sales > Opportunity > PT ABC

Operational data
- client
- owner
- stage
- value
- requirement source
- timeline

Intelligence panel
- readiness
- missing requirements
- relevant experience
- capability/capacity fit
- risks / assumptions
- next actions

[Build Intelligence Pack]
[Draft Clarification]
[Review Risks]
```

The panel may be rendered by ERP, but the reasoning/retrieval/model workflow should run in the Intelligence Layer.

### Example: Exception inside PMO

```text
BAST / Contract / Invoice record
        ↓
Exception condition detected
        ↓
Context panel
- what happened
- business impact
- owner
- evidence
- deadline
- recommended next action
        ↓
controlled action
```

### Example: Human Service

```text
Structured fact       → ERP tool
Policy / procedure    → knowledge retrieval
Request / transaction → ERP action/workflow
Explanation           → Intelligence Layer using trusted evidence
```

### Example: Management

Deterministic metric first, explanation second.

```text
Metric / variance / exception
        ↓
[Explain]
        ↓
Intelligence combines trusted ERP facts + supporting context
        ↓
causes / owners / impact / actions / evidence
```

---

## 6. Architecture rules to lock before broad rework

1. **ERP remains authoritative for operational business state.**
2. **Intelligence does not become a parallel ERP database.**
3. **Current structured facts should be consumed as structured data, not copied blindly to vector storage.**
4. **Documents/knowledge can use extraction + hybrid retrieval where semantic retrieval is useful.**
5. **Model calls should sit behind a shared Model Gateway.**
6. **Existing AI logic embedded directly in ERP should migrate behind an Intelligence service boundary when practical.**
7. **ERP writes from Intelligence use controlled tools/actions, not arbitrary SQL.**
8. **Objective exceptions use deterministic rules/events; AI adds explanation/context/drafts.**
9. **AI surfaces can remain embedded in ERP UX.**
10. **Every intelligent action needs identity, permissions, provenance, traceability and evaluation appropriate to its risk.**

---

## 7. Proposed implementation sequence

The next work should not begin with a visual redesign or a chatbot rewrite.

```text
1. ERP CAPABILITY DECOMPOSITION
   KEEP / REWORK / EXTRACT / DEPRECATE / SHARED

2. REGRESSION + BUSINESS BASELINE
   prove what the imported ERP already does

3. CANONICAL ENTITY / DATA CONTRACT
   Person, Talent, Employee, Candidate, Client, Opportunity,
   Project, Contract, BAST, Invoice, Timesheet, etc.

4. ERP INTELLIGENCE CONTRACT
   READ / EVENT / ACTION

5. EXTRACT EXISTING AI LOGIC
   move model/retrieval/reasoning responsibilities behind
   the shared Intelligence Layer where appropriate

6. REBIND ERP INTELLIGENCE SURFACES
   contextual panel / chat / action center still visible in ERP

7. PRE-SALES REAL-DATA VERTICAL SLICE
   Opportunity + TOR/RFP + capability + history + human review

8. EXCEPTION MANAGEMENT

9. HUMAN SERVICES

10. MANAGEMENT INTELLIGENCE
```

---

## 8. What not to copy from reference products

The purpose of benchmarks is to reuse proven patterns, not vendor complexity.

Do **not** automatically copy:

- Salesforce's full platform/data-cloud footprint;
- ServiceNow's enterprise workflow configuration complexity;
- Dynamics/Dataverse dual-write architecture;
- Workday's HR suite breadth;
- Oracle Fusion's enterprise deployment model;
- every agent/autonomous workflow advertised by vendors.

Celerates should keep a smaller architecture that solves its actual service-business problems and remains portable to Railway/VPS infrastructure.

---

## 9. Success criteria for the Celerates rework

The rework is successful when:

- ERP users can run real operational workflows without relying on parallel sheets for migrated processes;
- canonical business entities are stable enough for Intelligence to consume;
- existing intelligent features use the shared Intelligence Layer rather than isolated model calls;
- users receive intelligence in the business context where they already work;
- Pre-Sales can produce an evidence-backed Intelligence Pack from real Opportunity context;
- Exception Management identifies deterministic operational issues and gives actionable context;
- Human Services answers and acts using the correct structured fact / knowledge / workflow source;
- Management Intelligence explains trusted metrics and exceptions rather than generating unsupported narratives;
- every controlled Intelligence action returns an auditable outcome to ERP.

---

## 10. Immediate follow-up deliverable

Use this study as input to an evidence-based **ERP Capability Decomposition Audit** of `apps/erp`.

For every current capability/module, produce:

```text
Capability
Current implementation evidence
Current business owner
Canonical source of truth
Target ownership:
  KEEP / REWORK / EXTRACT / DEPRECATE / SHARED
Reason
Dependencies
Regression risk
Target Intelligence contract if applicable
Suggested delivery phase
```

The result should become the bridge between the current Railway ERP pilot and the implementation roadmap for the shared Celerates Intelligence Layer.
