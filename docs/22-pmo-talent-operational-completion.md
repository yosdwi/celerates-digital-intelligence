# 22 — PMO and Talent operational completion: requirements and plan

Status: **planned**, 2026-09-29. It follows [doc 21](21-conform-bounded-service-execution.md) and [ADR-019](adr/ADR-019-conform-bounded-operational-service.md), which delivered integration v1. This document records the requirements interview with Yos and the plan that follows from it.

Goal: finish the operational loop **attendance → task list → BAST → WhatsApp** for two roles, **PMO** and **Talent**, on the real ConForm VPS, and make the Agent answer from uploaded documents.

## 1. Interview decisions

| # | Topic | Decision (Yos, 2026-09-29) |
|---|---|---|
| 1 | WhatsApp transport | Use the existing bot and session. The TalentOps web page for pairing and connection status **stays**, because the session still needs it to stay logged in. There is no new number and no Meta migration. |
| 2 | Where to test | Directly on the existing ConForm VPS deployment. |
| 3 | Yoses's identity | Yoses is already bound in ConForm's WhatsApp mapping (Postgres). |
| 4 | Talent login lifetime | **No expiry.** It must not be a hassle for the Talent. |
| 5 | Approvals | Task evidence needs **no** PMO approval. Attendance corrections **do**. Both are ConForm's existing behaviour. |
| 6 | RBAC | **Remove the Owner-only pilot gate.** Every feature works under the existing division RBAC. Seed default test accounts for every division, plus PMO, Talent and administrator (§2.2). |
| 7 | Attendance log | The ERP Attendance Log must show the Talent's attendance from ConForm (source: PAMA). ConForm is the first source behind an ERP attendance-source adapter. The Talent task list also needs data from ConForm; a view is needed if the ERP lacks one. |
| 8 | Agent model | LiteLLM through Cloudflare is already configured on Railway and on the VPS. |
| 9 | BAST with a rejected correction | BAST may still be generated. No change to the BAST gate. |
| – | Reminder schedule | Not answered. Default: manual only (PMO starts it and approves it in Tinjau), plus a single-Talent reminder. |

## 2. Requirements

### 2.1 RBAC: two operating roles on the existing division model

**R1.1 — Remove the pilot gate.**
- The `middleware.ts` backoffice gate and `assertPilotActor` ("Akses pilot hanya untuk Owner aktif") stop requiring `is_owner`.
- An active backoffice user reaches the modules that `module-access.ts` resolves for them.
- Server actions keep, or regain, their division guards.
- No authorization is weakened: every action still has an explicit guard, and the action-coverage test enforces it.

**R1.2 — PMO.** A backoffice user with the `pmo` division. The existing levels apply:
- `viewer`: Operational Readiness and Tinjau, read only.
- `editor`: correction decisions, the CSV export, creating campaigns, the group summary and single-Talent reminders.
- `full`: BAST generation, approving and stopping campaigns, and linking Talent accounts.
- Owner only: the kill switch.

**R1.3 — Talent.** `account_type = talent`, linked to one ConForm employee.
- A Talent reaches only their own surfaces (`/me/**`, plus `/timesheet/**` where the existing flag grants it).
- A Talent never browses backoffice pages.

**R1.4 — Login.**
- The e-mail and password credentials provider accepts every **active** user, not only the Owner. Rate limiting stays.
- Google login stays as it is.
- The Talent deep link (`talent-link`) stays.

### 2.2 Default test accounts

- **Seed script:** `npm run seed:test-accounts`. It is idempotent and explicit; it is not a migration.
- **Password:** taken from `TEST_ACCOUNT_PASSWORD` in the environment. **The password is never committed.**
- **Marking:** the accounts are marked as test accounts, and `--disable` deactivates all of them in one step.

| Account | Type | Access |
|---|---|---|
| `administrator.test.ierp@celerates.com` | backoffice | Owner |
| `pmo.test.ierp@celerates.com` | backoffice | `pmo` full |
| `<division>.test.ierp@celerates.com` for marketing, sales, ta, hr, tm, finance, automation, school | backoffice | that division, full |
| `talent.yoses.test.ierp@celerates.com` | talent | linked to Yoses's ConForm employee |
| `talent.putra.test.ierp@celerates.com` | talent | linked to Tama's ConForm employee (confirm the id) |

### 2.3 Talent sign-in without expiry

- **R3.1 — Session.** A Talent session does not expire while the account and its employee link are active.
  - JWT with sliding renewal.
  - Revoked by deactivating the account, revoking the link, or signing out.
  - The session re-checks the link status. A revoked link ends the session at the next request.
- **R3.2 — Deep links.**
  - Links have no time expiry.
  - Each link is still **single-use** and bound to one user.
  - Issuing a new link **supersedes** the older unused ones, so only the latest link works.
  - GET still never consumes a link.
  - Migration: relax `talent_link_grants`' 7-day check and add a `superseded_at` column.
