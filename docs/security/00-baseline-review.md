# 00 — Security baseline and implementation handoff

**Written:** 2026-10-02, from the read-only security architecture review session.
**Purpose:** give the implementation session (M0–M4) the facts, decisions and traps it
needs without re-auditing. Read this file first, then the full review.

- Full review (Claude Doc, 18 sections, diagrams):
  https://claude.ai/code/artifact/7e876b4e-a79c-4fa7-9680-4317a3887bdf
- Nothing in this file is a secret. Secret values were never copied into it.

Labels: **FACT** = observed on the VPS or in code on 2026-10-01/02. **INFERENCE** = reasoned.

---

## 1. Locked decisions (do not reopen)

1. Railway is preview/frontend only; not part of the target production architecture.
2. ConForm web is transitional and will be retired; do not design long-term security around it.
3. Google Drive / pgvector backup architecture is out of scope for the security POC.
4. Keep the stack: Next.js ERP, PostgreSQL, MinIO, Intelligence, Cloudflare edge.
5. No Keycloak, Vault, KMS, Redis sessions, OPA, Kubernetes or a new security platform unless
   the current stack provably cannot satisfy a concrete control.
6. Corporate mailboxes are `@celerates.com` on cPanel/Roundcube at Dewaweb.
7. Backoffice auth = existing ERP password + corporate-email OTP on new/untrusted browsers +
   server-side revocable ERP session. Daily use must not require webmail.
8. Synthetic/dummy identity data only for the POC.

### Approvals already given by the owner (2026-10-02)

- Restarting `celerates-erp`, `celerates-intelligence-api` and `celerates-integration-worker`
  is acceptable: the platform is in active development.
- Still **stop and ask** before: rotating any existing shared credential, deleting data,
  changing DNS or mail infrastructure, or anything that permanently locks users out.
  Announce (do not silently do) the one-time global sign-out caused by the session cutover.

### OTP sender — owner input for M2

The owner has **no access to the `celerates.com` cPanel**, so option A
(`noreply@celerates.com` SMTP mailbox) is not available today.

The owner **does** have access to `celeratesapps@celerates.co.id`. FACT (public DNS):
`celerates.co.id` is Google Workspace — MX `smtp.google.com`, SPF
`v=spf1 include:_spf.google.com ~all`, DKIM selector `google._domainkey` present, **no DMARC**
record. Sending from it via Google's SMTP is a practical sender:

- The OTP still proves control of the recipient's `@celerates.com` mailbox; the sender domain
  does not need to match.
- Auth options: `smtp.gmail.com:587` STARTTLS with an **App Password** (needs 2-Step
  Verification on that account; a Workspace admin can disable App Passwords) or Workspace
  "SMTP relay" (`smtp-relay.gmail.com`, admin-configured).
- An App Password grants full mailbox access (IMAP too). Prefer a **dedicated** Workspace user
  (e.g. `noreply-erp@celerates.co.id`) over a shared mailbox, and store the credential as a
  root-only secret file, never in Git.
- Workspace send limits (~2,000 messages/day/user) are far above expected OTP volume.
- Verify deliverability to `@celerates.com` (inbound passes `mx1/mx2.dewaspamguard.com`) with
  a real test send before relying on it. `From:` must be the authenticated account or an
  alias so DKIM aligns.
- Adds `nodemailer` (or equivalent) to the ERP; `lib/automation/channels/email.ts` currently
  uses Resend and `RESEND_API_KEY` is unset everywhere.

Record the final choice and reasons in `docs/security/02-auth-session-implementation.md`.

---

## 2. Runtime facts (VPS `vps-4e0cf8f6`, Debian 13)

### Containers (FACT)

| Container | Image | Started by | Network | Port |
| --- | --- | --- | --- | --- |
| `celerates-erp` | `celerates-erp:pilot` (built 2026-10-01 04:12 UTC) | `docker run -d --name celerates-erp -p 127.0.0.1:3000:3000 --env-file /tmp/celerates-erp.env celerates-erp:pilot`, then attached to `digital-bast-v2_backend` | `bridge`, `digital-bast-v2_backend` | 127.0.0.1:3000 |
| `celerates-intelligence-api` | `celerates-intelligence-api:pilot` (built 2026-09-29) | ad-hoc `docker run` with `/tmp/intelligence-api.env` | `bridge`, `digital-bast-v2_backend` | 127.0.0.1:8000 |
| `celerates-integration-worker` | same image, cmd `-m cdi.worker` | ad-hoc `docker run` | same | none |
| `celerates-minio` | `celerates/minio:RELEASE.2025-10-15T17-29-55Z` | ad-hoc; **restart policy `no`** | `digital-bast-v2_backend` only | none |
| `conform-unified-pg` | `pgvector/pgvector:pg17` | ad-hoc; superuser password bind-mounted from `/tmp/conform_unified_pg_password.txt` | `digital-bast-v2_backend` only | none |

