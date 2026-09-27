# 19 — ConForm / BAST Digital integration into Celerates

Date: 2026-09-28  
Status: **product/architecture knowledge pack and planning record; not an implementation authorization**  
Target repository: `yosdwi/celerates-digital-intelligence`  
Target branch: `audit/erp-production-readiness`  
Target branch HEAD when this record was written: `49049b2f70252a6bc1572c2e6abf4a478d6dfdf9`

## 0. Source baselines — read this first

The ConForm / BAST Digital source of truth for this record is **not `main`**.

### ConForm / BAST Digital

Repository: `yosdwi/celerates-bast-digital`  
Current implementation baseline: `chore/session-20260918-fixes`  
Verified HEAD: `49a13a42bad8048db6a9081cf8fc140f822ad055`  
Verified on: 2026-09-28

At the time of this record the branch is 435 commits ahead of `main` and 0 behind. It contains major Payroll Attendance closing, BAST Closing, TalentOps, delivery, responsive UI, and WhatsApp runtime work that does not exist on `main`.

Therefore:

> Every statement about existing ConForm behavior must be verified against `chore/session-20260918-fixes` at `49a13a42...` or a newer commit on that same branch. `main` is historical context only.

### WhatsApp Meta branch

`feat/meta-cloud-api` remains a separate historical/reference branch. It is **not** the current ConForm runtime baseline and must not be treated as already merged.

The current ConForm branch records the production WhatsApp transport as `whatsapp-web-session` using `whatsapp-web.js`, cut over from whatsmeow on 2026-09-04. Any future move to Meta Cloud API is a separate integration decision.

### Celerates

Repository: `yosdwi/celerates-digital-intelligence`  
Branch: `audit/erp-production-readiness`  
Verified HEAD for this record: `49049b2f70252a6bc1572c2e6abf4a478d6dfdf9`

At this point Mobile/PWA MS1–MS3 already exist. In particular, `Tinjau` is already the Celerates "menunggu saya" decision queue, Beranda search/capture exists, Finance has a phone representation, and the Jernih mobile visual foundation is already locked. This integration must extend that product, not create a second mobile shell.

---

## 1. Why this record exists

ConForm started around Digital BAST, attendance, task evidence and chatbot workflows, but the current implementation has evolved into a broader **operational readiness and closing engine**.

The integration goal is **not**:

- add a new top-level `ConForm` module to Celerates;
- copy the old ConForm UI into the ERP;
- copy tables because their names look similar;
- rebuild the whole ConForm service inside the ERP in one migration;
- create another chatbot beside Celerates Agent.

The target product direction is:

> **Celerates becomes the single user-facing operational product. ConForm contributes proven operational-readiness domain logic, source integration, correction/evidence workflows, BAST/Payroll closing behavior, and communication-delivery patterns.**

Initially that may still mean two deployable backends behind one governed Celerates experience. Product unification does not require an immediate codebase/database rewrite.

---

## 2. What ConForm actually is now

A more accurate high-level model is:

```text
PAMA / Client Attendance     Redmine          IoT Google Sheet
          │                    │                    │
          └────────────── source ingest / bridge ──┘
                               │
                               ▼
                    typed operational records
              employee / attendance / task / timesheet
                               │
                     deterministic projections
                  ┌────────────┴────────────┐
                  │                         │
             Payroll Closing           BAST Closing
              cycle 21→20              calendar month
                  │                         │
          remediation / review       readiness / evidence
                  │                         │
                  └────────────┬────────────┘
                               │
                     Talent / PMO workflows
                               │
                 reminder / digest / delivery
                               │
                           WhatsApp
```

Current ConForm should therefore be treated as an **Operational Readiness Core**, with BAST as one major output rather than the whole product.

### Current web/TalentOps surfaces on the branch

The React app routes include:

- Command Center;
- Payroll;
- Talents;
- Action Center;
- Attendance Gaps;
- BAST Readiness;
- Delivery;
- Evidence;
- System Sync;
- Settings;
- Talent 360 detail.

