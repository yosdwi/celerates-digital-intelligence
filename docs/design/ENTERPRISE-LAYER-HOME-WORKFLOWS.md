# Enterprise layer: Quick Actions, Home and Workflows (definition, 2026-10-09)

Status: definition for the Product Owner's decision. Nothing here is built except Quick Actions over pages, which
shipped with the Crisp app shell (commit 52febf5).

The ask, from the Product Owner's Attio screenshots: a product that *feels* enterprise and intelligent:
- Quick Actions in the sidebar.
- A Home page.
- Automations that users create themselves ("auto sync, or whatever they need").

## 1. What exists today

| Piece | Where | What it can already do |
|---|---|---|
| Quick Actions (⌘K) | `components/erp-shell.tsx`, Crisp `Command` | Jump to any page the person may open; "Tanya Agent". **No record search, no "create" actions yet.** |
| Agent | `components/agent/*`, intelligence `cdi/agent` | Answers about ERP data with the person's own access; **proposals the person approves** (`agent_proposals`), voice, pilot feedback. |
| Workflow engine | intelligence `cdi/workflow.py` (LangGraph) | Multi-step runs with checkpoints and a **human review step** (`interrupt`), events log. Used for the opportunity intelligence run. |
| Scheduled jobs | ERP `lib/mail/sync.ts` (every 2 min); integration-worker | One hard-coded schedule (mail sync); no general scheduler for user rules. |
| Reminders | `/automation/reminders` | Fixed reminder rules with recipients (not a general builder). |
| Building blocks a workflow would call | Sales V2 actions | Sheet import/push (preview + commit), send email over SMTP, record history, notifications, AI form fill and extraction. |

## 2. Attio's pattern, in our terms

- **Home:** the person's day in one place: what needs them (tasks, stalled deals, unanswered mail), recent records,
  notifications, and an "Ask anything" box for the assistant.
- **Quick Actions:** one keyboard entry point for go-to, find a record, create a record, and run an action.
- **Workflows:** a trigger, then blocks (conditions and actions), with AI blocks as first-class steps. Every run is
  visible in a run log. Users build their own from templates.

## 3. Proposal (in phases)

**Phase 1: Quick Actions, complete (small).**
- Record search in ⌘K: Opportunity by client or Opty No, Account by name, PQ by number. It searches as the person
  types, under their access.
- Create actions: "Buat Opportunity", "Buat Account", "Buat PQ". Each opens the existing form.
- "Tanya Agent tentang halaman ini".

**Phase 2: Home "Hari ini" (medium).** It replaces Beranda for Sales users first.
- **Perlu tindakan saya:**
  - deals of my Sales PIC with no stage change or communication for N days;
  - client emails with no reply for 2 days;
  - Deal 360 "perlu tindakan" items.
- **Pipeline saya:** counts per stage and the weighted forecast. This is the same data as the planned Dashboard V2.
- **Terakhir dibuka:** recent records.
- **Notifikasi.**
- **Tanya apa saja** box: opens the Agent with the question.
- **Ringkasan pagi:** the Agent's short daily summary, generated once a day, cached, and readable without waiting.

**Phase 3: Workflows (large).**
- **Templates first, then a builder.** Users switch on and configure ready templates before any blank-canvas
  builder:
  1. **Sheet sync berkala:** pull from the connected sheet every N hours. It runs the same preview rules; error rows
     go to the run log, never silently.
  2. **Deal macet:** remind the Sales PIC when a deal has no movement for N days.
  3. **Win → TA:** when a deal moves to Win, notify TA and prepare a Requisition draft for review.
  4. **Email belum dibalas:** create a task or notification after N days.
  5. **Ringkasan mingguan:** an AI pipeline summary to each PIC and manager.
- **Model** (one table set, generic):
  - Triggers: record created or updated, stage changed, schedule, email received, sheet changed.
  - Conditions on record fields.
  - Actions: update a field, notify, create a task, send a templated email, sheet pull or push, an AI step
    (summarise, classify, extract), create a draft that needs approval.
- **Safety, which is what makes it enterprise:**
  - Each workflow has an owner and a scope.
  - Only Sales Full or Owner can create one.
  - Runs execute with the owner's access, never more.
  - A dry run comes before switching on.
  - A run log shows inputs, outputs and errors.
  - Rate limits and loop protection: a workflow can't trigger itself.
  - Anything that writes outside the ERP (email, sheet push) can require approval through the Agent's existing
    proposal flow.
- **Engine:**
  - Scheduled and event triggers run in the integration worker.
  - AI and multi-step runs reuse intelligence's LangGraph engine with its review step, so a human can approve
    mid-run.
- **Builder UI:** Crisp has a `flowcanvas` component (Attio-style canvas) for the later builder.

## 4. Recommendation and open decisions

- **Order:**
  1. Phase 1, small and visible every day.
  2. Phase 2, the "intelligent" first screen.
  3. Phase 3, starting with templates 1–3.
- Who may create workflows during the pilot: Owner only, or Sales Full too?
- Should the Home be the default start page for Sales users only, or for everyone?