- There is **no Compose file in Git** for the Celerates containers. Recreating one means
  reproducing its `docker run` (name, port, env-file, networks, restart policy). Capture the
  run shape with `docker inspect` before removing any container.
- Public entry: Cloudflare Tunnel `ierp.celeratesapps.com` → `127.0.0.1:3000`. Intelligence is
  not public.
- `docker` group = root-equivalent; anyone in it can read every container's env via
  `docker inspect`.

### Secrets live on tmpfs (FACT — fix in M0)

- All Celerates env files and DB passwords are in `/tmp` (`celerates-erp.env`,
  `intelligence-api.env`, `celerates_erp_app_password.txt`,
  `celerates_intelligence_app_password.txt`, `conform_unified_pg_password.txt`).
- `/tmp` is **tmpfs** (wiped on reboot) and `systemd-tmpfiles` ages it out after **10 days**.
  The files date from 2026-09-28.
- **2026-10-02:** byte-identical copies (SHA-256 verified) were placed in
  `/etc/celerates/secrets/` (root:root, dir 700, files 600). The running containers still
  reference the `/tmp` paths. M0 should point every `--env-file`/bind mount at the persistent
  copies.
- The env file names match every variable in the live `celerates-erp` container.

### Database (FACT)

- One Postgres 17 runtime (`conform-unified-pg`) with DBs `conform`, `prefect`, `celerates_erp`,
  `celerates_intelligence`; per-app non-superuser roles; `celerates_erp_app` owns all 74 ERP
  tables; zero cross-database table privileges; `CONNECT` granted to `PUBLIC`; no TLS inside
  the Docker network.
- ERP migrations `0000`–`0010` in `apps/erp/drizzle/` are **all applied**, matching the repo.
- **Migrations run automatically on container start** (`apps/erp/scripts/start.mjs` →
  `migrate.mjs`): advisory lock, SHA-256 checksum per file, refuses on a changed applied file.
  A new migration ships simply by adding `0011_*.sql` and restarting the container.
- Rollback point for schema changes: `pg_dump` of `celerates_erp` before the first new
  migration (no automated backup currently covers `conform-unified-pg`).

### Object storage (FACT)

- Buckets: `celerates-pilot`, `erp-candidate-documents`, `erp-automation-documents`,
  `intelligence`. No bucket policies (private), no IAM users, no server-side encryption.
- **ERP and Intelligence both use the MinIO root credential.**
- ERP code uses bucket names `${S3_BUCKET_PREFIX || "erp"}-<logical>`
  (`lib/object-store.ts:2`); the `S3_BUCKET=celerates-pilot` env var is unused by that code.
- `start.mjs` → `initStorage()` **creates** the ERP buckets if missing, so an ERP-scoped MinIO
  policy must allow `s3:CreateBucket`/`HeadBucket` on `erp-*`, or the buckets must exist first.
- Intelligence code only touches its own bucket (`services/intelligence-api/cdi/storage.py`,
  default `intelligence`), so restricting its credential to that bucket is safe (INFERENCE from
  code).
- The MinIO container has no `mc` binary; use a one-off `minio/mc` container on
  `digital-bast-v2_backend` for user/policy setup.

### Accounts and data (FACT, counts only)

- 29 users, all active: 1 real Owner, 1 test Owner, 9 test accounts with `full` on one
  division each (`*.test.ierp@celerates.com`, one shared `TEST_ACCOUNT_PASSWORD`), 18 Talent
  (16 link-only, 2 test Talent with password). `scripts/seed-test-accounts.mjs -- --disable`
  already exists to deactivate them.
- 0 rows in `onboarding_requests`, `employees`, `talent_assignments`, `attachments`: **no real
  HR identity or compensation data is in the ERP yet.**
- 28 Talent link grants, none with an expiry; 21 still current.

### Repository state (FACT)

- Branch `feat/talent-ops-completion` @ `fb0dd0c`, plus **4 uncommitted files**:
  `apps/erp/next.config.mjs` (Server Action `allowedOrigins` for the tunnel),
  `apps/erp/src/middleware.ts` (redirect for `next-action` requests),
  `apps/erp/src/app/providers.tsx` and `apps/erp/src/i18n/request.ts` (i18n fallback).
- The running ERP image was built from that dirty tree. M0 step 1: review and commit these 4
  files so the baseline SHA equals what runs.

---

## 3. Code findings to build on (file:line, `apps/erp/src` unless stated)

### Session

- `lib/auth.ts:15` — `SESSION_MAX_AGE_SECONDS = 10 * 365 * 24 * 3600`, used at `:172`
  (`strategy: "jwt"`). No session table.
- `lib/auth.ts:118`/`:122` — `jwt` callback reloads claims **by email** whenever it runs.
- `middleware.ts:2` — `getToken` decodes the cookie only; never touches the DB. Copied cookies
  keep their embedded claims.
- 71 of 90 page files that query the DB have no in-page guard; they rely on middleware claims
  (e.g. `app/hr/[id]/page.tsx:143` decrypts NIK; `app/tm/database-salary/page.tsx:134`).