These surfaces are valuable as references for domain requirements and operational workflows. They are **not** a target navigation model for Celerates.

---

## 3. Current source and ingest topology

The current ConForm source model is important because it must not be erased by a UI integration.

The PAMA environment is constrained: the external/source environment is read where it can be reached, then raw/source facts are posted into ConForm through bounded sync contracts. The ConForm side owns normalization/business transformation so source rules are not copied into multiple bridge clients.

Important principles to preserve:

- source ingestion is idempotent;
- source-specific transformation remains deterministic;
- raw source facts are distinguishable from user-proposed correction;
- source freshness / source failure must remain visible;
- a technical source failure is not automatically a Talent fault;
- Celerates must not introduce a second independent readiness calculation with slightly different rules.

Initial integration should therefore prefer a **governed service contract** over direct duplicated SQL reads into ConForm tables.

---

## 4. Payroll Attendance closing — current branch truth

The branch contains a complete Payroll Attendance closing product wave.

### Locked current semantics

- Payroll cycle is **day 21 through day 20 inclusive**.
- Raw attendance is immutable in the correction workflow.
- Approved correction projection becomes the effective attendance authority for Payroll/export purposes.
- Evidence supports correction; evidence itself is not approval.
- Business closing states are:
  - `NEEDS_TALENT_ACTION`;
  - `WAITING_SUBMITTED`;
  - `COMPLETE`.
- Reminder milestones default to H-5 / H-3 / H-1.
- Day 20 is the final assessment/digest point.
- `UNRESPONDED` requires successful reminder delivery plus no later attendance response.
- delivery `UNKNOWN` must never be blindly retried.
- PMO receives aggregate closing information, not a message for every Talent action.
- existing legacy attendance CSV export remains canonical on the ConForm side.

### Important product meaning

Payroll Closing is not just an Attendance table. It is a closed operational loop:

```text
source attendance
      ↓
deterministic gap
      ↓
Talent remediation
      ↓
evidence + proposed correction
      ↓
PMO review
      ↓
approved projection
      ↓
closing status / export / reminder targeting
```

This loop is a strong candidate for Celerates integration because it directly maps to mobile self-service plus `Tinjau` review.

---

## 5. BAST Closing — current branch truth

The branch also contains an implementation-complete BAST Closing campaign wave.

### Current campaign semantics

- BAST Closing is **calendar-month based**, independent from Payroll Closing.
- Initial Talent reminder: day 25.
- Follow-ups: EOM-3 and EOM-1.
- Final assessment / PMO digest: EOM.
- Schedule is derived from the actual calendar and date collisions are deduplicated.
- BAST and Payroll share notification infrastructure but remain separate campaigns.
- BAST campaign defaults **OFF** and must not begin sending automatically after migration.

### Task semantics

- Task status is factual source data.
- ConForm must not close or mutate source tasks from the BAST UI/bot.
- non-Closed tasks remain blockers.
- Task evidence requirement is no longer universal:
  - it is configured deterministically in `bast_evidence_rules` by existing `TaskCategory`;
  - unknown/unconfigured category defaults to `evidence_required = false`;
  - AI does not decide evidence requirement;
  - only Closed tasks whose category is configured as requiring evidence become evidence candidates/blockers.

### Attendance semantics inside BAST

BAST does not own a second attendance-correction engine. It surfaces attendance blockers and routes Talent into the existing attendance correction authority/workflow.

A pending PMO correction must not be re-presented as if the Talent still has an unsubmitted action.

### PMO / delivery semantics

- PMO is web-first.
- PMO WhatsApp receives one aggregate BAST summary, not one message for every Talent.
- manual preview/send and scheduled send share idempotency rules.
- `UNKNOWN` delivery is never blindly resent.

### Export semantics

Printing and readiness are separate. The BAST output may show all factual task statuses, while non-Closed tasks remain readiness blockers.

---

## 6. Talent Mobile — what exists today

Current ConForm already has a bounded Talent Mobile API. It should be treated as a **behavioral donor**, not the final Celerates UX.

