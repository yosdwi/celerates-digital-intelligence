# Integrations and the Workflow builder: design for discussion

Status: draft for discussion, 2026-10-09 (QA doc pages 24–25). Nothing here is built yet.

It extends `CONFORM-WORKFLOWS-AND-INBOX.md` (option A) with the owner's question: why are ConForm's syncs code, when they are "source → field mapping → destination"? And how can users build and customise their own workflows and reminders?

## 1. The principle: configurable at the edges, code at the core

ConForm's work has three layers (read from `digital_bast` on the VPS):

| Layer | ConForm today | In Celerates |
|---|---|---|
| **Ingest** | PAMA attendance from **SQL Server** (with an attendance-to-employee mapping), Redmine tasks from its **REST API**, IoT tasks from a **Google Sheet**, holidays and schedules | **Connectors with field mapping**, configured by an admin, as Sheet Import already works |
| **Business rules** | Payroll cycle (21st to 20th) readiness, attendance corrections with evidence and approval, the BAST gate and PDF, the canonical CSV | **Stays code** (versioned, tested). It is exposed to the builder as *system actions* with parameters (closing day, thresholds), not as user-editable logic. This is how SAP, Workday and Frappe treat payroll and compliance rules. |
| **Delivery and reminders** | WhatsApp campaigns and direct messages (dedupe, windows, kill switch, audit), PMO digests | **Builder actions**: users choose trigger, audience, template and channel; ConForm's governed sending stays underneath |

## 2. Building blocks

**Connector**: a source, its authentication and how to read it. The first ones are:
- Google Sheet (exists);
- CSV/XLSX upload (the Agent dataset import exists);
- SQL Server query (read-only account, parameterised query);
- REST API (Redmine first);
- webhook in.

A connector has a test button, last sync, row counts and errors.

**Mapping**: source columns to Celerates fields, plus value mapping (status words to codes) and parsers (money, date order, phone). This is today's Sheet Import `readConfig` v2 (`sheet-import.ts`), generalised. It keeps its existing features:
- auto-match by synonyms;
- the AI suggestion for unmatched columns;
- a preview with create, update and error rows;
- error rows that are listed, never dropped silently.

**Workflow**: trigger → conditions → actions, with every run logged step by step, as today's Workflows engine already does.
- **Triggers:**
  - schedule (exists);
  - record created or changed (Opportunity stage, PQ, candidate status…);
  - connector sync finished;
  - manual.
- **Conditions:** filters with the same filter model as the Sales V2 toolbar, so "deal tanpa komunikasi > 14 hari" reads the same in both places.
- **Actions:**
  - notify in-app (exists);
  - send email from a template (with the shared celeratesapps mailbox, Inbox phase 2);
  - send WhatsApp through a ConForm campaign or direct message;
  - create a task;
  - update a field;
  - run a connector sync;
  - generate a document (BAST and others via the Document Generator);
  - system actions (*Hitung kelengkapan payroll*, *Kirim ringkasan PMO*).
- **Templates** stay the quick start: today's four, plus "Reminder kelengkapan talent (WA)" and "Ringkasan PMO harian".

**Builder UI** (Attio Workflows): the FlowCanvas already in use. Each node opens a side panel to configure. Test run against sample records first, then Live. Run history stays as it is.

## 3. Moving ConForm without regressions (strangler)

For each ConForm flow, one at a time:
1. Build the connector and mapping in Celerates.
2. Run it in **shadow** for one payroll cycle: it writes to a staging table, and a nightly job compares rows and values with ConForm's result.
3. When the diff is zero (or every difference is explained and accepted), switch: Celerates writes for real, and the Prefect deployment is paused through the v1 `PUT /workflows/{name}` endpoint (option A).
4. Keep Prefect able to resume for one more cycle, then remove the flow.

Order, simplest first:
1. IoT sheet (a Google Sheet; the connector exists).
2. Holidays and schedules.
3. Redmine.
4. PAMA attendance (SQL Server; feeds payroll, so last and most carefully).

The business rules (layer 2) are not migrated. They stay in ConForm behind `/api/celerates/v1`, per ADR-019.

## 4. Phases and rough effort

| Phase | Content | Effort |
|---|---|---|
| A | ConForm flows visible in Workflows (3 additive v1 endpoints, list, runs, run now, pause) and the WhatsApp reminder action via campaigns | about 1 week |
| B | Blank builder: triggers, conditions, actions above, test run | 2–3 weeks |
| C | Connector framework: Sheet and CSV generalised, SQL Server, REST; mapping UI shared with Sheet Import | 2–3 weeks |
| D | Strangler moves, one flow per cycle | one payroll cycle each |

## 5. Questions for the owner
- Who builds workflows: any editor, or only Owner and division Full? (Today: Automation Full or Owner.)
- Does WhatsApp from user-built workflows go through ConForm campaign approval (four-eyes later), or are some templates pre-approved?
- PAMA's SQL Server: may Celerates get a read-only account directly, or must it stay behind ConForm?
