# 18 — Mobile/PWA shell: three concrete directions

Date: 2026-09-27
Status: §1–§10 are the discussion record. **§11–§14 (2026-09-27, evening) are the verified ERP inventory, the revised mobile IA and the MS1 scope that is implemented.** The visual foundation is locked to Iteration 1 · Jernih.
Branch: `audit/erp-production-readiness`, after M6.x (`48a4105`).
Inputs:
- the product discussion of 2026-09-27 (summarised in §1);
- the exploration baseline, [mobile-operational-shell-baseline.md](exploration/mobile-operational-shell-baseline.md);
- the current ERP implementation, inspected in code and captured at phone width (§2).

Sequencing: the Insight Agent (M7) is **on hold**. The Mobile/PWA shell is the next increment once a direction is chosen.

## 1. What was agreed

**Pilot.**
- Users: Owner and management.
- The architecture is **role-aware from day one**:
  - visible modules = the user's authority;
  - visible content = record and data authority, enforced on the server;
  - no per-role Home yet.
- Multi-role use is on the near roadmap but does not block the pilot. Access-rule discovery runs in parallel (§7).

**Three mobile behaviours**, equally first-class:
1. **Go to a module fast by tapping**: Talent, PMO, Sales, Contract, Timesheet, BAST… as far as RBAC allows.
2. **Check, review and respond**: records, Agent proposals, follow-ups (*tindak lanjut*) and feedback drafts (*masukan*), with confirm, reject or follow up.
3. **Find, capture and ask**:
   - search records and Company Files;
   - upload or photograph documents;
   - ask the Agent (questions, voice, cross-module questions, controlled actions).

**UX constraints.**
- Home is an **operational app home**, not a chatbot.
- The module launcher is **prominent**.
- The Agent is **one integrated capability**, easy to reach, **not the Home hero**.
- Proactive attention (*Perlu perhatian*) does not have to be the top hero.
- Company Files is a module capability; its placement is open.
- Not locked: bottom navigation, module arrangement, card hierarchy, role personalisation.
- The baseline image in the repository is a reference, not the final IA.

## 2. The current ERP at phone width

Captured on 2026-09-27 at 390 × 844, logged in as the Owner, with the synthetic data of the integration harness. The files are in `exploration/evidence/mobile-shell/`.

| Home | TA · Requisition | Company Files | Agent |
|---|---|---|---|
| ![](exploration/evidence/mobile-shell/current-home-390.png) | ![](exploration/evidence/mobile-shell/current-ta-requisition-390.png) | ![](exploration/evidence/mobile-shell/current-company-files-390.png) | ![](exploration/evidence/mobile-shell/current-agent-390.png) |

### Findings

1. **The shell is not responsive at all.**
   - `AppShell` always adds `ml-64` (`ml-16` when collapsed), and `Sidebar` is a fixed `w-64` panel at every width. That leaves about 134 px for content on a phone.
   - The document overflows horizontally: 463 px on Home, 420 px on Requisition, 397 px on Company Files.
   - The fixed top-right controls (activity log, language, bell, user menu) overlap the page headers.
   - This is the first thing any direction must fix.
2. **The Agent is already a full-screen phone surface** (M5, `sm:` breakpoints in `agent-panel.tsx`). But the page underneath overflows, so the mobile browser widens the layout viewport and the "full-screen" panel is clipped (fourth capture). It will be correct once the shell stops overflowing.
3. **Module visibility is computed in three places, and they disagree.**
   - `sidebar.tsx`: Talent accounts see only Timesheet and Attendance. Timesheet requires PMO *full*. Executive is Owner-only.
   - `app/page.tsx`: the same filters without the Talent rule, plus `DIVISION_GATED_MODULE_KEYS`, which shows locked cards.
   - `middleware.ts`: the whole app is Owner-only in the pilot.
   - Server pages enforce access separately (`require-division-access`, `DIVISION_PATHS`, `CROSS_DIVISION_PATHS`).
   - A role-aware mobile launcher needs **one** function for this, not a fourth copy.
4. **Module pages are desktop pages:** KPI tiles, wide tables and filter rows. There is no list → detail pattern that works on a phone. This is the largest piece of work in any direction, and it scales with how many modules are made mobile-ready.
5. **What already exists and can be reused as is:**

