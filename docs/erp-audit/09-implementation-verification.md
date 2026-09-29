# Portable ERP pilot — implementation and verification

Date: 2026-09-23. Baseline and authorization: [ADR-006](../adr/ADR-006-erp-monorepo-portable-pilot.md). This document records implementation after the independent ZIP audit; it does not rewrite that audit's facts or claim all 24 findings closed.

## Implemented facts

- ERP source imported into `apps/erp` from the audited ZIP. Next 15.5.24, Node 24, PostgreSQL 16 target. Docker standalone runtime and separate VPS Compose; existing Intelligence architecture and services preserved.
- Sixty original domain tables are represented in a checked-in baseline migration. Contextual feedback adds seven fields; login throttling and migration ledger add two operational tables. Nine reference divisions seeded; personal owner seed removed. Transactional advisory lock + migration SHA-256 prevent concurrent application/checksum drift; unknown existing DB baseline refused.
- `src/lib/actor.ts::requirePilotActor` verifies current DB-derived session claims. `access-policy.ts::assertPilotActor` restricts this release to active Owners. Middleware and protected layout gate reads; 244 exported server actions start with this guard or a disabled-integration gate. Google Sheets/public registration/reminder dispatch remain server-disabled. Revoked/deleted claims fail closed.
- `object-store.ts`, `storage.ts`, `automation/storage.ts`, `api/documents/route.ts` use private S3 with immutable upload keys, a 20 MB cap and authenticated same-origin reads. Supabase storage transport has been replaced for portability; legacy objects have not been imported.
- `marketing/actions.ts::convertLeadToOpportunity` carries position, headcount, level, price and price-period fields. Row locking serializes conversions of one lead; duplicate sequential attempts produce one tracker. Number generation occurs before the transaction to avoid acquiring a second pool connection while holding the transaction. Existing commercial values are preserved; no pricing policy was invented.
- Feature request creation stores sanitized source path (no query/fragment), server release and environment. Owner review records criteria, backlog URL, delivered release and validation notes. Invalid statuses/URL schemes are rejected. `done` requires acceptance criteria, release and validation evidence.
- DB pool is bounded (default 5), with statement and idle-transaction timeouts. Health checks cover database migration ledger and both private buckets. No model calls, external messages, Sheets writes or ERP-to-Intelligence table access were enabled.

## Verification observed

- `npm run build`: passed production compilation, type validation and route generation.
- `npm test`: four tests passed, covering actor rejection/acceptance, context/link sanitation, all 244 exported action entry guards, and migration replay/checksum drift/reference seeds. Local SQL runner used PGlite over PostgreSQL protocol because the workspace could not start native PostgreSQL. CI is configured to run this migration test against PostgreSQL 16.
- `tests/http-smoke.mjs`: passed against the real built Next server over HTTP, with disposable PGlite/S3 emulators. It exercises first-owner setup (second setup rejected), credentials login, protected page rendering, lead creation/conversion/retry, requisition + PQ creation with shared opportunity number and carried staffing fields, contextual feedback, upload/download, rejection of premature Done, complete BA evidence transition, anonymous object denial and stale revoked-session write denial. This is synthetic evidence, not BA approval, load testing or native-PG concurrency certification.
- `npm audit --omit=dev`: 0 critical, 0 high, 2 moderate after patched Next/PostCSS/nanoid/sharp resolutions. The remaining ExcelJS/UUID advisory chain is tracked; no forced major downgrade was applied. CI/build must be rerun when overrides change.
- Railway data services have actual 5000 MB volumes: PostgreSQL `c963df8c-d14c-414c-bfac-2bd59ce11f56` at `/var/lib/postgresql/data`; MinIO `9adf07c9-be83-40cc-b0d0-7eed9c9d54c9` at `/data`. Readback and redeploy verified these attachments. Initial attempts requested sizes above the workspace plan and did not apply; corrected size and completed asynchronous rollout resolved this. No platform limitation is inferred from the failed attempts.

## Remaining gates, not claims of completion

This release is an **Owner review pilot**. Broader role/record authorization, real-user onboarding, financial/payroll invariant fixes, transition/outbox recovery, source cutover reconciliation, least-privilege runtime DB/S3 credentials, offsite scheduled backups and a demonstrated restore drill remain required before real production use. Upload AV/content scanning and measured scale testing remain open. Human BA validation has not been fabricated. The controlled READ/EVENT/ACTION contract remains specified in document 07; real Intelligence binding is not enabled by this deployment.

Use `apps/erp/README.md` for Docker, VPS migration, backups and rollback. Preserve the PII encryption key alongside coordinated database/object backups. App image rollback alone is not a data rollback.

## Railway configuration correction

The current Railway connector rejects `railwayConfigFile` as deprecated. The deployment uses explicit source/build/deploy service settings with the same Dockerfile instead; the unused `apps/erp/railway.toml` has been removed. This is a provider configuration correction, not a change to ADR-006 or runtime portability.