- **R3.3 — Password.** A Talent may also sign in with e-mail and password when the account has one (the test accounts do).
- **R3.4 — Re-entry from WhatsApp.**
  - A Talent who DMs the bot `masuk` gets a fresh Celerates link.
  - ConForm calls a new Celerates endpoint, `POST /api/internal/talent/links`, authenticated by the service token with `employee_id`. Celerates mints the grant, so grant authority stays in Celerates.
  - The bot's existing Talent Mobile link replies switch to this endpoint once the integration is configured.

### 2.4 Attendance log from ConForm (attendance-source adapter)

**Finding.** The ERP Attendance Log (`/attendance/history`, table `attendance_logs`) records **native** clock-in and clock-out only (GPS and selfie). There is no source adapter today.

**R4.1 — `AttendanceSource` interface in the ERP.** It provides `daily(employeeRef, from, to)` returning rows with these fields:
- `work_date`, `check_in`, `check_out`;
- `source` (native / conform:pama);
- `gap`, and correction state and evidence count.

It has two implementations:
- `native`: reads `attendance_logs`.
- `conform`: a **read-through** over a new adapter endpoint. Attendance tables are not copied; ConForm stays the system of record.

**R4.2 — ConForm endpoint.** `GET /api/celerates/v1/talents/attendance?employee_id&from&to`, capped at 62 days.
- It reads the `attendance` rows (origin pipeline or manual) and overlays the Payroll projection state and the corrections.
- It adds no new rule.

**R4.3 — Talent view.** Talent opens `/me/attendance` (**Absensi**).
- A cycle picker; daily rows with raw PAMA check-in and check-out.
- A status chip per day: complete, gap, waiting for review, approved correction, or rejected.
- From a gap day, **Lengkapi** opens the existing correction sheet.

**R4.4 — PMO view.** PMO sees the same daily log on the Talent detail page (`/pmo/readiness/talent/[ref]`).

**R4.5 — Precedence.**
- A Talent linked to ConForm sees the ConForm source.
- A backoffice user keeps the native log.
- A later source (another client system) plugs in behind the same interface.

### 2.5 Talent task list from ConForm

**Finding.** The ERP `tasks` module is the internal backoffice kanban. It holds no Talent client work.
- Talent tasks live in ConForm (`tasks`, sourced from Redmine or Google Sheet).
- Evidence is **staged, then submitted**, with no PMO approval (`TaskEvidenceSubmissionService`).

**R5.1 — ConForm endpoints.**

| Endpoint | Purpose |
|---|---|
| `GET /talents/tasks?employee_id&year&month` | Tasks in the period, with evidence and staged counts |
| `POST /talents/tasks/{task_key}/evidence` | Multipart upload, idempotent → `stage` |
| `POST /talents/tasks/submit` | Idempotent → `submit`, actor `celerates-talent:<uuid>` |

All three reuse the Talent Mobile service rules unchanged.

**R5.2 — Talent view.** Talent opens `/me/tasks` (**Task**).
- The tasks for the period; missing evidence first.
- Upload evidence (camera or gallery), then **Ajukan**.
- Kelengkapan Saya shows the task summary next to attendance.

**R5.3 — PMO view.** The Talent detail page shows task completion. The existing ConForm evidence fast-look stays the reference.

**R5.4 — Reminders.** A reminder message also lists missing task evidence. The blocker counts as active while attendance or tasks are open.

### 2.6 WhatsApp end-to-end on the real VPS

- **R6.1 — Deployment.**
  - ConForm: `feat/celerates-integration-v1` plus this increment on the VPS, with migration 0030 and the settings in the [implementation record](implementation/conform-integration-v1.md).
  - The TalentOps web page stays.
  - ConForm's own Payroll and BAST Talent reminders stay disabled.
- **R6.2 — Single-Talent reminder.**
  - A **Kirim pengingat** action on the Talent detail page (PMO editor or higher).
  - It sends one personal DM with a fresh link.
  - It shares the campaign's dedupe, kill switch, sending window and audit.
  - It is also the way to "send a test to Yoses".
- **R6.3 — Proof on production.**
  1. Yoses and Tama receive the DM.
  2. The link opens their own Absensi and Task pages.
  3. A correction reaches PMO in Tinjau and is approved.
  4. Task evidence is submitted.
  5. BAST and CSV are generated.
  6. The group summary arrives.

### 2.7 Agent: document knowledge and understanding feedback

