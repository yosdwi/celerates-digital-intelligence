# 19. ConForm as a bounded operational service behind Celerates

Status: accepted for implementation (2026-09-28). Decision: [ADR-019](adr/ADR-019-conform-bounded-operational-service.md). Wire contract (provider-owned): `yosdwi/celerates-bast-digital` → `docs/celerates-integration-v1.md`.

Inspected before writing:
- Celerates `audit/erp-production-readiness` @ `49049b2`;
- ConForm `chore/session-20260918-fixes` @ `49a13a4`, the operational branch: `main` plus 435 commits, including the BAST closing wave and the Payroll attendance closing.

---

## 1. Business and product requirements

**The locked decision.**
- **Celerates is the single user-facing operational product.** Talent and PMO do their closing work in Celerates.
- **ConForm stays an independent, bounded operational service.** It owns attendance readiness, corrections, evidence, canonical BAST and canonical attendance export, and the WhatsApp transport. It exposes these through a versioned integration API.
- **Topology is independent.**
  - Celerates and Intelligence run on Railway; ConForm runs on its VPS.
  - Celerates reaches ConForm only through `CONFORM_BASE_URL` with `CONFORM_SERVICE_TOKEN`.
  - Moving both onto one VPS or private network later changes those two values and nothing else.

**Personas for this increment.**

| Persona | Needs | Must not |
|---|---|---|
| **Talent** | See *their own* open operational requirements; open a personal WhatsApp reminder link that lands in Celerates; submit an attendance correction with evidence; see it waiting on PMO, then resolved | Browse other talent, backoffice modules, the Agent, Company Files, or ConForm pages |
| **PMO** | Closing/readiness aggregate and talent drill-down; decide Talent corrections in **Tinjau**; preview and approve reminder campaigns; generate the canonical BAST; export the canonical attendance CSV; send an aggregate summary to the PMO group | Use ConForm Web for normal closing work |

**Product rules.**
- Talent Home is **Kelengkapan Saya** and is action-first. It is not a reduced backoffice menu.
- PMO gets **Operational Readiness** as a PMO submodule (`/pmo/readiness`), not a new top-level module.
- The locked Jernih mobile grammar is used unchanged: list or queue → full-screen detail → sticky action / bottom sheet → optional contextual Agent. The Agent is PMO-only.
- Installing the PWA is optional. A link opened in any mobile browser completes the work.

## 2. System-of-record ownership

| Fact | Owner | Celerates holds |
|---|---|---|
| Celerates users, sessions, divisions, levels | **Celerates** | — |
| Talent user ↔ ConForm employee link | **Celerates** (`talent_identity_links`) | the link, NRP copy for display, who linked it and when |
| Employee id, NRP, name, role, active status | **ConForm** (`employees`) | nothing persisted; read through the API |
| WhatsApp JID ↔ employee | **ConForm** (`wa_identity`, PMO directory, rebind approvals) | nothing; only a "bound or not" boolean in API responses |
| Attendance source rows, sync freshness | **ConForm** (PAMA ingest, `source_sync_state`) | nothing |
| Readiness and closing projection (Payroll cycle) | **ConForm** (`PayrollReadService`, computed on read) | nothing; never copied |
| Attendance corrections and their decisions | **ConForm** (`attendance_resolution_requests`) | nothing; the decision is *taken* in Celerates and *recorded* in ConForm with the Celerates reviewer |
| Evidence bytes | **ConForm** (`attendance_evidence`, bytea) | nothing; streamed through an authorized route |
| BAST document and generation audit | **ConForm** (`bast_artifacts`, `bast_generation_audit`, `flow_runs`) | nothing; streamed to the PMO |
| Canonical attendance CSV and export history | **ConForm** (`payroll_export_history`) | nothing; streamed to the PMO |
| Reminder campaigns, recipients, delivery state, audit | **ConForm** (`celerates_campaign*`) | nothing |
| Deep-link grants (Talent → Celerates session) | **Celerates** (`talent_link_grants`) | grant hash, user, target, expiry, use |

