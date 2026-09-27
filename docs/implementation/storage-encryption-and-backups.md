# Storage encryption at rest and backup/restore — verification (2026-09-27)

Scope:
- the ERP object storage;
- the Intelligence object storage;
- the Intelligence PostgreSQL database;
- for completeness, the ERP PostgreSQL database.

Why now: M6 (Company Files, [ADR-018](../adr/ADR-018-company-files-registry.md)) indexes `personal` (CV) and `commercial` (contract) text into the Intelligence database, and stores managed uploads in Intelligence object storage.

**Method:** a read-only inspection.
- **Railway**, through the Railway API: projects, services, volumes, reference wiring. Variable values are redacted to this session. **Nothing was deployed or changed.**
- **The repository:** compose files, ADR-005/006, ERP audit docs, runtime notes.
- **Public documentation** from Railway, MinIO and Supabase.

## What is deployed

| Store | Deployed as | Evidence |
| --- | --- | --- |
| ERP objects | Self-hosted MinIO (`erp-objects`, `quay.io/minio/minio:RELEASE.2025-04-22T22-12-26Z`) on a 5 GB Railway volume at `/data`, in project `celerates-erp-pilot`. No public domain; ERP reaches it over Railway private networking. **Not Supabase Storage.** | Railway service config; `erp-web` S3 credentials reference `erp-objects`; ADR-006 decision 3 |
| ERP PostgreSQL | `postgres:16-bookworm` on a 5 GB Railway volume | Railway service config; `erp-railway-pilot-runtime-notes.md` |
| Intelligence objects | Self-hosted MinIO (`minio`, same pinned image) on a 5 GB Railway volume at `/data`; the API and worker reach it privately | Railway service config; ADR-005 |
| Intelligence PostgreSQL | `pgvector/pgvector:pg16` on a 5 GB Railway volume | Railway service config |

Neither project uses Railway Buckets. All volumes are in region `ams`.

## Findings

| Property | Status | Basis |
| --- | --- | --- |
| **Encryption at rest, all four stores** | **Platform level only, and not independently documented.** Railway staff state that all data is "encrypted-at-rest on the storage level". Railway's public docs do not say this for volumes; they do for Buckets. The SOC 2 Type II report is in the Trust Center, under NDA. | [Railway Central Station answer](https://station.railway.com/questions/are-databases-encrypted-at-rest-0e719d6c); [Railway compliance](https://docs.railway.com/enterprise/compliance) |
| MinIO server-side encryption | **Not configured.** Neither MinIO service sets `MINIO_KMS_*`/KES. | Railway service variables (names); `infra/docker-compose.yml`, `infra/erp-compose.yml`; [MinIO KMS/KES](https://docs.min.io/community/minio-object-store/reference/minio-server/settings/kes.html) |
| ERP field-level encryption | NIK, NPWP, KK number and bank account in `onboarding_requests` are AES-256-GCM (`PII_ENCRYPTION_KEY`). Files are not encrypted in the application. | `apps/erp/src/lib/pii-crypto.ts` |
| **Backups, all four volumes** | **Unverified.** Railway volume backups exist (manual, and daily/weekly/monthly schedules kept 6 / 27 / 89 days), but the API available here does not show whether schedules are enabled. No restore drill is recorded in the repository. | [Railway volume backups](https://docs.railway.com/volumes/backups); `docs/erp-audit/09`; `apps/erp/README.md` |
| Point-in-time recovery | **Not available** with the current images. Railway PITR needs Railway's Postgres image with pgBackRest. | [Railway PITR](https://docs.railway.com/volumes/point-in-time-recovery) |
| Offsite copies | **None evidenced.** Railway volume backups live in the same project and environment, and wiping a volume deletes its backups. Only offsite logical dumps survive project deletion. | [Railway Postgres backups guide](https://docs.railway.com/guides/postgres-backups-restores) |

## Verdict

- **Encryption at rest:** met at the platform (disk) level, on the provider's statement, for all four stores. No additional code gate is needed for M6.
- **Restorable backup:** **not yet demonstrated for any store.** This predates M6: ERP objects and ERP data were already in this state. M6 changes the stakes as follows.

| Data | If lost without a backup |
| --- | --- |
| Intelligence DB: Company Files registry, derived CV/contract text, access log | The index is rebuildable: the next ERP sync re-registers ERP files and the worker re-extracts them. The access log and user links are lost. |
| Intelligence objects: **managed uploads** (SOP, proposals, manpower sheets) | **Lost.** These bytes exist only there. |
| ERP objects (CVs, PKS, BAST, …) and the ERP DB | Lost. Unchanged by M6. |

M6 is therefore deployable as is. **Before Company Files uploads are announced to users**, the operator should close the backup gap with the steps below. They are configuration, not code, and this session made no Railway change.

## Operator actions (Railway dashboard, per service)

1. **Enable volume backup schedules** on `erp-objects`, `erp-postgres`, `minio` (Intelligence) and `postgres` (Intelligence): daily + weekly, and monthly for the two databases.
2. **Run one restore drill** on a non-production environment:
   - restore the Intelligence `postgres` volume backup to a new volume and deploy;
   - check `SELECT count(*) FROM files` and a search in Company Files;
   - record the date and result below.
3. **Offsite logical dumps** (weekly, recommended): `pg_dump -Fc` of both databases, plus `mc mirror` of both MinIO buckets, to storage outside the Railway project.
4. **Optional hardening:** MinIO SSE with a static KMS key (`MINIO_KMS_SECRET_KEY`), if encryption beyond the platform level is required later. Existing objects need a re-copy.

| Drill | Date | Result |
| --- | --- | --- |
| Intelligence Postgres restore | — | — |
| Intelligence MinIO restore | — | — |
| ERP Postgres restore | — | — |
| ERP MinIO restore | — | — |