| Capability | Where |
|---|---|
| Actor-scoped record search, typo-tolerant (`pg_trgm`) | `lib/agent/reads.ts` `search()`; name resolution, ERP migration 0006 |
| Company Files search, open (logged), upload, and attachment → file | `/api/files/*`, M6 and M6.x |
| Notifications table and bell | `lib/notifications.ts`, `notification-bell.tsx` |
| Approval flows with a named approver per step | extension/increment (`approval-journey.ts`), time-off approval, TTD signature requests, PQ/contract setup |
| Agent proposals and feedback drafts, with confirm/reject | `/api/agent/proposals`, `/api/agent/submissions` |
| Perlu perhatian signals and follow-ups | `/api/operations/context`, the Agent brief |
| Push-to-talk voice | `components/agent/voice.tsx`, `/api/agent/transcribe` |

6. **Nothing PWA exists yet.** There is no web manifest, no service worker, no installable icons (only `logo-celerates.jpg` and a favicon), and no `theme-color`. The only metadata is the title `Celerates ERP`.

## 3. Foundation needed by every direction

These items are the same whichever direction is chosen. They are what makes the ERP usable on a phone at all.

**F1 — Responsive app frame.**
- Below `md`: no sidebar; a compact top bar plus the chosen mobile navigation.
- At `md` and above: today's sidebar, unchanged.
- The same routes and URLs on both, so a notification deep link works on either.
- The fixed corner controls move into the top bar and the account screen.

**F2 — One module-access function.**
- `moduleAccess(session)` returns, for each module, one of `hidden | read | full`, with the reason. It is built from the existing session claims: `isOwner`, `accountType`, `access[{divisionKey, level}]`, and the cross-division paths.
- The desktop sidebar, desktop Home, the mobile launcher and the Agent all use it.
- It decides **visibility only**. Record and data authority stay in the existing server guards and the record-level document route (ADR-018 decision 8).

**F3 — Mobile record pattern.**
- A list becomes cards with a key identifier, a status pill and one or two facts.
- A detail page shows ERP facts first, then linked Company Files, then activity.
- Actions sit in a bottom bar and show only what the user may do. **Tanya tentang ini** opens the Agent with the record as context.
- The pattern is applied module by module, starting with the pilot's first-class modules (§8).

**F4 — Capture.**
- Camera or file input always asks where the file goes:
  - **Company File**: persistent and governed; recommended for scans because it gets OCR;
  - **Agent attachment**: working context, which can be saved later through M6.x.
- No new storage path: this is M6 plus M6.x.

**F5 — PWA baseline.**
- Web manifest: name and short name, `display: standalone`, theme and background colours, 192/512 and maskable icons, apple-touch-icon.
- The service worker caches **the static shell only**. It bypasses every authenticated request: ERP responses, files and Agent streams are never cached, whatever their headers say.
- An offline fallback page.
- Install guidance: Android prompt; iOS via Share → Add to Home Screen.
- **Web push is later**, not the pilot. On iOS it works only for an installed PWA (16.4+).

**F6 — "Waiting for me" aggregation (*Tinjau*).**
- One ERP BFF read merges:
  - approval steps assigned to the user;
  - time-off and signature requests awaiting them;
  - their pending Agent proposals and feedback drafts;
  - unread notifications.
- Each item carries its source, record reference, deep link and allowed actions.
- Actions call the owning flow's existing server action or endpoint, so **no new authorisation path** is created.
- An inline decision is offered only where the owning flow already has a simple decision. Otherwise the item offers **Buka**.

## 4. Three directions

The directions differ in **information architecture**: what Home is, where each behaviour lives, and where the Agent sits. All of them sit on §3.

The wireframes are low fidelity, use synthetic data, and are not a visual system. Source: `exploration/mobile-shell/wireframes.html`; render with `node docs/exploration/mobile-shell/render-captures.mjs`.

### Direction A — Operational Home + tab bar

![Direction A](exploration/evidence/mobile-shell/direction-a-app-home-tabs.png)

**Idea.** Closest to the baseline image.
- Home shows greeting and role, a "Hari ini" row of 3–4 deterministic ERP counts, the module launcher (8 slots, "Semua"), one compact Perlu perhatian row, and recent activity.
- Tab bar: **Beranda · Modul · Tanya (centre) · Tinjau · Akun**.

**Where the behaviours live.**
1. **Go to modules:** the Home launcher and the Modul tab.
2. **Review and respond:** the Tinjau tab (F6).
3. **Find, capture, ask:** split. Asking, voice and capture are under Tanya (the Agent). Search sits inside Modul or behind a top-bar icon.

**Strengths.**
- The most familiar enterprise-app pattern.
- Every behaviour has a permanent place.
- "Hari ini" gives management an at-a-glance view.

**Risks.**
- Five tabs lock the most navigation decisions.
- The centre Agent button tends to read as the hero, against the agreed constraint.
- **There are two places to type (search and Tanya).** M5 removed exactly this "where do I type" split inside the Agent.
- The "Hari ini" counts need per-role definitions early.