Nothing is copied from ConForm tables into ERP tables because their names are similar. ERP `employees` and `attendance_logs` stay what they are: ERP HR records and the ERP live check-in, respectively. They are not the ConForm attendance source.

## 3. Identity mapping

```
Celerates user (users.id, account_type='talent')
   └─ talent_identity_links (Celerates) ── conform_employee_id + nrp (copy)
                                              └─ ConForm employees.employee_id / employees.nrp
                                                    └─ ConForm wa_identity.wa_jid (WhatsApp)
Optional: talent_identity_links.erp_employee_id → ERP employees.id (HR record), when known.
```

- **One active link per Celerates user and one per ConForm employee.** Both are enforced with partial unique indexes. Revoking a link keeps the row, with `revoked_at` set.
- **Linking is an Owner action in Celerates** (PMO full later, per §4). It is taken from the PMO talent drill-down.
  - The Owner looks the talent up in ConForm by employee id, which returns the NRP, name, role and whether WhatsApp is bound. The Owner then provides the talent's email.
  - Celerates creates (or reuses) an `account_type='talent'`, `status='active'` user with **no password** and links it.
- **WhatsApp is never an authorization system.**
  - The JID never reaches Celerates, and a WhatsApp message never proves identity to Celerates.
  - A reminder carries an opaque Celerates grant that is bound to a Celerates user.
  - The JID only decides *where ConForm delivers*.
  - A rebind in ConForm changes delivery and never changes Celerates identity.

**Deep-link grant.**
- **Issuance.** Celerates issues a grant when a PMO approves a campaign: one per eligible recipient that has an active link.
  - The grant is 32 random bytes (base64url). Only its SHA-256 is stored.
  - It is bound to one user and one target path under `/me`.
  - It expires in 72 h by default, with a hard cap of 7 days. It is **single-use**.
  - The URL is `${CELERATES_PUBLIC_URL}/go/<code>`. It contains no employee id, NRP, phone number or name.
- **Opening the link.**
  - `GET /go/<code>` never consumes the grant, so WhatsApp link previews and crawlers are harmless. Only the browser's explicit sign-in call redeems it.
  - The redemption is an atomic `UPDATE … WHERE used_at IS NULL AND expires_at > now()`, and it yields a normal NextAuth session for that user.
  - **Existing session, same user:** consume the grant and continue to the target.
  - **Existing session, different user:** fail closed. Show "this link belongs to another account", do not consume, and never switch identity silently.
  - **Used, expired or unknown code:** one generic message. The page does not reveal which case applies.

## 4. Authorization / RBAC (division-level, as agreed for MS3)

**Celerates.**
- **Middleware.**
  - The Owner keeps full access, as in the pilot.
  - An **active talent session** may reach only `/me/**`, `/api/talent/**` and `/go/**`. Other pages redirect to `/me`; other APIs return 403.
  - Backoffice non-Owners remain closed, as in the pilot (§16.5 of doc 18). The PMO checks below are already written to division levels, so opening PMO to non-Owners later needs no rework here.
- **Talent server entry points** start with `requireTalentActor()`: an active talent session with an **active identity link**.
  - The ConForm employee id always comes from that link, never from the client.
  - The action-coverage test accepts this guard alongside `requirePilotActor`.

| Action | Rule in Celerates |
|---|---|
| View Operational Readiness, talent drill-down | PMO read (`requireDivisionRead('pmo')`) |
| Decide a Talent correction (Tinjau) | PMO editor+ |
| Export canonical attendance CSV | PMO editor+ |
| Generate BAST (preview or final; force requires a reason) | PMO full |
| Create a reminder campaign (draft) | PMO editor+ |
| Approve / stop a campaign | PMO full |
| Pause / resume a campaign | PMO editor+ |
| Send the PMO group summary | PMO editor+ |
| Kill switch; link a talent account | Owner |
| Talent submits a correction | the linked talent, for their own requirement only |

