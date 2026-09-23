# Celerates ERP — portable review pilot

This is the audited ERP snapshot implemented inside the Intelligence monorepo. See [ADR-006](../../docs/adr/ADR-006-erp-monorepo-portable-pilot.md) for source authority and scope. Existing business modules use a real PostgreSQL database; this is not a static prototype. Access is restricted to active Owners until the audit's wider authorization/workflow gates are complete.

## Run on a VPS

Prerequisites: Docker Engine + Compose, HTTPS reverse proxy and protected secret storage. Copy `.env.example` to `infra/.env.erp` and fill independent random secrets (hex passwords avoid URL escaping). Set `NEXTAUTH_URL` to the final HTTPS origin. Do not regenerate `PII_ENCRYPTION_KEY` during redeploys.

```sh
docker compose --env-file infra/.env.erp -f infra/erp-compose.yml up -d --build
```

Only web port `127.0.0.1:3001` is bound to the host. Reverse-proxy that address with TLS and upload limit 22 MB. Do not expose PostgreSQL, S3 API or MinIO console publicly. Open `/setup`, enter the deployment's `SETUP_TOKEN`, and choose the first Owner email/password. The transaction permits one initial Owner and cannot elevate a fixed email by reseeding. Remove `SETUP_TOKEN` after successful activation. Sign in at `/login`.

The image runs as a non-root user. It needs `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` (32+ characters), `PII_ENCRYPTION_KEY` (64 hex), S3 endpoint and credentials. Google login is optional; Sheets scope/token persistence, sync, public registration and reminder delivery are disabled for this pilot. Video/document uploads are capped at 20 MB. Documents use private S3 buckets through authenticated same-origin downloads; object keys are immutable UUID versions.

## Railway

Build root `/apps/erp`, Dockerfile `Dockerfile`, config `/apps/erp/railway.toml`, one replica, readiness `/api/health/ready`. PostgreSQL 16 volume `/var/lib/postgresql/data`; pinned MinIO volume `/data`. Private names `erp-postgres.railway.internal:5432` and `erp-objects.railway.internal:9000`. The web domain is the only public endpoint. Set `NEXTAUTH_URL` to it. Persist credentials as Railway variables, never Git. Database and object volumes must be verified before use.

Liveness tests only the web process; readiness checks migration ledger and both private buckets. Startup applies `drizzle/*.sql` transactionally with an advisory lock and SHA-256 ledger, then seeds nine divisions idempotently. Never run `drizzle-kit push` in a shared environment. Nonempty databases without the ledger are deliberately refused. New generated migrations must include reviewed data transitions; inspect existing rows before adding uniqueness constraints.

## Verification

```sh
npm ci
npm test
npm run typecheck
npm run build
node tests/http-smoke.mjs
```

Migration tests use PostgreSQL 16 in CI (`TEST_DATABASE_URL` must name a disposable empty database), or PGlite over PostgreSQL protocol in a restricted workspace. Tests modify the migration ledger in the disposable database. Never point them at a live database. Docker builds again in CI. The shared pilot policy and server-action guard coverage are regression gates; they do not assert complete multi-role security.

## Backups, restore and rollback

Before real data, schedule encrypted offsite backups and perform a restore rehearsal. A Railway volume alone is not a backup. For VPS database snapshots:

```sh
mkdir -p backups
chmod 700 backups
docker compose --env-file infra/.env.erp -f infra/erp-compose.yml exec -T postgres pg_dump -U erp -d celerates_erp -Fc > backups/erp.dump
```

Back up both `erp-candidate-documents` and `erp-automation-documents` buckets with a compatible S3 backup client, preserving keys and checksums. Store the matching PII encryption key and secret version separately in the password vault. Quiesce writes while capturing a coordinated database/object snapshot; keep the prior image digest and release SHA. Never commit dumps or keys. Restore to an isolated stack, use `pg_restore --exit-on-error` into an empty PostgreSQL database, restore objects with original keys, restore the correct PII key, then verify login, feedback, a representative attachment and counts before switching traffic. Rotate session/setup credentials when appropriate; preserve PII keys needed by the data. Operational owners must approve recovery-point/time objectives and retention.

Rollback application image only if its schema is compatible. For incompatible migrations, forward-fix or restore DB and objects together; do not just deploy old code over a changed schema. Keep the previous stack intact until acceptance. Optimize from measured pool wait, query latency and memory; initial settings are 5 app connections, 15-second statements and 10-second idle transactions, not a throughput guarantee.

## Remaining release gates

The original 24 findings remain traceable in the audit. Owner-only gates reduce pilot exposure; they do not close all record authorization, financial invariants, transition races, legacy ID reconciliation or outbox work. Contextual feedback is ready to capture BA review, but no human approval is fabricated. Intelligence contract READ/EVENT/ACTION implementation and real binding are subsequent work; this deployment does not connect Intelligence directly to ERP tables.