### Direction B — Launcher + one Find / Ask / Capture bar

![Direction B](exploration/evidence/mobile-shell/direction-b-launcher-universal-bar.png)

**Idea.**
- Home is the **module launcher** (12 slots, pinnable, with a role default). Above it sits **one bar** with a camera and a microphone.
- Typing shows results grouped as **Record · Company Files · Modul**, all already filtered by authority.
- The last row is always **Tanya Agent: "…"**. A long sentence or a question goes straight to the Agent.
- One "Menunggu Anda" row links to Tinjau.
- Tab bar: **Beranda · Tinjau · Akun**.

**Where the behaviours live.**
1. **Go to modules:** Home itself.
2. **Review and respond:** the Tinjau tab (F6).
3. **Find, capture, ask:** the bar, one entry point. The Agent also opens from **Tanya tentang ini** on a record and from Tinjau items.

**Strengths.**
- Satisfies every UX constraint literally: Home is operational, the launcher is the content, and the Agent is integrated with no tab and no hero.
- Extends the M5 "one surface, routing to capability" principle from the Agent to the whole app.
- Locks the fewest decisions, with three tabs.
- Reuses the existing actor-scoped record search and Company Files search.

**Risks.**
- The Agent is less visible for people who have never used it. Mitigations: the placeholder *atau tanya*, the microphone icon, and record entry points.
- The unified result list needs a small merge contract (records + files + modules) and fast search on phone networks.
- There are no at-a-glance numbers unless an optional row is added later.

### Direction C — Work-first: the response queue is Home

![Direction C](exploration/evidence/mobile-shell/direction-c-work-queue-home.png)

**Idea.**
- Home is the **Tinjau queue**, with inline actions and a "done when empty" feel.
- Modules are a horizontal strip plus a full **Modul** sheet grouped by function, with the access level (Penuh/Baca) shown.
- The Agent is a floating **Tanya** button. Company Files gets its own tab.
- Tab bar: **Kerja · Modul · Berkas · Akun**.

**Where the behaviours live.**
1. **Go to modules:** the strip and the sheet.
2. **Review and respond:** Home.
3. **Find, capture, ask:** the Berkas tab and the floating button.

**Strengths.**
- The fastest "open, decide, close" loop for management.
- The Modul sheet shows role-awareness explicitly.

**Risks.**
- Conflicts with "module launcher prominent" and "attention is not the hero".
- Home is nearly empty for users with little to approve, which is most roles once multi-role arrives.
- Drifts toward a notification feed.

Its **queue card design and the Modul sheet** are worth keeping as components inside A or B.

### What all three share (wireframe "Berlaku untuk semua arah")

![Record and capture](exploration/evidence/mobile-shell/common-record-and-capture.png)

- The record detail pattern (F3).
- The capture sheet (F4).

## 5. Comparison

| | A · Home + tabs | B · Launcher + one bar | C · Work-first |
|---|---|---|---|
| Home is an operational app home | Yes | **Yes, the launcher is Home** | Partly (queue) |
| Launcher prominent | Yes | **Most** | Secondary |
| Agent integrated, not hero | Centre tab leans hero | **Yes (bar, record, Tinjau)** | Floating button |
| Attention not the hero | Yes (one row) | **Yes (one row)** | No, it is the hero |
| One place to type | No (search + Tanya) | **Yes** | No |
| Role-aware via F2 | Yes | Yes | Yes, most visible |
| Navigation decisions locked | 5 tabs | **3 tabs** | 4 tabs |
| New contracts beyond §3 | "Hari ini" definitions | Search merge | none |
| Closest to baseline image | **Yes** | Partly | No |

## 6. Recommendation

**Pilot Direction B, and borrow from the others:**
- from **C**: its queue cards and the grouped **Modul** sheet with access levels, used as B's Tinjau and "Semua";
- from **A**: an optional "Hari ini" row, added only if the Owner pilot asks for at-a-glance numbers.

**Why:**
- B is the only direction that meets every agreed constraint without exception.
- It keeps the M5 lesson of a single entry that routes to a capability.
- It commits to the fewest navigation decisions while multi-role access is still being discovered.

**What would change this:**
- Owners repeatedly look for a persistent Agent tab → move to A's tab bar. The foundation is the same, so this is a small change.
- Management mostly opens the app to approve → promote C's queue to Home.

**Validate before building screens.**
1. Put the wireframes into a clickable prototype.
2. Run six tasks with 2–3 Owner/management users:
   - open a contract;
   - approve an extension;
   - confirm an Agent proposal;
   - find a BAST scan;
   - photograph and save a document;
   - ask a cross-module question.
