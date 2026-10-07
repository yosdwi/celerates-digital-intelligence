# Sales Wave 1 — Pilot Release Runbook

**Branch:** `feat/sales-pilot-wave1-passkey`  
**Feedback backlog:** Issue #8 — Sales Wave 1 — Pilot feedback backlog  
**Scope:** production/pilot environment readiness, DB preflight, passkey RP/origin, deploy, rollback, real-user validation.

This runbook continues the current handoff. It does not redesign Sales or repeat the completed passkey/Sales hardening work.

## 1. Go / no-go before restart

The ERP image runs database migrations automatically from `scripts/start.mjs`. Therefore the target database must be checked **before** recreating the ERP container.

Required production values:

```text
AUTH_EMAIL_DOMAINS=celerates.com,celerates.co.id
NEXTAUTH_URL=https://<canonical-erp-host>
PASSKEY_RP_ID=<canonical-erp-host-without-scheme>
PASSKEY_ORIGIN=https://<canonical-erp-host>
PASSKEY_RP_NAME=Celerates ERP
```

Do not use localhost, an IP-only temporary origin, or a second hostname for passkey enrollment. WebAuthn credentials are bound to the RP/origin.

## 2. Build the exact branch revision

On the pilot VPS:

```bash
cd /opt/celerates-digital-intelligence
git fetch origin
git checkout feat/sales-pilot-wave1-passkey
git pull --ff-only origin feat/sales-pilot-wave1-passkey

RELEASE_SHA="$(git rev-parse HEAD)"
echo "$RELEASE_SHA"

sudo docker build   -f apps/erp/Dockerfile   -t "celerates-erp:wave1-$RELEASE_SHA"   apps/erp
```

Keep the previous image available for rollback.

## 3. Configure canonical auth/passkey values

Edit the root-only ERP env file without printing secrets:

```bash
sudoedit /etc/celerates/secrets/celerates-erp.env
```

Verify the five values in section 1 are present and consistent. Existing SMTP, S3, session and encryption secrets must remain unchanged unless there is a separate approved rotation.

## 4. Run read-only pilot preflight

The preflight checks:

- canonical HTTPS host and passkey RP/origin;
- corporate-domain policy;
- required runtime secret/config shape without printing secret values;
- migration tracking state;
- duplicate `requisitions.opportunity_id`;
- duplicate `opportunities.opportunity_tracker_id`;
- presence/pending state of migrations 0012/0013;
- active Sales/TA role coverage counts.

Run it against the target DB before the ERP restart:

```bash
cd /opt/celerates-digital-intelligence
RELEASE_SHA="$(git rev-parse HEAD)"

sudo docker run --rm   --network digital-bast-v2_backend   --env-file /etc/celerates/secrets/celerates-erp.env   "celerates-erp:wave1-$RELEASE_SHA"   node scripts/sales-wave1-preflight.mjs
```

Expected terminal result:

```text
GO: environment and database preflight passed.
```

A `NO-GO` result must be resolved before starting the new image. In particular, never bypass duplicate-handoff findings just to let migration 0013 succeed.

## 5. Take a database restore point

Before the migration-bearing restart, create an approved PostgreSQL backup/snapshot. One portable option from the VPS is:

```bash
sudo mkdir -p /var/backups/celerates
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

sudo docker run --rm   --network digital-bast-v2_backend   --env-file /etc/celerates/secrets/celerates-erp.env   -v /var/backups/celerates:/backup   postgres:17-alpine   sh -lc 'pg_dump "$DATABASE_URL" --format=custom --file=/backup/celerates-erp-'"$STAMP"'.dump'

sudo test -s "/var/backups/celerates/celerates-erp-$STAMP.dump"
```

The server major version must not be newer than the `pg_dump` image (the pilot database is PostgreSQL 17, so `postgres:17-alpine`). `docker exec conform-unified-pg pg_dump -U <superuser> -d celerates_erp --format=custom` also works and was used on 2026-10-07. Always verify the artifact with `pg_restore --list`.

Use the existing approved backup mechanism instead if the pilot PostgreSQL already has a managed snapshot/runbook.

## 6. Deploy

Preserve the current pilot image as a rollback tag, then promote the new build:

```bash
cd /opt/celerates-digital-intelligence
RELEASE_SHA="$(git rev-parse HEAD)"
ROLLBACK_TAG="celerates-erp:rollback-$(date -u +%Y%m%dT%H%M%SZ)"

# Tag the image the container is actually running, not an assumed :pilot tag (on 2026-10-07 it ran celerates-erp:fb4b452 and :pilot did not exist).
sudo docker tag "$(sudo docker inspect celerates-erp --format '{{.Image}}')" "$ROLLBACK_TAG"

sudo docker tag "celerates-erp:wave1-$RELEASE_SHA" celerates-erp:pilot

./infra/pilot/celerates-run.sh erp celerates-erp:pilot
```

The startup migration runner should apply pending `0012_passkeys.sql` and `0013_sales_handoff_uniqueness.sql` exactly once.

## 7. Post-deploy verification

Run bounded health checks:

```bash
curl --fail --silent --show-error http://127.0.0.1:3000/api/health/live
curl --fail --silent --show-error http://127.0.0.1:3000/api/health/ready
```

Then rerun the same preflight. It should report the passkey tables and Sales handoff unique indexes as present.

Also inspect one bounded log snapshot if readiness fails:

```bash
sudo docker ps --filter name=celerates-erp
sudo docker logs --tail=200 celerates-erp
```

Do not extend waits indefinitely. Fix the reported root cause.

## 8. Rollback

If the new runtime fails before real-user validation:

```bash
sudo docker tag <saved-rollback-tag> celerates-erp:pilot
/opt/celerates-digital-intelligence/infra/pilot/celerates-run.sh erp celerates-erp:pilot
```

Migrations 0012/0013 are additive. If rollback requires restoring database state rather than only application code, use the approved database restore procedure and the backup from section 5. Do not manually delete passkey or downstream records as an ad-hoc rollback.

## 9. Pilot account provisioning

Use Access Management as Owner so grants remain audited.

Minimum validation set:

- one Sales **viewer** account — read-only;
- one Sales **editor** account — create/update/convert;
- one Sales **full** account — editor capabilities + delete where allowed;
- one TA account able to continue from generated Requisition/PQ state.

Only approved `@celerates.com` or `@celerates.co.id` backoffice accounts are normal pilot accounts. Password + mailbox OTP remains bootstrap/recovery; passkey enrollment follows from Profile.

## 10. Real-device passkey matrix

Test only devices actually used by pilot users:

| Device | Required result |
|---|---|
| Windows Hello | enroll → logout → passkey login → session visible/revocable |
| iPhone/iPad | Face ID/device passkey login succeeds on canonical host |
| Android | device credential/biometric passkey login succeeds |
| macOS/Touch ID | test if in pilot scope |

Also verify password reset invalidates registered passkeys as designed.

Synthetic Chromium WebAuthn CI remains regression coverage; it does not replace this step.

## 11. Representative Sales journey

Run one real opportunity end-to-end:

```text
login
→ Opportunity Tracker
→ qualification
→ requirement / position / headcount
→ status
→ convert
→ PQ Tracker + Requisition
→ TA visibility
→ document / signature when applicable
```

Preserve and record the `opty_no` across the handoff.

Classify evidence in Issue #8:

- P0 — critical flow/security/data blocker;
- P1 — serious operational friction or wrong behavior;
- P2 — improvement/polish.

Fix P0/P1 only from observed evidence; do not broadly redesign the module during the pilot.

## 12. Transitional Google Sheet boundary

Before controlled pilot rollout, explicitly record:

- which Sales Sheet sync remains active;
- ERP or Sheet as the write-owner for each overlapping datum;
- who reconciles conflicts;
- retirement criterion for the transitional sync.

Do not run uncontrolled bidirectional write ownership.

## Exit condition

Sales Wave 1 may move into controlled pilot only when:

- environment + DB preflight is GO;
- migrations are applied and readiness is healthy;
- actual Sales/TA access is validated;
- real-device passkey checks for in-scope devices pass;
- the representative Sales→TA journey completes without P0;
- Sheet write ownership is explicit;
- Issue #8 is the single pilot feedback backlog.
