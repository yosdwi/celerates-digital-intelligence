# PMO and Talent completion: implementation record (2026-09-29)

This implements [doc 22](../22-pmo-talent-operational-completion.md) against the [contract additions](pmo-talent-completion-contract.md). The Agent part (P4) has its own record: [agent-knowledge-poc.md](agent-knowledge-poc.md).

**Nothing has been deployed.** Yos runs the deployment (§5).

## 1. Branches

| Repository | Branch | Contents |
|---|---|---|
| `celerates-digital-intelligence` | `feat/talent-ops-completion` (from `audit/erp-production-readiness` @ `44acd03`) | Merges of `feat/pmo-talent-rbac` (P1) and `feat/agent-knowledge-poc` (P4), plus the Talent and PMO work (P2/P3) |
| `celerates-bast-digital` (ConForm) | `feat/celerates-integration-v1` | Integration v1, plus `d8b3884`, `c01bd8b`, `ccca9c2`, `9779b51` |

## 2. What changed

### RBAC: no Owner pilot (P1)

- **Middleware.** Every active backoffice user is let in. A new route table, `lib/route-access.ts`, gates each page by the module-access rules; the longest matching prefix wins.
  - Division modules need that division at any level.
  - Shared submodules accept each division that lists them.
  - Executive and Intelligence are Owner-only.
  - Access Management and Timesheet need Owner or PMO full.
  - Everything else is open to any backoffice user.
  - APIs check their own authority.
- **Why a route table.** Only 4 of 106 pages checked division access themselves, so simply removing the gate would have opened `/hr`, `/finance` and `/tm/database-salary` to everyone.
- **Talent confinement is unchanged.** A Talent still reaches only `/me/**`, `/api/talent/**` and `/go/**`.
- **Pending accounts** reach only onboarding and the pending page.
- **Guards.** `requirePilotActor` and `assertPilotActor` are gone.
  - Every action starts with `requireActor()` (an active backoffice user; Talent accounts are refused) or `requireOwner()`, followed by the module's division and level check.
  - The action-coverage test enforces this.
- **Holes closed along the way:**
  - `lib/activity-log` and `lib/notifications` were exported as server actions, so notifications and log entries could be forged. They are now server-only.
  - An attachment delete must now name the caller's attachment types.
  - The TTD attachment delete requires the requester.
- **PMO levels.**
  - `viewer` can read.
  - `editor` can decide corrections, export CSV, create and pause or resume campaigns, send the group summary and send **Kirim pengingat**.
  - `full` can approve or stop campaigns, generate BAST and link Talent accounts.
  - Owner only: the kill switch.
- **Login.** E-mail and password now work for any active user with a password, backoffice or Talent, with rate limiting.

### Talent sign-in without expiry (R3)

- **Session.** The session lasts 10 years and renews every day.
  - The Talent's identity link is re-checked at most every 5 minutes. A revoked or replaced link ends the session.
  - Set `LINK_RECHECK_MS=0` to re-check on every request.
- **Deep links** (migration `0010_talent_links_without_expiry.sql`):
  - A link has no time expiry by default.
  - It stays single-use and bound to one user.
  - Issuing a link **supersedes** the user's older unused links.
  - New purposes: `direct` and `whatsapp`.
- **WhatsApp re-entry.** `POST /api/internal/talent/links` authenticates with the shared service token (`CONFORM_SERVICE_TOKEN` on the Celerates side, `CELERATES_SERVICE_TOKEN` on the ConForm side).
  - ConForm's bot calls it when a bound Talent sends `masuk`, `login` or `link`.
  - Exception: while an attendance draft is open, `masuk` stays a draft answer ("masuk kerja").

### Talent pages

Three tabs in the bare frame:

| Tab | Content |
|---|---|
| **Kelengkapan** | Open attendance days plus the task summary |
| **Absensi** (`/me/attendance`) | The daily PAMA log from ConForm for a Payroll cycle, with a status per day; gap days open **Lengkapi** |
| **Task** (`/me/tasks`) | Tasks for the month; add evidence (staged), then **Ajukan** submits it to ConForm, with no PMO approval |

The attendance-source adapter is `lib/attendance/source.ts`:
- `conformSource` reads through ConForm;
- `nativeSource` reads the ERP's own `attendance_logs`;
- no data is copied.

### PMO pages

- **Talent record:**
  - the day log;
  - task totals;
  - **Kirim pengingat**: one personal WhatsApp message with a fresh link. The link is issued in a transaction that commits only when ConForm accepts the message.
- **Campaign recipients** show missing tasks.

### ConForm

- **New endpoints:**
  - `GET /talents/attendance`;
  - `GET /talents/tasks`;
  - `POST /talents/tasks/{key}/evidence` and `POST /talents/tasks/submit`;
  - `POST /talents/messages`.
- **Migration `20260929_0031`:**
  - adds `celerates_direct_messages`;
  - drops the link-expiry constraint on recipients;
  - adds `missing_tasks`.
- **Campaign audience** now includes Talents with tasks that lack evidence.
- **Bot `masuk`** is added.
- **Fix: task evidence submit.** It named a unique index that migration 0011 had dropped, so "Ajukan" failed on PostgreSQL. This affected Talent Mobile too; the existing known defect is now fixed.

## 3. Verification (one full run, as agreed)