3. Measure time and misroutes (typing into the wrong place, looking in the wrong tab).

## 7. Parallel track: multi-role access discovery (not a blocker)

Pilot middleware stays Owner-only. F2 and F3 are built so that non-Owner users work the moment the middleware opens. What must be learnt in parallel:

1. **Role inventory.** Which job roles use mobile first: sales, TA, PMO, TM/HR, finance, management other than the Owner, talents.
2. **For each role:** its division access (`read`/`full`), cross-division paths, and which approvals it receives. Build this from `access_management` data and the approval flows, not from assumptions.
3. **Record-level gaps.** Where ERP today checks only division, not record ownership (see `docs/erp-audit`). This decides what a non-Owner may see in search results and in Tinjau.
4. **Talent accounts.** Today they see only Timesheet and Attendance. Is mobile their primary surface (self-service), and does that need a different Home later?
5. **Output:** an access matrix (role × module × level × record rule) reviewed by the Owner. It feeds F2 unchanged.

## 8. Decisions requested

1. The direction for the pilot: B (recommended), A or C.
2. The first-class modules for pilot mobile record views (F3). Proposed six, based on the discussion:
   - Talent (TA/TM);
   - PMO · Contract;
   - Sales · Opportunity;
   - Timesheet;
   - BAST;
   - Company Files, which is already mobile-shaped.
3. Whether the Owner pilot wants "Hari ini" numbers, and which three.
4. Whether the prototype test (§6) runs before implementation. Recommended.

## 9. Proposed slicing once a direction is chosen (for planning only)

1. **MS1 — Foundation:**
   - F1 responsive frame;
   - F2 `moduleAccess`, with desktop sidebar and Home migrated to it;
   - F5 PWA baseline;
   - the overflow fixes above, which also un-clip the Agent.
2. **MS2 — Home and the find/ask/capture entry** for the chosen direction, with F4 capture.
3. **MS3 — Tinjau:** the F6 aggregation and queue cards.
4. **MS4 — Mobile record views** for the modules agreed in §8.2, one at a time, each with its read-only list/detail first, then the actions it already has.

Each slice keeps the standing invariants:
- ERP is the authority, and the model never applies changes;
- deterministic mode works without models;
- Perlu perhatian and Masukan do not regress;
- unit, PostgreSQL, cross-stack and browser tests run at 390 px as well as desktop.

## Captures in this record

| File | What |
|---|---|
| `current-home-390.png`, `current-ta-requisition-390.png`, `current-company-files-390.png`, `current-agent-390.png` | The current ERP at 390 × 844 (§2) |
| `direction-a-app-home-tabs.png` | Direction A wireframes |
| `direction-b-launcher-universal-bar.png` | Direction B wireframes |
| `direction-c-work-queue-home.png` | Direction C wireframes |
| `common-record-and-capture.png` | Record detail and capture, common to all directions |

## 10. High-fidelity visual iterations (2026-09-27)

After the direction discussion there are three high-fidelity visual iterations. They build on the existing product and the baseline reference image, and they are meant for **mix-and-match** before implementation. They are visual exploration only: nothing here changes the app.

**The architecture is the same in all three.**
- Destinations: Beranda · Modul · Agent · Tinjau · Akun.
- Beranda has one bar for Cari / Tanya / Tangkap, the "Hari ini" deterministic ERP counts, the module launcher (filtered by access), one Perlu perhatian row, and recent activity.
- Records go list → detail: ERP facts come first, then linked Company Files, the allowed actions, and **Tanya Agent** with the record as context.
- The Agent is one conversation with evidence badges (Fakta ERP / Pengetahuan disetujui). A proposal needs the user's confirmation before anything changes.
- Capture always asks where the file goes: a Company File (OCR, access class) or an Agent attachment (temporary).

This follows the reference image's tab structure and adds Direction B's single find/ask/capture bar on Beranda.

**Seven screens per iteration:** Beranda, Modul (navigation), Kontrak list, Kontrak detail, Agent, Company Files, and Tangkap dokumen.

| Iteration | Look | Navigation and Agent entry |
|---|---|---|
| 1 · Jernih | Closest to the reference: light, blue accent, tinted module tiles, Plus Jakarta Sans | Standard tab bar with a raised Agent tab in the centre; camera capture with a bottom sheet |
| 2 · Tenang | Warm neutral ground, deep-teal accent, serif display (Fraunces) over DM Sans, launcher-first | Floating dark tab pill (4 destinations) plus a separate round Agent button; Agent opens as a modal with a floating composer; capture reviewed after the shot |
| 3 · Navy Pro | Dense and data-forward: navy header band, IBM Plex Sans/Mono, table-like lists | Tab bar with a top indicator and a centre Agent circle; dark Agent with numbered sources; multi-page capture |

