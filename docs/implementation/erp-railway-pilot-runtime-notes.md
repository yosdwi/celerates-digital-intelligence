# ERP Railway Pilot — Runtime Notes

Date: 2026-09-24
Project: `celerates-erp-pilot`
Environment: `production`

## Runtime topology

- `erp-web` — Next.js ERP web service
- `erp-postgres` — PostgreSQL 16 with a persistent Railway volume
- `erp-objects` — S3-compatible object service with a persistent Railway volume

The web service uses `/api/health/ready` as its Railway readiness probe. The route is intentionally dependency-aware: it checks the ERP migration ledger in PostgreSQL and object-storage availability, so a failed dependency makes the deployment unready rather than serving a partially initialized ERP.

## 2026-09-24 deployment incident

### Symptom

`erp-web` built successfully but Railway healthcheck `/api/health/ready` stayed unavailable until the deployment failed. Runtime logs showed PostgreSQL connection timeouts to `erp-postgres.railway.internal:5432`.

### Root cause

The PostgreSQL service volume is mounted at `/var/lib/postgresql/data`. Railway's mounted filesystem contains a `lost+found` entry at the volume root. The official PostgreSQL image refuses to run `initdb` directly in a non-empty data directory, so PostgreSQL repeatedly failed initialization and never opened port 5432. The ERP healthcheck failure was a downstream symptom, not a defect in the readiness route itself.

### Fix

Keep the durable volume mounted at `/var/lib/postgresql/data`, but set the PostgreSQL service variable:

```text
PGDATA=/var/lib/postgresql/data/pgdata
```

This makes the official image initialize PostgreSQL in a clean subdirectory while retaining the same persistent Railway volume.

After setting `PGDATA`, redeploy `erp-postgres`, confirm it is listening on IPv4/IPv6 port 5432 and reports `database system is ready to accept connections`, then redeploy `erp-web`.

### Verified result

After the fix:

- PostgreSQL initialized successfully in `/var/lib/postgresql/data/pgdata`.
- ERP migrations `0000_erp_snapshot_baseline.sql`, `0001_feedback_context.sql`, and `0002_login_throttle.sql` applied successfully.
- Next.js bound to `0.0.0.0:3000`.
- Railway `/api/health/ready` succeeded on the first probe.
- `erp-web`, `erp-postgres`, and `erp-objects` all reached `SUCCESS`.

## Reproducibility requirement

Any recreated Railway PostgreSQL service using a volume mounted directly at `/var/lib/postgresql/data` must preserve the `PGDATA=/var/lib/postgresql/data/pgdata` setting (or use an equivalent clean subdirectory). Do not interpret a platform deployment status alone as proof that PostgreSQL is accepting connections; verify runtime logs or an application readiness query.

The ERP readiness contract should remain dependency-aware. Do not weaken `/api/health/ready` to return `200` merely to pass Railway healthchecks; repair the failing dependency instead.