### Current access modes

A Talent Mobile token can be issued from:

- WhatsApp binding; or
- PMO web as a bounded PMO-issued link.

The token is employee-bound, period-bound and time-limited. The WhatsApp mode additionally binds to the current WhatsApp identity.

### Current Talent Mobile domains

The current mobile overview covers two tabs/domains:

- Attendance;
- Tasks / required task evidence.

### Current Attendance behavior — correction to older assumptions

The current branch is more capable than earlier `main`-based analysis.

If an attendance day is part of a missing-data gap, the current Talent Mobile flow can create the bounded/manual attendance stub required by the correction workflow (`ensure_manual`) and then continue through evidence upload + attendance resolution submission.

So do **not** carry forward the older assumption that "missing source attendance can only be shown as sync/admin review and cannot be remediated by Talent". Current behavior must be evaluated from `chore/session-20260918-fixes`.

The final correction still remains a reviewed proposal; Talent does not overwrite raw source attendance.

### Current Task Evidence behavior

The mobile workflow separates:

```text
upload evidence
→ staged draft
→ explicit "Ajukan ke PMO"
→ final task_evidence
→ readiness can see it
```

Draft evidence is intentionally invisible to readiness/BAST until explicit submission.

Current production wiring wraps the legacy evidence services in requirement-aware policy so only Closed tasks configured as requiring evidence are candidates.

**Important current semantic:** explicit submission moves evidence into the final evidence table. There is no separate approve/reject lifecycle in this Task Evidence submission service equivalent to Attendance correction review. Whether Celerates should preserve that rule or introduce a PMO return/approval state is a product decision, not something to infer from the button label "Ajukan ke PMO".

---

## 7. WhatsApp transport and delivery — current branch truth

Do not use the old `main` transport assumptions.

The current branch records:

- `whatsapp-web-session` using `whatsapp-web.js` is the active production transport;
- the previous whatsmeow session is no longer the active transport;
- WhatsApp session/state is deliberately isolated from the stateless `bot-worker` and Python business logic;
- application deploys should not require re-pairing/restarting the live WhatsApp session;
- LocalAuth lives on persistent storage;
- delivery lifecycle and deduplication are first-class concerns;
- `UNKNOWN` delivery is a durable safety state, not a reason for blind resend.

There is a separate `feat/meta-cloud-api` branch that proves an official Meta transport direction, but it is not current runtime truth.

For Celerates integration, **transport choice remains a deliberate decision**:

- short-term reuse may retain the current proven ConForm transport contract;
- long-term official Meta Cloud API may be preferable for governed campaigns and templates;
- do not mix the two by assumption or silently claim Meta is already live.

---

## 8. Semantic collisions with the current Celerates ERP

This is the main reason the integration must be designed before code is copied.

### 8.1 Attendance

Current Celerates Attendance is primarily internal employee experience:

```text
Celerates Attendance
├─ Live Attendance
├─ Attendance Log
└─ Time Off
```

ConForm Attendance is external/client/PAMA operational attendance used for Payroll/BAST readiness.

Target vocabulary should distinguish the contexts, for example:

```text
Internal Attendance / Celerates Attendance
Client Attendance / PAMA Attendance
```

The user can see both in one product, but they are not the same source or workflow.

### 8.2 Timesheet

Current ERP Timesheet includes:

- Talent self submission of client-signed timesheet;
- PMO approval;
- Astra converter from Jira Tempo XLSX.

ConForm timesheet/readiness is an operational daily/monthly fact linked to source attendance/tasks and BAST readiness.

Do not merge these entities because they share the word `Timesheet`.

Target model should preserve three concepts:

```text
Operational timesheet readiness        (ConForm domain)
Client-signed timesheet submission      (ERP domain)
Timesheet converter / official output   (ERP domain)
```

They can be connected in UX without forcing one storage model.

### 8.3 Task Board vs operational source tasks

Celerates `Task Board` is an ERP collaboration/Kanban capability.