![Iteration 1](exploration/evidence/mobile-shell/hifi/iteration-1-jernih.png)
![Iteration 2](exploration/evidence/mobile-shell/hifi/iteration-2-tenang.png)
![Iteration 3](exploration/evidence/mobile-shell/hifi/iteration-3-navy-pro.png)

**Source.** `exploration/mobile-shell/hifi/`: one `.dc.html` per screen plus `canvas.json`. This is a copy of the design canvas; the live canvas is the editable version. All data is synthetic and the client names are fictional.

**Pick per element, not only per iteration.** For example:
- the Beranda structure from 1 and the list density from 3;
- the Agent's numbered sources from 3 and the Tangkap review from 2;
- the tab-bar treatment decided separately from the palette.

## 11. Verified ERP module inventory (2026-09-27)

§10 simplified the module set: "Talent", "Kontrak" and "BAST" were drawn as top-level tiles. **The ERP does not have those modules.** This section is the product model taken from the code as it is today.

Sources:
- `src/lib/modules-config.tsx` (registry);
- `src/components/sidebar.tsx` and `src/app/page.tsx` (visibility);
- `src/lib/require-*-access.ts`, `school-access.ts`, `division-map.ts` and `middleware.ts` (authority);
- every `page.tsx` and `actions.ts` under `src/app`;
- `src/db/schema.ts`;
- `src/lib/pq-approval.ts`, `approval-journey.ts` and `operations/*`.

### 11.1 Authority as implemented

- **Pilot gate.** `middleware.ts` admits active **Owners only**. Every non-Owner rule below is already in code, but it is not reachable until multi-role opens (§7).
- **Division access.** `user_access` rows `{divisionKey, level}` with level `viewer | editor | full` (`requireDivisionAccess`):
  - `viewer` reads only;
  - `editor` creates and updates;
  - `full` also deletes.
  - The Owner passes every check.
- **The actions are the authority.** Every mutating server action calls `requireDivisionAccess(<division>, level)` or a module-specific guard. The navigation only decides what is shown.
- **Account types.** `talent` accounts see only Timesheet and Attendance (self-service). `backoffice` accounts see the rest.
- **Special guards:**
  - Timesheet: talents act on their own records; backoffice needs PMO `full`. The converter needs PMO `full` or `canUseTimesheetConverter`.
  - Attendance: every active user checks in as themselves.
  - School: `editor`/`full` manage courses; `viewer` learns.
  - Executive Dashboard: Owner only.
  - Access Management and Intelligence Review: Owner only.
  - Company Files: ERP class policy (ADR-018).
- **Visibility was computed in four places before MS1:**
  - the sidebar;
  - desktop Home, with locked cards (`DIVISION_GATED_MODULE_KEYS`, which omits `automation` although its actions are division-gated);
  - `operations/policy.ts#canReadModule` for signals;
  - the pilot middleware.

  MS1 replaces the first two with one registry function (§14).

### 11.2 Seven core business modules