**ConForm.**
- The adapter authenticates **the Celerates service**, not end users. It uses a bearer `CELERATES_SERVICE_TOKEN`, compared in constant time. The token is separate from `SYNC_INGEST_TOKEN` and the bridge token.
- Every mutation carries `X-Celerates-Actor`, which ConForm records as the reviewer, exporter, requester or approver.
- ConForm re-validates its own business state immediately before every mutation:
  - a correction must still be pending and reviewable (`PayrollReviewService.bulk_decide` staleness checks);
  - a requirement must still be actionable before a correction is accepted;
  - a recipient's blocker must still be active before a send.

## 5. Versioned ConForm integration contract

**v1 base.** `${CONFORM_BASE_URL}/api/celerates/v1`. The full contract is maintained by the provider: `celerates-bast-digital/docs/celerates-integration-v1.md`.

**Consumer summary.**

| Capability | Endpoint |
|---|---|
| Capability probe | `GET /meta` |
| Closing/readiness summary, sources, BAST gate per team | `GET /readiness?year&month` |
| Talent readiness/detail and requirements | `GET /talents/requirements?employee_id&year&month` |
| Identity lookup for linking | `GET /talents/lookup?employee_id` |
| Submit attendance correction + evidence | `POST /talents/attendance-corrections` (multipart) |
| Correction queue / one correction / evidence bytes | `GET /attendance-corrections?year&month`, `GET /attendance-corrections/{id}`, `GET /attendance-corrections/{id}/evidence` |
| Decide a correction | `POST /attendance-corrections/{id}/decision` |
| BAST readiness / generation / job / document | `GET /bast/readiness`, `POST /bast/generations`, `GET /bast/generations/{job}`, `GET /bast/generations/{job}/document` |
| Canonical attendance CSV | `POST /exports/attendance` |
| Campaign create (audience snapshot) / list / detail | `POST /campaigns`, `GET /campaigns`, `GET /campaigns/{id}` |
| Campaign approve (with Celerates links) / pause / resume / stop | `POST /campaigns/{id}/approve`, `…/pause`, `…/resume`, `…/stop` |
| Dispatch tick (scheduler) | `POST /campaigns/dispatch` |
| Kill switch | `GET/PUT /control` |
| PMO group summary preview / send | `GET /pmo-summary/preview`, `POST /pmo-summary/send` |

The typed client lives server-side only: `apps/erp/src/lib/conform/client.ts`.
- The browser never receives the token or the ConForm URL.
- Errors come back as `{error:{code,message,retryable}}` and surface as a `ConformError`.

## 6. Talent mobile journey

1. ConForm's projection for the cycle marks a working day `NEEDS_TALENT_ACTION` (missing clock-in, missing clock-out, or both).
2. A PMO creates a campaign; ConForm snapshots the audience; the PMO approves it in Tinjau; Celerates issues one grant per recipient; ConForm's dispatcher sends a **personal DM**:

   > Halo Rina, ada 1 hari attendance periode Payroll September 2026 yang perlu dilengkapi (Senin 1 Sep). Lengkapi di Celerates: https://…/go/Xy… Tautan berlaku sampai 1 Okt 10:00.

3. The talent taps the link and lands on `/me?year=&month=`, **Kelengkapan Saya**. It shows the cycle, "N hari perlu dilengkapi", "M menunggu PMO", and one card per day.
4. Tapping a day opens a full-screen record: the date, recorded punches and status. The sticky action **Lengkapi** opens a sheet.
   - The sheet offers only the actions ConForm allows for that gap: "Saya bekerja" with the missing time(s); for a day with no punches, also Sakit, Izin, Cuti or Libur.
   - It asks for an evidence photo and an optional note, then **Kirim ke PMO**.
5. The card becomes *Menunggu review PMO*. After a PMO approval it disappears. After a rejection it shows the reason and can be resubmitted.
6. Out of scope for this increment: timesheet submission. The Celerates timesheet workflow is still pilot-gated (Owner-only actions), so Kelengkapan Saya does not offer it yet (§11 gaps).

## 7. PMO operational-readiness journey

