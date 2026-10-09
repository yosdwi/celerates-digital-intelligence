# ConForm automation in Celerates Workflows, and Inbox with email: definition

Status: definition, 2026-10-09 (QA doc pages 21–23). No code changes yet. This document builds on ADR-019 and doc 21. It does not replace them.

## 1. What runs today (observed on the VPS, 2026-10-09)

ConForm (`/home/debian/script/digital-bast-v2`, compose project `digital-bast-v2`) runs Prefect 3 with a process worker and a RunnerDeployment. There is a blue/green web, a WhatsApp bridge (whatsapp-web.js) and a bot worker.

| Prefect deployment | Schedule (WIB) | What it does |
|---|---|---|
| `operational-import` | every 15 min | PAMA attendance, Redmine tasks, IoT task sheet (Google Sheet) |
| `pmo-notifications` | every 15 min | PMO notifications, Payroll and BAST talent reminders plus group digests, and the dispatch tick for **Celerates campaigns** |
| `reference-data` | 00:15 daily | holidays, schedules |
| `iot-pic-update` | 01:00 daily | IoT PIC sheet update |
| `nightly-reconciliation` | 02:30 daily | reconciliation |
| `monthly-timesheets` | 00:30 on the 1st | monthly timesheets |
| `prefect-housekeeping` | hourly | deletes stale scheduled runs |

Health on 2026-10-09:
- All three sources (`attendance`, `redmine`, `iot_sheet`) last synced successfully at 01:15 WIB.
- One `iot-pic-update` run failed in the last 24 h.

Celerates already uses ConForm through `/api/celerates/v1`:
- readiness;
- corrections;
- BAST;
- CSV;
- WhatsApp campaigns (4 so far);
- direct WhatsApp messages (29 sent, 5 failed, 1 unknown).

ADR-019 decision: ConForm owns readiness, corrections, evidence, BAST, CSV, WhatsApp identity and delivery. Celerates never recomputes them.

What already exists in Celerates:
- **Reminder (V1, `/automation/reminders`).** It sends a fixed text to fixed recipients through email or a WhatsApp stub. There are 0 rows on the pilot and no cron calls `/api/cron/reminders`.
- **Workflows (`/automation/workflows`, 2026-10-09).** Its own scheduler, with in-app notifications only. The `attendance_missing` template reads the ERP attendance table. For talents whose canonical attendance is PAMA, ConForm's readiness is the truth, so this template overlaps with ConForm.

## 2. Options

| | A. Celerates Workflows as the control plane; Prefect stays the engine (recommended) | B. Move the flows into the Celerates engine | C. Replace Prefect (Temporal, n8n, Celery beat…) |
|---|---|---|---|
| What changes | Celerates Workflows lists ConForm's flows next to its own: status, last and next run, run history, "Jalankan sekarang", pause/resume. WhatsApp reminders become a Workflows action that calls the existing campaign and direct-message API. | Rewrite the PAMA, Redmine and IoT-sheet ingest and the reminder services in TypeScript. | Swap the ConForm scheduler. |
| Regression risk | Low: ConForm code is untouched except for additive v1 endpoints. | High: forks operational truth, against ADR-019 §3. | Medium: same code with a new scheduler, and no user-visible gain. |
| What Prefect already gives | retries, concurrency limit 1, timeouts, blue/green runner, housekeeping | must be rebuilt | must be rebuilt |
| Effort | ConForm: 3 additive endpoints. Celerates: one "ConForm" source in Workflows. | weeks | days, with no feature gain |

Prefect is not the problem. It is healthy, and people only lack a view of it, because the Prefect UI is admin-only behind Cloudflare. Option A gives that view inside Celerates.

### A in detail

**ConForm, additive v1** (same bearer token, actor and idempotency rules):
- `GET /workflows` returns each deployment's name, label, schedule, paused flag, last run (state, start, end, summary) and next run.
- `GET /workflows/{name}/runs?limit=` returns run history: state, timing, and step summaries from `RunSummary`.
- `POST /workflows/{name}/run` (idempotent) creates a flow run now. Allow-list: `operational-import`, `reference-data`, `iot-pic-update`, `pmo-notifications`.
- `PUT /workflows/{name}` with `{paused}` pauses or resumes the schedule. Owner only on the Celerates side, and audited in ConForm.

**Celerates:**
- The Workflows list gets a "ConForm" group. Those rows are read from the API and are not editable as templates.
- Their detail page shows the steps and run history and offers Jalankan sekarang.
- New Workflows action: **Kirim WhatsApp ke talent** (template "Reminder kelengkapan talent"). It creates a ConForm campaign for the cycle, so the approval, kill switch, window, dedupe and audit stay in ConForm.
- The `attendance_missing` template uses ConForm readiness for talents linked to ConForm, so there is no second reminder for the same gap.
- **Reminder V1 is folded in.** The menu is hidden, and its email channel becomes the Workflows action "Kirim email".

## 3. Inbox with email (QA page 23)

Facts:
- All 30 ERP accounts use `@celerates.com`. Its mail is hosted outside Google: the MX records point to `dewaspamguard.com` (cPanel-style webmail).
- `@celerates.co.id` is Google Workspace (MX `smtp.google.com`). `celeratesapps@celerates.co.id` is already connected to Celerates by OAuth, for Sheets only.

What the mail provider allows:

| Mailbox | Way to read and send from Celerates | Per-user effort |
|---|---|---|
| Google Workspace (`celerates.co.id`) | Gmail API. Either (a) domain-wide delegation, where the Workspace admin approves one service account once and every user's inbox appears with no per-user step; or (b) per-user OAuth through a "Hubungkan Gmail" button. | (a) none, (b) one click |
| cPanel hosting (`celerates.com`) | IMAP and SMTP with each user's mailbox password, stored sealed. No push: poll every few minutes. | type the mail password once |
| Shared `celeratesapps` | add the Gmail scope to the existing OAuth | none, but one shared team inbox, not personal |

Inbox page (Attio and Frappe style), shared by all options:
- Left: a list with tabs **Notifikasi** and **Email**, filters Belum dibaca / Semua, and grouping by day.
- Right: the reading pane.
- Email threads that match an Account or Deal by sender domain are linked to that record, so they also show in Deal 360.
- Phase 1 builds this page with the Notifikasi tab. The Email tab follows once the mailbox decision is made.