| Module (division) | Submodules / routes | Primary records | Primary intent | Key actions (server) | Mobile representation |
|---|---|---|---|---|---|
| **Marketing** (`marketing`) | Dashboard `/marketing/dashboard`; Leads `/marketing`, `/marketing/[id]/edit`; Account CRM (Sales-owned) | `leads` | Qualify leads and hand them to Sales | `createLead`, `updateLead`, `convertLeadToOpportunity`, `deleteLead`; sheet sync | Landing with the qualified-lead signal; lead list → detail; **Konversi ke Opportunity** as a sticky action |
| **Sales** (`sales`) | Dashboard; Opportunity Tracker `/sales/opportunity-tracker`; PQ Tracker `/sales`; Account CRM `/sales/accounts[/id]`; collab: Client Active (TA), Overtime & Business Trip (PMO), Profitability Tracker | `sales_opportunity_trackers`, `opportunities` (PQ), `crm_clients`, contacts, activities | Move opportunities, send the PQ for signature, keep accounts | `createOpportunityTracker`, `updateOptyStatus`, `convertToRequisition`, `updatePipelineStage`, `sendPqForSignature`, `createExtensionRequestFromSales`, CRM `createClient`/`createContact`/`createActivity` | Landing: pipeline summary and signals; opportunity list by stage (segmented); opportunity detail with a PQ status block; account detail with contacts and activity; **Kirim PQ untuk TTD**, **Konversi ke Requisition** |
| **Talent Acquisition** (`ta`) | Dashboard; Requisition `/ta`; Candidate `/ta/candidates[/id]`; Hiring Pipeline `/ta/pipeline`; Onboarding `/ta/onboarding`; collab: Client Active (TA+Sales) | `requisitions`, `candidates`, `applications`, `onboarding_requests` | Fill requisitions: candidates → pipeline → offer → employee | `createRequisition`, `createCandidate`, `createApplication`, `updateHiringStatus`, `sendOfferingLetterForSignature`, `promoteToEmployee`, `updateClientSubmissionStatus` | Landing with requisitions missing a TA PIC; requisition → candidates; pipeline as stage tabs (not a board) with **Pindahkan tahap** in a sheet; candidate detail (CV via Company Files); onboarding checklist |
| **Human Resources** (`hr`) | Dashboard; Employee `/hr`, `/hr/[id]`; Extension Request `/hr/extension-requests`; Attendance Log; Attendance Settings (leave types, approval steps); collab: Special Notes (TM-HR), Overtime & Business Trip | `employees`, `employment_contracts`, `bpjs_registrations`, `leave_types`, `attendance_approval_steps` | Keep employee records, acknowledge extensions, run attendance policy | `updateEmployee`, `addContract`, `updateBpjsStatus`, `processExtensionRequest`, leave types and approval-step admin | Employee list → detail (contract, BPJS); extension acknowledge as a review item; settings stay desktop |
| **Talent Management** (`tm`) | Dashboard; Talents Book `/tm`, `/tm/employee/[id]`; Talent Database & Salary; COGS Calculator; Extension & Increment Request; Special Notes (TM-HR); collab: Profitability | `talent_assignments`, `extension_increment_requests`, `extension_request_special_notes` | Place talents, extend or increment, track notes | `createTalentAssignment`, `createExtensionRequest`, `rejectExtensionRequest`, `ownerOverrideExtensionRequest`, `applyCogsToTalentAssignment`, `createSpecialNote` | Talent list → talent detail (assignment, client, period); **extension request = multi-step review** (approver 1–3 → HR acknowledge); COGS and salary stay desktop |
| **PMO** (`pmo`) | Dashboard; A.Contract `/pmo/contracts` (+ billing schedule); Talent Document Tracker `/pmo`; TM Invoice `/pmo/invoices`; collab: Dokumen Finance, Overtime & Business Trip, Profitability | `project_contracts`, `project_monthly_billings`, `project_invoices` (with **BAST support document**), `project_documents`, `finance_document_handoffs`, `overtime_business_trip_claims` | Contract setup, billing → invoice → finance handoff, talent documents, claims | `createProjectContract`, `syncBillingScheduleToInvoices`, `createProjectInvoice`, `upsertFinanceHandoff`, `createProjectDocument`, claims `createClaim` → `forwardToSales` → `submitToFinance` → `markInvoiced` | **The densest module.** Landing with four signals (invoice submission, missing invoices, ambiguous billing, missing documents); contract list → contract detail (billing months, invoices, documents); invoice detail with BAST and the finance-handoff state |
| **Finance** (`finance`) | Dokumen Finance (TM Invoice) `/finance`; collab: Overtime & Business Trip | `finance_document_handoffs` | Receive PMO documents; accept or send back | `acknowledgeFinanceHandoff`, `requestRevisionFinanceHandoff` | Review queue (handoffs awaiting finance) → detail → **Terima** / **Minta revisi** (sticky, with a note) |

### 11.3 Shared and operational modules

| Module | Visibility today | Records / key actions | Mobile representation |
|---|---|---|---|
| **Timesheet** `/timesheet`, converter | Talent (own) or PMO `full`; converter by flag | `timesheet_submissions` (`createTimesheetSubmission`, `approveTimesheetSubmission`), holidays, Astra converter | Talent: submit month (self-service). PMO: approval queue. Converter stays desktop |
| **Attendance** `/attendance`, live, history, time-off | Every user (self-service) | `attendance_logs` (`checkIn`/`checkOut`), `time_off_requests` → `approveTimeOffStep`/`rejectTimeOffStep` | Mobile-first: check-in, time-off request, approvals in Tinjau |
| **Executive Dashboard** | Owner | read-only KPIs | Landing-style summary only |
| **Task Board** `/tasks` | All backoffice | `kanban_tasks` (move, comment) | Status tabs + task detail; **Pindahkan** via sheet |
| **Company Files** `/files` | All backoffice; content by class policy | files registry (M6/M6.x) | Search → file detail/preview; **Tangkap** (camera/upload) |
| **Tanda Tangan Digital** `/ttd-online` | All (requests addressed to the user) | `signature_requests` (`signRequest`, `rejectRequest`); feeds PQ and offering letters | Signature queue → document → **Tanda tangani** / **Tolak** |
| **Learning Management** `/school` | Division `school` (viewer = learner) | courses, enrollments, progress, quizzes | My Learning + lesson reader |
| **Automasi & Chatbot** `/automation` | Division `automation` | reminders, document templates | Desktop only for now |
| **Feature Request** `/feature-requests` | Hidden from navigation; reached through Masukan (ADR-017) | `feature_requests` | Via the Agent only |
| Account areas (not modules) | Access Management and Intelligence Review (Owner), Profile, Activity Log, Notifications | — | Under **Akun** |