| Suite | Result |
|---|---|
| ERP unit (`npm test`) | 23/23 |
| `next build` | clean |
| Intelligence pytest | 56 passed, 1 skipped |
| ConForm unit | 530 passed, 4 failed. The 4 are the pre-existing `test_completion` / `test_whatsapp` failures. 534 tests are collected, against 507 before. |
| ConForm PostgreSQL integration | 24 passed, 6 failed. The 6 are the same failures seen on `447d566`. |
| ConForm `ruff` / `basedpyright` | 112 / 66, both unchanged |
| Browser harness (`http-smoke.mjs` with ConForm) | **16/16 PASS, exit 0** |

The cross-repo journey (`tests/conform-journey.mjs`) now also proves the following:
- **Absensi** comes from ConForm, and the corrected day shows "Menunggu PMO".
- **Task evidence** is staged, then submitted, and lands in ConForm's `task_evidence`.
- **Kirim pengingat** sends one DM (`celerates-direct:`) with no ids or phone number. It supersedes the older unused link, a second send within 10 minutes is refused, and the new link opens `/me`.
- **The re-entry endpoint** rejects a wrong token (401) and an unknown employee (404), and returns a link without expiry that signs the Talent in.

Screenshots from the run are in `docs/implementation/evidence/`:
- `conform-talent-attendance.png`
- `conform-talent-tasks.png`
- `conform-pmo-talent-message.png`

## 4. Harness notes

- **One run hit a hydration warning.** A first full run failed once on a React hydration warning (#418) in the Agent browser journey. The rerun did not reproduce it, so it is treated as a flake. That journey now records the page URL with each browser error.
- **Talent sheets refresh on close.** The Talent sheets now refresh the page when they close, not while the confirmation is showing. Refreshing earlier unmounted the confirmation, because the day stops offering "Lengkapi".

## 5. Deployment runbook (Yos)

### ConForm (VPS)

1. Deploy `feat/celerates-integration-v1`, merged into the operational branch or released. `scripts/deploy.sh` runs Alembic, which applies 0030 and 0031.
2. Create the secret `secrets/celerates_service_token` (at least 32 random characters, mode 0640) and set `CELERATES_SERVICE_TOKEN_FILE=/run/secrets/celerates_service_token`.
3. Set `CELERATES_PUBLIC_URL=https://<erp-web public domain>`. It is used for:
   - the campaign link allow-list;
   - the direct-message link check;
   - the `masuk` call. The VPS must be able to reach this URL over HTTPS.
4. Keep ConForm's own Payroll and BAST Talent reminders disabled.
5. Cloudflare Access must let Celerates (Railway egress) reach `/api/celerates/v1/*`.
6. The TalentOps WhatsApp session page stays as it is.

### Celerates (Railway, `celerates-erp-pilot` / `erp-web`)

1. Set these variables:
   - `CONFORM_BASE_URL=https://<conform host>`;
   - `CONFORM_SERVICE_TOKEN=<the same secret>`;
   - optionally `CELERATES_PUBLIC_URL` (it defaults to `NEXTAUTH_URL`).
2. Merge `feat/talent-ops-completion` into `audit/erp-production-readiness` and push. **That push is the deploy:** Railway builds it, and the container runs `db:migrate` (0009 and 0010) at start.
3. Seed the test accounts once, from a shell with the production `DATABASE_URL`, for example `railway run` or the service shell:

   ```
   TEST_ACCOUNT_PASSWORD=<password> TEST_TALENT_YOSES_EMPLOYEE_ID=<id> TEST_TALENT_PUTRA_EMPLOYEE_ID=<id> npm run seed:test-accounts
   ```

   Afterwards, `npm run seed:test-accounts -- --disable` deactivates all of them.

### Agent (intelligence-api)

See [agent-knowledge-poc.md](agent-knowledge-poc.md) §config:
- deploy `services/intelligence-api` from the same branch;
- remove the deprecated `@cf/meta/infire-llama-3.1-8b-instruct` from `AGENT_MODEL`, `FALLBACK_MODEL` and `AGENT_EVAL_MODELS`;
- prefer an instruct model with JSON output;
- upload the sample policy again after the deploy.

### Production smoke

1. As `pmo.test.ierp@celerates.com`, open PMO › Operational Readiness › Yoses › **Kirim pengingat**.
2. Yoses receives the DM. The link opens Kelengkapan; Absensi shows the PAMA days; Task lists the month.
3. Yoses sends `masuk` to the bot and receives a fresh link.
4. Tama (`talent.putra…`) repeats step 2.
5. A correction reaches Tinjau and is approved; task evidence is submitted; BAST and CSV are generated from Operational Readiness.

## 6. Known limits

- **Timesheet.** A Talent cannot open the ERP Timesheet (`/timesheet`); the Talent paths are unchanged. The pre-pilot "talent = timesheet only" accounts need a follow-up if they are still used.
- **Coarse route gate.** The gate allows viewer and above; record-level checks exist only where pages already had them.
- **Document links.** `getDocumentSignedUrl` signs any document path for any backoffice user. The paths are random, but there is no per-record check.
- **One session lifetime.** The 10-year session also applies to backoffice users, because NextAuth has one `maxAge`.
- **Direct reminders have no sending window.** They are single, human-initiated messages; campaigns keep their window.