1. **Modul › PMO › Operational Readiness** (`/pmo/readiness`) shows:
   - the cycle (21st–20th, with previous/next);
   - Complete / Menunggu PMO / Perlu aksi Talent / Belum terverifikasi;
   - source freshness (PAMA attendance, Redmine, IoT sheet);
   - the BAST gate per team;
   - the open-correction count linking to Tinjau.
2. The talent list uses status tabs. The drill-down shows requirements, corrections, WhatsApp bound yes/no, and the Celerates account link.
3. **Tinjau** gains two kinds:
   - **Koreksi attendance**: the ConForm pending corrections, each with a reviewable flag. The record shows the day, the raw vs proposed punches, the evidence image and the Talent's note, with **Tolak** (reason required) and **Setujui**.
   - **Kampanye pengingat**: draft campaigns. The record shows the audience with eligibility, the message preview, the window, batch size and cooldown, with **Setujui & jadwalkan** or **Batalkan**.
4. **Actions on the readiness page.**
   - Generate BAST: team, preview or final, and force with a reason. The job is polled and the PDF is downloaded from Celerates.
   - Export attendance CSV: the team, streamed from ConForm's canonical exporter.
   - Create reminder campaign.
   - Send PMO group summary: preview first, then send.

## 8. WhatsApp delivery and campaign policy

- **Transport.** Unchanged for this increment: ConForm's whatsapp-web.js session bridge. There is no Meta Cloud API migration and no anti-ban evasion.
- **Talent reminders are personal DMs.** PMO WhatsApp gets **one aggregate summary** per cycle and day (idempotent) with a Celerates link, never one group message per submission.
- **Campaign controls in ConForm** (`celerates_campaigns`):

| Control | Rule |
|---|---|
| Explicit audience snapshot | Taken at creation from the live projection; recipients are rows, not a query re-run at send |
| Eligibility | WhatsApp bound in ConForm **and** an active Celerates link (a link URL supplied at approval); otherwise `not_bound` / `no_celerates_account` and never sent |
| Per-recipient dedupe | One row per (campaign, employee); bridge `request_id = celerates-campaign:<recipient>` so a retry can never double-send; cross-campaign cooldown (default 20 h) skips `recent_duplicate` |
| Follow-up only while the blocker is active | Before each send the talent is re-projected; no actionable days → `skipped_resolved` |
| Bounded batches, pacing, cooldown | `batch_size` (default 10, max 50) per tick, a pause of `min_interval_seconds` between sends inside the worker, `cooldown_seconds` (default 600) between batches |
| Sending window | `window_start_hour`–`window_end_hour` Asia/Jakarta (default 08–18); outside it nothing is sent |
| Limited retry | `bridge_unavailable` retries up to `max_attempts` (default 3) on later ticks; `delivery_outcome_unknown` and `sending` left over from a crash become `unknown` and are **never** retried |
| Approval | A draft sends nothing; approval records the approver and the links |
| Pause / resume / stop | Explicit, audited |
| Kill switch | `celerates_integration_control.kill_switch` stops every dispatch and the PMO summary |
| Auto-pause | Transport unavailable, auth failure or unknown outcome pauses the campaign with the reason |
| Audit | `celerates_campaign_events` records every state change and each recipient outcome with the actor |
| No bulk burst | Application code never loops over the audience; only the dispatcher sends, bounded per tick |

- **Coexistence.** ConForm's existing scheduled Payroll/BAST Talent reminders keep their own switches and are off by default. While Celerates campaigns are the target surface they stay **off**, so talents never receive two reminders for one gap.

## 9. Command and idempotency semantics

- Every ConForm mutation from Celerates sends `Idempotency-Key` (8–160 characters) and `X-Celerates-Actor`.
- ConForm stores `(key, route)` → request hash and response (`celerates_idempotency`):
  - same key, same request: the stored response is replayed;
  - same key, different request: `409 idempotency_conflict`.
- The key is derived deterministically, so retrying a submit is safe:
  - correction submit: a key generated once per open sheet in the browser;
  - decision: `decision:<correction>:<approve|reject>`;
  - campaign: `campaign:<cycle>:<form nonce>`;
  - approve: `approve:<campaign>`.