### 11.4 Cross-module journeys (verified in code)

1. **Lead → Opportunity → Requisition.** Marketing `convertLeadToOpportunity` → Sales tracker → `convertToRequisition` → TA requisition. The `opty_no` business key is shared.
2. **PQ signature → setup.** Sales `sendPqForSignature` → TTD `signRequest` → `onPqSigned`:
   - sets the approval date;
   - once an employee exists, notifies **TM** ("Talent siap di-setup") and **PMO** ("Project siap di-setup ke A.Contract").
3. **Hiring.** TA requisition → candidate → application (`updateHiringStatus`) → onboarding with the offering letter signed in TTD → `promoteToEmployee` (HR employee) → `onTalentPromoted` → TM Talents Book and PMO A.Contract setup.
4. **Client submission.** TA Client Active status is shared with Sales.
5. **Extension / increment.** TM (or Sales) creates the request → named approvers 1–3 → HR `processExtensionRequest` acknowledges. The Owner can override. TM and HR exchange Special Notes.
6. **Billing → Finance.** PMO billing schedule → monthly billing → `syncBillingScheduleToInvoices` → TM Invoice (BAST support document) → `upsertFinanceHandoff` → Finance `acknowledge` / `requestRevision` → PMO (the `finance-revision` signal).
7. **Overtime & business trip claims.** PMO `createClaim` → `forwardToSales` → `submitToFinance` → `markInvoiced`, plus talent payment.
8. **Profitability.** Sales Profitability Tracker, synced from TM assignments; the view is shared with PMO.
9. **Timesheet.** A talent submits → PMO `full` approves.
10. **Time off.** An employee requests → the steps HR configured → approve or reject each step → notifications.

### 11.5 Desktop pattern → mobile pattern

| Desktop pattern in the ERP | Mobile pattern |
|---|---|
| Module dashboard (KPI cards + charts) | **Module landing**: 3–4 facts, the module's Perlu perhatian signals, submodule entries. Charts later |
| Tracker tables (leads, trackers, PQ, requisitions, candidates, contracts, invoices, employees, talents) | **List cards**: identifier, title, status pill, two facts. Filters as chips, sort and filter in a **bottom sheet**. No shrunken tables |
| `[id]/edit` long forms | **Read-first record detail**: facts, related records, Company Files, activity. Quick edits and status changes in a **sheet**; long edit forms stay desktop until converted |
| Kanban boards (hiring pipeline, task board) | **Stage tabs + list**; move with a sheet |
| Multi-step approvals (extension request, time off, timesheet, finance handoff, TTD, PQ) | **Tinjau item → detail → sticky approve/reject** with a reason sheet |
| Admin and power tools (sheet sync, attendance settings, access management, COGS, converter, automation templates) | **Desktop only**: listed under the module as "di desktop" |
| Self-service (check-in, time-off request, timesheet submit, sign) | **Full-screen mobile-first flows** |

## 12. Revised mobile information architecture

This is traceable to §11. The Jernih visual language is unchanged.

- **Tab bar (locked):** Beranda · Modul · Agent · Tinjau · Akun.
  - **Agent** opens the existing full-screen Agent (M5/M6), taking context from the current route.
  - **Tinjau**, in MS1, is the user's existing notifications, which the approval flows already emit. In MS3 it becomes the F6 aggregation: approval steps assigned to me, TTD requests, finance handoffs, Agent proposals.
  - **Akun** is a sheet: profile, activity log, language, Access Management (Owner), logout.