**Findings.**
- `intelligence-api` has `GENERATION_MODE`, `EMBEDDING_MODE`, `AGENT_MODEL`, `MODEL_API_BASE` and `REASONING_MODEL` set on Railway (names checked; values not read).
- The Agent falls back to the deterministic router whenever the model path fails validation. That answer says "(Model tidak menghasilkan jawaban yang dapat dibuktikan…)". The same fallback turns feedback detection into keyword offers.
- Company Files content reaches the model only for access classes whose policy shares content with it.
- Governed "knowledge" needs curator approval.

**R7.1 — POC.**
1. Generate a sample PDF, "Kebijakan Cuti Karyawan", with synthetic but realistic rules.
2. Upload it to Company Files in a class shared with the model.
3. Asking "berapa jatah cuti tahunan saya?" returns the answer with a citation to the page.

**R7.2 — Diagnose.** Read the run provenance (`mode`, `fallback`, the tool calls) for the failing questions and fix the cause. The candidates are:
- the model path failing validation;
- the file class not shared with the model;
- retrieval (Indonesian lexical and semantic);
- routing.

**R7.3 — Feedback understanding.**
- With the model path healthy, the model classifies intent itself; no keyword is needed.
- Add evaluation cases for implicit feedback (for example "tabel ini harusnya bisa difilter per client").
- The deterministic cues stay only as the no-model fallback.

### 2.8 Unchanged

- BAST gate and generation.
- Group security.
- ConForm ownership of readiness, corrections, task evidence, BAST, CSV and the WhatsApp identity.
- Jernih and the bottom navigation (Beranda · Modul · Agent · Tinjau · Akun). A Talent keeps the bare frame.

## 3. Deployment facts that shape the plan

- **Railway auto-deploys erp-web** on every push to `audit/erp-production-readiness` that does not carry `[skip ci]`. The live deployment is `beeb2f4`, so the integration v1 code is **not live yet**.
  - Implementation therefore happens on a feature branch.
  - **Merging into `audit/erp-production-readiness` is the deploy moment** for Celerates. That merge also runs migration 0009 and the new migration.
- **ConForm reaches the VPS** through its release workflow (merge to `main`, image pinned by digest, production reviewers) or through `scripts/deploy.sh` on the host. This workspace cannot reach the VPS over SSH, so Yos runs, or approves, the ConForm deployment.
- **Railway access here stays read-only.** Variables such as `CONFORM_BASE_URL`, `CONFORM_SERVICE_TOKEN` and `TEST_ACCOUNT_PASSWORD` are set by Yos.

## 4. Plan

| Phase | Scope | Done when |
|---|---|---|
| **P1 — RBAC and accounts** (Celerates) | Remove the pilot gate; map each of the 51 pilot-guarded files to its proper guard; open credentials login to active users; Talent sign-in without expiry (R3.1–R3.3, migration); test-account seed script | Unit, PostgreSQL and browser tests prove each division sees exactly its modules; a Talent is confined; the action-coverage test passes; the seed is idempotent |
| **P2 — Talent data** (both repos) | ConForm endpoints for attendance and tasks (R4.2, R5.1); ERP `AttendanceSource`; `/me/attendance`, `/me/tasks`; Kelengkapan summary; PMO detail log | The cross-repo harness shows a Talent seeing ConForm PAMA rows, fixing a gap and submitting task evidence; the adapter tests are clean against the ConForm baseline |
| **P3 — WhatsApp on production** | Single-Talent reminder; `masuk` re-entry endpoint and the bot reply; reminder text covers tasks; deployment runbook | Yos deploys; Yoses and Tama receive real DMs and complete the loop on production (R6.3) |
| **P4 — Agent** (parallel with P1–P3) | Cuti PDF POC; run-provenance diagnosis; fix; evaluation cases for implicit feedback | The cuti question is answered with a citation; implicit feedback is recognised without keywords |
| **P5 — Soak and retirement check** | Run a real cycle close on Celerates with ConForm Web and Talent Mobile still available | A full cycle closes with no fallback to the old surfaces (doc 21 §11) |

The order is P1 → P2 → P3, because P3's proof needs the roles and the Talent pages. P4 runs alongside.

## 5. Open items

1. Administrator e-mail: the brief says `celeratesa.com`; the plan assumes `celerates.com`.
2. `talent.putra.test.ierp@celerates.com` is for Tama. His ConForm employee id and WhatsApp binding still need confirming.
3. Test accounts on production share one password. Accept for the test window, then run `--disable`.
4. Who runs the ConForm VPS deployment, and by which path (release workflow or host script).

## 6. Risks

- **The widest change is removing the pilot gate.** Mitigations:
  - it is done per file, not by a global switch;
  - the coverage test fails on any action without a guard;
  - browser tests run per division.
- **Links without expiry.** Mitigations: single use, only the latest link valid, bound to one user, and revocable. A forwarded link that was already used is dead.
- **Read-through dependency.** Mitigations: when ConForm is down, Absensi and Task show "sumber tidak tersedia" and Celerates keeps working, as Tinjau already does.