ConForm tasks are source-derived operational tasks from Redmine / IoT sheet and are used by BAST readiness/evidence.

They are not automatically the same task domain.

### 8.4 Talent 360 vs TM / PMO

ConForm Talent 360 contains useful readiness projections, but Celerates already has canonical product boundaries:

- TA;
- HR;
- TM;
- PMO.

Do not create another top-level `Talent` module just to host ConForm.

Reuse the readiness model as a projection inside the right Celerates surfaces.

### 8.5 Action Center vs Tinjau

Celerates already has `Tinjau` as the cross-module "menunggu saya" queue.

Therefore ConForm Action Center should not become another top-level queue.

Target:

```text
ConForm pending review semantics
→ Celerates Tinjau
→ action still executed by the owning domain authority
```

### 8.6 Automation

Current Celerates `Automasi & Chatbot` is still mostly reminder/document-generator oriented and its existing reminder implementation is email-focused.

ConForm has richer reminder/digest/delivery behavior around attendance and BAST. This creates an opportunity to evolve the Celerates module toward **Automasi Komunikasi** / **Reminder & Campaign**, but the rename and scope are not yet locked by this document.

---

## 9. Target product model — proposed, not yet final

A coherent target is:

```text
                         CELERATES

             ERP + Mobile/PWA + RBAC + Tinjau
                         │
              contextual Celerates Agent
                         │
             governed operational contracts
                         │
              OPERATIONAL READINESS CORE
                (ConForm domain behavior)
                         │
       ┌─────────────────┼─────────────────┐
       │                 │                 │
 Client Attendance   Timesheet/Task    BAST/Payroll Closing
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
              Reminder / Campaign / Digest
                         │
                      WhatsApp
```

The initial architecture should favor **product unification with bounded backend integration**, not a big-bang database rewrite.

---

## 10. Target Celerates projections

The same operational facts should appear through different projections based on user intent.

### A. `Kelengkapan Saya` — Talent self-service

Goal: the Talent immediately sees what they need to fix, without understanding the ConForm architecture.

Example:

```text
Kelengkapan Saya · Sep 2026

12 Sep
Attendance
⚠ Check-out belum tersedia
Dampak: timesheet tanggal ini ikut tertahan
[ Lengkapi ]

17 Sep
Task Evidence
⚠ Evidence diperlukan untuk CCTV Gate Validation
[ Upload bukti ]
```

Important UX principle: show the **root action**, not duplicate cascading gaps as separate chores.

If Attendance blocks a dependent readiness condition, the Talent should see one actionable issue plus its impact.

### B. Talent operational readiness — backoffice

Target locations:

- TM Talent detail;
- PMO project/talent context;
- potentially HR where operationally relevant.

Example sections:

- Client Attendance readiness;
- operational timesheet readiness;
- source task/readiness;
- required evidence;
- outstanding Talent action;
- waiting PMO review;
- source freshness.

This is a projection, not a new `Talent` top-level module.

### C. Operational Readiness — PMO

Purpose:

- period closing status;
- Complete / Need Talent Action / Waiting PMO / Source Review;
- blocker counts;
- Talent drilldown;
- BAST readiness;
- Payroll readiness;
- export/generation entry points where applicable.

### D. `Tinjau`

Use the existing Celerates decision queue for items that genuinely need a reviewer decision, for example Attendance correction.

Rules:

- do not create another Action Center;
- deep link to the exact employee/date/domain;
- action calls the owning domain contract;
- navigation visibility is never authorization.

### E. Automasi Komunikasi / Reminder & Campaign

Proposed future surface:

```text
Reminder
Campaign
Template
Audience
Delivery & Audit
```

Reminder is **system-condition-driven**.

Campaign is an explicit communication operation with preview/recipient resolution/confirm/send or schedule.

---

## 11. Communication model

### Reminder

A reminder is derived from deterministic current state.

Examples:

- unresolved Payroll attendance;
- BAST blocker still requiring Talent action;
- future ERP operational conditions.

The audience must be resolved from system facts at send time and revalidated before delivery.