- **Beranda:**
  - greeting and access summary;
  - the Cari / Tanya / Tangkap bar;
  - **Perlu perhatian**: the existing deterministic signals, RBAC-filtered (`/api/operations/context`);
  - **Modul bisnis**: the accessible core modules, in registry order;
  - **Operasional**: the accessible shared modules;
  - **Terbaru**: the latest notifications.

  **No fixed icon count and no invented tiles**: the grid is whatever the registry grants. Modules without access are hidden on mobile. Desktop keeps its locked cards.

  The "Hari ini" counts from §10 are dropped until their metrics are defined; this is question 3 in §8, still open.
- **Modul:** the full directory, grouped *Bisnis* / *Operasional*.
  - Each module shows its access level (Penuh / Editor / Lihat / Mandiri) and its real submodules, from the registry.
  - A cross-division submodule shows its owning module (for example Sales › Client Active is TA's).
  - Admin tools are marked **Desktop**.
- **Module landing:** in MS1, a generic landing sheet built from the registry: submodules, access level, and the module's signals. MS2 converts representative modules into full landings.
- **Records:** list → detail → contextual action (sheet or sticky) → **Tanya Agent** with the record's context (the Agent already resolves entity context per route). Delivered from MS2.
- **Company Files:** a module and the **Tangkap** destination. It stays governed persistent content (ADR-018), never a generic attachment bucket.

**Representative modules for MS2** (hardest first):
1. **PMO**: contract → billing → invoice (BAST) → finance handoff, the densest cross-module chain.
2. **TM extension request**: multi-step approval ending in an HR acknowledgement, the Tinjau pattern.
3. **TA hiring pipeline**: a board converted to stage tabs.

## 13. Review of the §10 high-fidelity work

| Keep (Jernih, locked) | Remap | Discard |
|---|---|---|
| Visual language: surface, tinted tiles, Plus Jakarta Sans, radii and borders, tab bar with the raised Agent, Agent conversation (evidence badges, proposal card), record-detail anatomy (fact rows, linked files, sticky actions), capture sheet, Company Files result card | "Kontrak" list/detail → **PMO › A.Contract** (`project_contracts`) with billing and invoices as related records; "BAST" → **supporting document of a TM Invoice** (class **commercial** in the ERP declaration, not "Divisi PMO"); "Talent" tile → three modules (**TA**, **HR**, **TM**); "Files" → **Company Files**; the Modul screen's groups → §12 groups with the real submodules | Top-level "Kontrak", "BAST" and "Talent" tiles; a fixed 8-tile launcher; the "Hari ini" metrics that are not ERP signals (e.g. "Timesheet belum masuk"); Iterations 2 and 3 as directions (their ideas may return as components only) |

No new visual reference screens were needed: the one interaction question (what a module tile opens before MS2 builds real landings) is answered by the registry-driven landing sheet, which uses Jernih's existing sheet anatomy.

## 14. MS1 — implemented scope

1. **One canonical module access mechanism**, `src/lib/module-access.ts`:
   - A pure function over the session claims returns, per registry module, its group (bisnis / operasional), whether it shows in navigation, and its access (`full | editor | viewer | self | open | none`).
   - Desktop sidebar, desktop Home (locked cards), mobile Home, mobile Modul and the landing sheet all use it.
   - Server actions keep their own guards.
   - A unit test pins it to the previous sidebar/Home behaviour and to `canReadModule` for the division modules.
2. **Responsive shell:**
   - Below `md`: no desktop sidebar, no fixed corner controls, no left margin; a mobile tab bar with safe-area insets; the floating Agent trigger replaced by the Agent tab.
   - At `md` and above: unchanged.
3. **Mobile Beranda** (Jernih) on `/` below `md`: greeting, bar, Perlu perhatian, registry-driven grids, Terbaru. Desktop `/` is unchanged.
4. **Mobile Modul** directory (`/modules`) and the **module landing sheet**.
5. **Tinjau** (`/notifications`): the notification list, full-screen, using the existing actions.
6. **Akun sheet.**
7. **Jernih tokens and primitives:**
   - tokens: colours, radii, shadows, module tints, Plus Jakarta Sans bundled via `@fontsource`;
   - primitives: `MobileScreen`, `Tile`, `ListCard`, `FactRows`, `BottomSheet`, `StickyActions`, `StatusPill`, `SectionHeader`.
8. **PWA foundation:**
   - `manifest.webmanifest` (standalone, Jernih theme) with icons derived from the Celerates logo, maskable included;
   - apple-touch-icon;
   - a service worker that only serves an offline page for failed navigations and **never caches authenticated responses**;
   - public paths allowlisted in the middleware.

**Not in MS1:**
- real module landings and record screens (MS2);
- the Tinjau aggregation (MS3);
- record search in the bar (MS2; the bar opens the Agent);
- capture sheet (MS2; the camera opens Company Files upload);
- web push;
- any M7 work.