- Reads are side-effect free. `POST /exports/attendance` and `POST /bast/generations` are not replayed: each call is a new audited export or job. The job id is the handle.
- A decision is **re-validated at apply time** by ConForm. If raw punches arrived since submission it returns `source_changed`; Celerates shows it and does not claim success.

## 10. End-to-end acceptance criteria

**Closed loop.**
1. ConForm projects a working day with a missing clock-in, and the talent is `NEEDS_TALENT_ACTION`.
2. The PMO creates a campaign in Celerates. The audience shows that talent as eligible.
3. The PMO approves the campaign in Tinjau, and ConForm records the approver.
4. The dispatcher sends one personal DM through the bridge. It contains a `/go/<code>` Celerates link and no identifiers.
5. The link opens Kelengkapan Saya for exactly that talent. It cannot be reused, and it refuses an existing other-user session.
6. The talent submits "Saya bekerja, masuk 08:00" with a photo. The correction exists in ConForm with `requested_by = celerates-talent:<user>`.
7. The PMO sees it in Tinjau with the evidence and approves it. ConForm records the Celerates reviewer.
8. The ConForm projection now shows the talent complete (`GAP_COVERED_BY_APPROVED_CORRECTION`), and Kelengkapan Saya shows nothing to do.
9. A new campaign for the cycle excludes the talent.
10. The canonical CSV exported from Celerates carries 08:00 for that day.

**Output paths.**
- **BAST:** readiness → generation job in ConForm's canonical assembler and renderer → PDF downloaded through Celerates.
- **CSV:** attendance export from ConForm's canonical exporter, available as a file in Celerates, with a `payroll_export_history` row naming the Celerates actor.

**Safety.** The unit tests cover:
- window, batch and pacing;
- auto-pause on transport failure;
- `unknown` never retried;
- kill switch;
- the resolved-blocker skip;
- cross-campaign dedupe;
- approval required.

## 11. Staged retirement of ConForm Web, Talent Mobile and NocoDB user-facing use

| Stage | ConForm Web (TalentOps) | ConForm Talent Mobile | NocoDB UI | Exit criterion |
|---|---|---|---|---|
| **0 (this increment)** | Internal/rollback. PMO closing work moves to Celerates | Still reachable by old WhatsApp bot replies; **no Celerates campaign links to it** | Admin data fixes only | E2E acceptance passes |
| **1 Soak (≥ 1 full cycle)** | Read-only use for comparison; BAST/CSV parity checked against Celerates output | Bot replies switch to a Celerates deep link (needs a ConForm→Celerates grant request, §12) | Unchanged | One cycle closed entirely from Celerates with no ConForm Web writes |
| **2 Hide** | Behind Cloudflare Access for admins only | Links stop being issued; route kept for rollback | Editors reduced to data stewards | Second cycle clean |
| **3 Retire** | UI routes removed; APIs the adapter depends on stay | Route removed | NocoDB stays an internal data tool or is removed with its own ADR | Explicit sign-off |

Nothing is removed in this increment.

## 12. Remaining gaps before production rollout

These are also tracked in the implementation record. The first two fix existing ConForm defects:

- **ConForm defect: BAST readiness counts any evidence as complete, even when the correction was rejected.** Payroll readiness does not (ConForm finding, both engines kept).
- **ConForm defect: the BAST PDF path is per team and month, so concurrent generations overwrite each other,** and the fingerprint ignores corrections. The adapter downloads by job, but the file can still be overwritten by a later job.
- **Talent timesheet workflow** in Celerates is still pilot-gated.
- **Linking PMO users to talent links** at scale needs a bulk import, and the ConForm `notification_email` must be verified.
- **ConForm bot DM replies** still issue ConForm Talent Mobile links. Stage 1 needs a Celerates grant request from ConForm.
- **`CELERATES_PUBLIC_URL` must be configured in ConForm** so it rejects links outside Celerates.
- **Non-Owner PMO access** needs the pilot middleware opened per ADR-019 §5 after record-level review.