### Campaign

A campaign is explicit and reviewable.

Example:

```text
Client = Astra
Period = Sep 2026
Condition = Attendance incomplete
        ↓
resolve 17 recipients
        ↓
preview audience + template
        ↓
confirm
        ↓
queue / send / schedule
        ↓
delivery audit
```

Do not make v1 a free-form "paste numbers and blast" tool.

### PMO digest

ConForm already proves the useful pattern:

> PMO gets an aggregate operational summary, not one message per Talent action.

Preserve that philosophy when bringing WhatsApp communication into Celerates.

---

## 12. Celerates Agent role

Do not copy ConForm AI surfaces into Celerates as another assistant.

Target:

```text
ConForm deterministic facts + workflows
                │
                ▼
        Celerates Intelligence
                │
                ▼
          Celerates Agent
```

The Agent may:

- explain a readiness status;
- answer "kenapa ini belum complete?";
- navigate to the exact gap;
- draft a follow-up;
- resolve a deterministic audience;
- propose a reminder/campaign;
- create a governed proposal for an allowed ERP/operational action.

The Agent must not:

- invent attendance/task truth;
- decide whether evidence is required;
- approve a correction;
- silently mutate source attendance/task status;
- send a campaign without the required human confirmation;
- bypass transport/delivery/idempotency safety.

This preserves the standing Celerates model: **Agent = interface/operator; deterministic domains = authority; Intelligence = reasoning layer, not source of truth.**

---

## 13. Evidence policy

Operational workflow evidence is not automatically a Company File.

```text
attendance evidence
→ belongs to attendance correction workflow

task evidence
→ belongs to task/readiness workflow

Company File
→ governed persistent organizational document/knowledge asset
```

Do not dump operational screenshots into Company Files by default.

If a workflow artifact should become an organizational document, use an explicit governed action such as **Simpan ke Company Files** with normal access-class rules.

---

## 14. Identity and authorization direction

Current ConForm Talent Mobile uses bounded bearer links tied to employee/period and either WhatsApp binding or PMO issuance.

When integrated into the authenticated Celerates PWA, primary authority should move toward:

```text
Celerates session
→ ERP user
→ employee/talent identity
→ NRP / external source identities
→ WhatsApp identity mapping
```

WhatsApp links should become deep links into the correct Celerates context, not a permanent second identity/authorization system.

During transition, the existing ConForm token model may remain behind a Celerates BFF/contract if that is the safest migration path. Do not remove working access controls before equivalent ERP authority is proven.

---

## 15. Keep / reuse / adapt / retire matrix

| Current ConForm capability | Integration stance | Notes |
|---|---|---|
| PAMA/source bridge and normalization | **Keep initially** | Preserve proven source reachability and transformation rules |
| Typed operational facts | **Keep as current authority initially** | Do not duplicate into a second independently mutable truth |
| Payroll 21→20 closing projection | **Reuse** | Strong deterministic domain capability |
| BAST monthly closing projection | **Reuse** | Keep independent from Payroll |
| Attendance correction lifecycle | **Reuse/adapt** | Surface through Celerates mobile + Tinjau; preserve immutable raw attendance |
| Talent Mobile UI | **Behavior donor, replace presentation** | Celerates PWA becomes the user-facing shell |
| Task evidence staged→submit behavior | **Reuse pending decision** | Approval/return semantics still need product decision |
| Talent 360 data model | **Reuse projection** | Render inside TM/PMO; no new top-level Talent module |
| ConForm Action Center | **Absorb into Tinjau** | Do not create parallel queue |
| BAST Readiness/Payroll dashboards | **Reuse domain, redesign placement** | PMO/Talent context in Celerates |
| Legacy ConForm frontend navigation | **Retire after parity** | Not copied into ERP IA |
| `whatsapp-web-session` transport | **Keep as current truth for now** | Future Meta decision separate |
| Reminder/digest idempotency and delivery ledger | **Reuse pattern/contract** | Important for Celerates communication automation |
| ConForm AI experience | **Do not duplicate** | Celerates Intelligence/Agent is the shared reasoning surface |
| Evidence blobs | **Keep workflow-scoped** | Not automatically Company Files |