- NextAuth v4 **Credentials cannot use the `database` session strategy** → keep JWT but make it
  carry only a session id, validated against Postgres.
- Next 15.5 supports `export const config = { runtime: "nodejs", ... }` in middleware, which is
  required to query Postgres from middleware.

### Login paths

- `lib/auth.ts:53` — Google provider enabled only if `GOOGLE_CLIENT_ID/SECRET` exist (they do
  not); `:99`–`:108` auto-creates a `pending` user for **any** Google account and binds by email.
  Remove.
- Credentials provider: bcrypt; throttle `lib/login-throttle.ts:13` (20 attempts / 15 min per
  email, no per-IP key).
- `lib/auth.ts:87` — `talent-link` provider; grants in `lib/talent/identity.ts:75` (`issueGrant`,
  no TTL by default) and `:118` (`redeemGrant`, reusable until superseded). ConForm mints them
  via `app/api/internal/talent/links/route.ts` with the shared `CONFORM_SERVICE_TOKEN`.
  **Talent login must keep working** through the session change.
- `app/access-management/actions.ts` — no deactivate action (only `rejectUser` :54,
  `deleteUser` :164, `toggleOwner` :81); `inviteUser` :121 creates an active user with no
  password and no set-password flow; no access change is audited.

### Authorization

- `lib/require-division-access.ts:28` — checks `userId` only, **not status**.
- `lib/actor.ts:7` `requireActor` + `lib/access-policy.ts:9` — status-checked, DB-fresh.
- Decision logic is spread over `lib/route-access.ts`, `lib/module-access.ts`,
  `lib/operations/policy.ts`, `lib/files/sources.ts`; the target is one `can()` they delegate to.
- Existing patterns to reuse: Company Files access classes and Owner-editable
  `file_class_grants`; field masking for non-TM signers in `lib/review/queue.ts`.

### Documents and crypto

- `app/api/documents/route.ts` — module-level check only, `inline`, no audit.
- `lib/files/sources.ts:233`/`:243` — `objectModule` maps attachment `source_type` prefix
  `onboarding` → `ta`, so any TA level can read onboarding KTP/KK attachments; legacy
  `*_file_path` columns resolve to null → Owner-only.
- `lib/object-store.ts:2` — allowed logical buckets `candidate-documents`,
  `automation-documents`. The identity bucket must **not** be added to this generic route's set.
- `lib/storage.ts:5` — file type from the **extension**, no content sniffing.
- `lib/pii-crypto.ts:34` — single `PII_ENCRYPTION_KEY`, prefix `enc:v1:`, silently returns
  plaintext when the prefix is missing.

### Agent / Intelligence

- `lib/agent/delegation.ts:6` — Ed25519 delegation, 300 s TTL; `lib/agent/reads.ts:21`
  `loadActor` reloads the user from the DB on every call.
- `lib/agent/catalog.ts:4` — salary, tax, bank, documents are never declared → never read.
- `services/intelligence-api/cdi/agent/datasets.py` / `documents.py` — user-dropped files reach
  the model with **no** PII or category check (`dataset_read` in `cdi/agent/tools.py`).
- Model provider: LiteLLM → Cloudflare Workers AI.

### Audit

- `lib/activity-log.ts:13` — create/update/delete labels only; app role can rewrite it; no
  login, read, reveal, export or access-change events.

### Tests and tooling

- `npm test` = `node --import tsx --test tests/*.test.ts`; existing suites include
  `access-policy`, `action-coverage`, `module-access`, `migrations`, `talent`.
- devDependencies already include `@electric-sql/pglite`, `@electric-sql/pglite-socket` and
  `s3rver` for in-process Postgres and S3 tests; Playwright for browser journeys;
  `tests/http-smoke.mjs` for deployed smoke tests.

---

## 4. Lifecycle rule for the KTP access matrix (from the review)

- Onboarding in progress: TA collects; TA may view identity documents with capability + step-up.
- At promotion (`promoteToEmployee`, `app/ta/onboarding/actions.ts`): ownership moves to HR;
  TA access ends after a grace period (review proposal: 14 days — business may change it);
  HR with `identity_document.read` gains it.
- Owner without an explicit identity capability is denied (review recommendation; confirm with
  the business).
- Agent: status metadata only (`absent` / `uploaded` / `verified`, `verified_at`).

---

## 5. Stop-and-ask list for the implementation session

1. Rotating any existing credential (MinIO root, DB passwords, `NEXTAUTH_SECRET`,
   `PII_ENCRYPTION_KEY`, tunnel token). Creating **new** scoped credentials is fine.
2. Disabling the shared test accounts in the running environment (they may be in active use
   by testers) — confirm first.
3. Any DNS or mail-infrastructure change.
4. Deleting data or buckets.

Everything else in M0–M4, including restarting the three Celerates containers, may proceed
with evidence recorded in `docs/security/05-security-verification-results.md`.