---

## 16. Integration iterations — working proposal

This sequence is intentionally incremental and reversible.

### C0 — Contract and ownership audit

Before user-facing integration:

- pin exact ConForm HEAD;
- enumerate read/write contracts needed by Celerates;
- map ERP user ↔ employee ↔ NRP ↔ WhatsApp identity;
- document source freshness and failure states;
- define which system owns each mutation;
- define response/version/idempotency rules;
- map ConForm pending review into Celerates `Tinjau` without bypassing authority.

**No large UI or database migration in C0.**

### C1 — Read-only readiness inside Celerates

Deliver:

- `Kelengkapan Saya` read-only view for a signed-in Talent;
- Talent readiness section for backoffice where authority permits;
- source freshness/status;
- Payroll/BAST blocker explanation;
- contextual Agent can explain but not mutate.

Goal: prove identity, authority, source contract and UX before writes.

### C2 — Closed-loop remediation

Deliver the first real mobile closed loop:

```text
Talent sees attendance gap
→ uploads evidence / submits correction
→ exact item appears in Celerates Tinjau for PMO
→ reviewer approves/rejects through owning ConForm contract
→ readiness recalculates
→ Talent sees the result
```

Also bring required Task Evidence staging/submission into the PWA according to the locked Task Evidence decision.

### C3 — PMO operational closing

Deliver:

- aggregate Payroll readiness;
- aggregate BAST readiness;
- drilldown by Talent;
- source-review separation;
- export/generation entry points;
- PMO aggregate digest visibility.

At this point daily operators should no longer need the standalone ConForm frontend for the migrated workflows.

### C4 — Communication automation

Deliver a governed communication surface using proven delivery/idempotency concepts:

- reminder rules;
- explicit campaign drafts;
- deterministic audience preview;
- template/channel policy;
- schedule/manual send;
- delivery lifecycle/audit;
- PMO aggregate digest.

Transport choice (`whatsapp-web.js` reuse vs official Meta Cloud API) must be explicitly decided before production cutover.

### C5 — Agent integration

Agent gains tools to:

- inspect readiness;
- explain blockers/dependencies;
- draft follow-up;
- resolve eligible audience;
- draft campaign/reminder;
- propose controlled actions.

Writes/sends still follow existing preview/confirm/idempotent contracts.

### C6 — Consolidation and retirement

Only after parity and soak:

- decide which ConForm services stay bounded;
- decide which domain implementation, if any, migrates into Celerates code/database;
- retire duplicate ConForm UI routes;
- retire transitional authentication/deep-link mechanisms only after equivalent Celerates authority is proven;
- keep rollback evidence until production soak is accepted.

No big-bang rewrite is required to call the product integrated.

---

## 17. First vertical slice candidate

The strongest early slice for real mobile value is:

```text
WhatsApp reminder or Celerates Home
        ↓
Kelengkapan Saya
        ↓
Attendance gap 12 Sep
        ↓
Upload evidence + proposed correction
        ↓
Submit
        ↓
PMO → Tinjau
        ↓
Approve / reject
        ↓
readiness recalculates
        ↓
Talent sees COMPLETE / needs revision
        ↓
future reminder targeting no longer includes resolved item
```

Why this is strong:

- easy for a Talent to understand;
- useful from a phone;
- proves read + write + review + outcome;
- proves cross-system identity;
- proves Tinjau integration;
- proves deterministic state change without AI authority;
- produces a real feedback loop for the pilot.

---

## 18. Product decisions still open

These are **not** implementation gaps to fill by assumption.

### D1 — Personal Talent entry

Working direction: `Kelengkapan Saya` / personal workspace surfaced from mobile Beranda and deep links, **not** a new top-level Talent module.

Need to lock exact placement and naming.

### D2 — Task Evidence review semantics

Current ConForm behavior:

```text
stage evidence
→ explicit submit
→ final task_evidence
→ readiness sees it
```

There is no separate Attendance-like approval state in the current Task Evidence submission service.

Decision needed:

- preserve submit-as-final; or
- add PMO return/approval lifecycle as a deliberate business change.

Do not infer approval merely from "Ajukan ke PMO" wording.

### D3 — Operational Timesheet remediation

Need to decide whether Celerates Talent can directly remediate operational timesheet gaps, or whether v1 only explains the dependency/readiness while existing signed-submission/converter flows remain separate.

### D4 — BAST placement

Working direction: BAST is a PMO operational closing/output workflow, not a new top-level module.

Need to lock exact PMO placement before implementation.

### D5 — Communication V1 scope

Need to decide whether v1 includes:

- only condition-derived reminders + governed campaigns from system audiences; or
- also ad-hoc/manual audience campaigns.

Working bias: start with governed system-derived audiences, not arbitrary number blast.

### D6 — WhatsApp transport target

Current production truth is `whatsapp-web.js`.

Need explicit decision whether Celerates integration initially:

- reuses the existing transport contract; or
- moves to official Meta Cloud API using the separate branch as a donor/reference.

Do not mix transport migration into domain migration accidentally.

### D7 — Backend consolidation strategy

Working direction: federated/bounded integration first; consolidate code/data only after parity and soak.

Need to lock whether this remains the accepted migration strategy.

---

## 19. Constraints for the future implementation agent

When execution is authorized, the agent must:

1. Read `docs/14`, `docs/15`, `docs/16`, `docs/18`, this file, the relevant implementation records, and repository instructions before editing.
2. Fetch the **latest** `chore/session-20260918-fixes` HEAD and inspect newer commits if it moved beyond `49a13a42...`.
3. Never treat ConForm `main` as current implementation truth.
4. Never create a second attendance/task/timesheet truth merely to make integration easier.
5. Preserve Celerates Jernih/mobile shell and existing module boundaries.
6. Preserve Celerates server authority/RBAC; navigation visibility is not authorization.
7. Preserve ConForm source-of-truth/correction/idempotency semantics unless a product decision explicitly changes them.
8. Prefer a narrow contract/BFF adapter over direct cross-database coupling in the first iteration.
9. Do not import a second AI/chat surface.
10. Do not auto-save workflow evidence into Company Files.
11. Do not deploy production as part of planning/scaffolding unless explicitly requested.
12. Keep desktop behavior stable while adding the mobile projection.

---

## 20. Audited source map for this record

ConForm branch `chore/session-20260918-fixes`:

- `docs/payroll-attendance-current-checkpoint.md`
- `docs/bast-closing-agentic-handover.md`
- `docs/wa-session-whatsapp-web-js-migration-plan.md`
- `src/digital_bast/application/attendance_closing.py`
- `src/digital_bast/application/talent_mobile_access.py`
- `src/digital_bast/web/talent_mobile_router.py`
- `src/digital_bast/bot/task_evidence_submission.py`
- `src/digital_bast/bot/requirement_aware_evidence.py`
- `frontend/src/app/App.tsx`
- current branch comparison against `main`

Celerates branch `audit/erp-production-readiness`:

- `docs/18-mobile-pwa-shell-directions.md`
- `apps/erp/src/lib/modules-config.tsx`
- current MS3 branch commit and handoff

This list is not exhaustive. It records the source areas directly used to establish the high-level product/integration model above.

---

## 21. Next discussion step

Do **not** start implementation from this document yet.

The next product discussion should lock D1–D7, especially:

1. `Kelengkapan Saya` placement;
2. Task Evidence submit-vs-review semantics;
3. operational Timesheet behavior;
4. BAST placement under PMO;
5. Reminder vs Campaign v1 boundary;
6. current `whatsapp-web.js` reuse vs Meta Cloud target;
7. federated integration vs early consolidation.

After those decisions are locked, update this record from **planning record** to an **execution handoff**, define C0/C1 acceptance criteria against exact current code, and only then ask Opus to begin implementation.