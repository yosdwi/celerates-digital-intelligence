# 06 — Railway production-like target

**Proposed target:** one Railway ERP web service, a dedicated Railway PostgreSQL service with durable volume, existing ERP Supabase private object storage initially, and a separate short-lived scheduled job when reminders are hardened. Keep the ERP monolith. Keep the existing Intelligence services, database and ADR-005 MinIO storage separate. This is a deployment design; no ERP service or live URL was created by the audit.

Canonical topology: [14-erp-railway-target.mmd](../architecture/14-erp-railway-target.mmd). No accepted ADR is changed. The source's Vercel/pooler comments are implementation history, not a requirement to stay on Vercel.

## Services and persistence

| Component | Minimal invited pilot | Recommended sustained validation |
| --- | --- | --- |
| ERP web | One Linux image, pinned Node and dependencies, built in CI; bind `0.0.0.0:$PORT`. Suggested initial limit 1 GB memory with measurements; large-video import disabled. | Separate staging and production-like web services; one replica each initially, size after measurements. Avoid sticky local state. |
| ERP PostgreSQL | Dedicated service/private network, persistent volume, supported pinned major version chosen after schema compatibility test; app and migration roles separate. | Independent databases/volumes/credentials per environment. Size and connection limits measured; HA/PITR only when recovery requirements justify it. |
| ERP objects | Retain current Supabase Storage with isolated private buckets and tested server authorization. No user uploads on web container filesystem. | Separate project/credentials by environment where feasible; versioned immutable object keys, lifecycle and independently tested backup/export. |
| Job service | Disabled until F07 gate. Then same reviewed codebase with a one-shot job entry point; no public port. | Scheduled occurrence calculation and durable delivery/outbox tables; long-running worker only if latency/volume requires it. |
| Migration/bootstrap | One runtime migration job with private DB access and advisory lock; explicit seed command. | Reviewed automated promotion, migration history/lock, preflight drift check, sanitized fixture seed in staging only. |
| Monitoring | Readiness/uptime, Railway CPU/memory/disk/restarts, redacted structured logs and operator alerts. | Error aggregation/traces, backup/job freshness metrics, query latency, user journey success and budget alerts. |

All entries are R except existing code coupling: `ERP:src/db/index.ts`, `src/lib/storage.ts`, `src/lib/automation/storage.ts`, reminder engine, and the missing runtime scripts/migrations reported in F01/F02.

## Storage choice and trade-offs

| Option | Evidence / trade-off | Decision for this workstream |
| --- | --- | --- |
| Keep ERP Supabase Storage | Two SDK wrappers and two bucket names already exist; minimal code/data migration. Actual project policies/backup/region are unknown and need inspection. Service role bypasses RLS, so application authorization remains required. | **Recommended first pilot**, after F03 and bucket/restore verification. Railway does not require abandoning it. |
| Railway private S3-compatible bucket | Official docs provide private durable buckets and presigned access with per-environment separation. Requires storage adapter, upload/download/URL compatibility and object migration tests. | Viable later simplification if measured cost/operations justify it. Not a silent drop-in replacement for Supabase paths/SDK. |
| Existing Intelligence MinIO baseline | ADR-005 pins the Quay image and requires durable storage. ERP does not currently use its S3 interface. Running MinIO adds operations and a separate backup obligation. | Preserve for Intelligence. Do not consolidate ERP into it without an explicit decision and migration proof. |
| Web-service local disk/volume for uploads | Container filesystem is not a durable shared object contract; custom serving/authorization/backups would need new work. | Reject as shortcut. A volume alone does not solve private downloads, versioning or replica access. |

No object bytes move merely because DB metadata migrates. Any provider change must copy objects by digest, reconcile count/size/metadata, test old path resolution and private access, preserve a rollback map, and avoid writing short-lived signed URLs as permanent identity.

## Environment, domain and secrets

R: use environments `staging` (synthetic/sanitized data) and `erp-pilot` (invited reviewers, approved data). A future production environment receives its own data and cut-over approval. A branch name alone does not isolate data. Never point a PR preview at pilot/prod DB, buckets, OAuth refresh tokens or sender credentials. Avoid casual environment cloning that copies sensitive variables/data.

Start with a Railway-provided HTTPS domain; configure a custom `erp.<owned-domain>` only once ownership/DNS are known. `NEXTAUTH_URL` and Google's authorized redirect URI must exactly match each environment's origin and `/api/auth/callback/google`. Secrets live in environment-scoped Railway variables/reference variables. Build images with nonsecret placeholders if required, then inject runtime secrets; migration credentials do not belong in web service variables.

Cloudflare is optional. If used, begin with a clearly verified DNS/TLS configuration, then enable proxy/WAF rules deliberately. Test OAuth redirects, cookies, forwarded host/protocol, Server Action origin checks, upload limits and long workbook/document requests through the full chain. Do not cache authenticated HTML, Server Action POSTs, callbacks or signed private downloads. Cloudflare Access may protect an invited pilot but must preserve OAuth callback and authenticated machine-job behavior. Do not add a second Nginx container without a demonstrated need.

Startup validates required secrets from [02](02-as-is-technical-architecture.md), redacts errors and fails closed. `PII_ENCRYPTION_KEY` must recover existing encrypted records; generating a fresh key for an imported database would break them. Back up key material separately under controlled access and test it in restoration. Placeholder audit values are never deployment credentials.

## Build, migration and release procedure

These commands describe work to implement in the canonical ERP repository, not scripts already supplied by the snapshot.

1. Record canonical upstream commit and snapshot divergence. Add reviewed runtime scripts, Dockerfile/health path and lockfile update. Multi-stage image installs dependencies, compiles, then runs only required runtime files as a non-root user. If using Next standalone output, explicitly copy `public` and `.next/static`. Direct `next start` is also valid with a complete runtime image; no framework rewrite is needed.
2. CI checks type safety, authorization/critical workflow regressions, dependency advisory disposition and image startup. Tag with commit/image digest. Build once and promote the same image. Never run a development server in Railway.
3. Establish actual database baseline before migration. On staging, apply versioned migrations to empty DB and representative masked schema; detect drift. Use an explicit runtime migration job/private connection, single migration lock and timeout. Do not run schema changes independently from every web replica or during Docker build.
4. Run idempotent reference seed (all required divisions/statuses). Bootstrap a nominated owner once from a securely supplied identity; no hardcoded personal email and no silent elevation on every deploy. Fixture seed must refuse production-like environments.
5. Before pilot promotion, record backup/checkpoint, migration compatibility and previous image. Use expand/backfill/contract migrations; destructive contract steps wait until old image is retired. Failed migration stops rollout. If a failed pre-deploy step already changed the DB, verify compatibility before restoring old code.
6. Deploy candidate; readiness checks DB query plus expected schema version with bounded timeout. `/health/live` reports process liveness; `/health/ready` is unauthenticated to platform probes but reveals no secrets/schema detail, returns 503 on unavailable DB/incompatible schema. Storage/provider checks run separately so a mail outage does not create a web restart loop. Middleware explicitly permits only these exact probe paths and the separately authenticated machine boundary.
7. Smoke test login/roles, one linked business flow, upload/download authorization, persistence across redeploy, feedback capture and safe job dry run. Stamp release SHA in UI context/logs. Release manager opens invited access only after G2 evidence.
8. Code rollback redeploys a retained immutable image and verified compatible configuration. Do not automatically reverse migrations or restore the whole DB over new user writes. If data is damaged, enter write freeze and recover to a new database, compare subsequent changes and execute a reviewed recovery plan. Rehearse both paths before real-data admission.

## Jobs and outbound control

F: current cron requires bearer auth internally but session middleware intercepts it; weekday selection ignores schedule time. R: prefer a one-shot Railway job using ERP application code directly, which removes the need for a public cron endpoint. If an HTTP trigger remains, use a dedicated machine principal, exact route policy and constant-time secret/token validation, not a human browser cookie.

Store business schedule timezone (`Asia/Jakarta`), next occurrence UTC, occurrence key, recipient/version and delivery state. Claim work transactionally with a lease; record successful recipients; retry failures with backoff, bounded attempts and dead-letter review. Provider timeout after possible delivery is `unknown_delivery`, not an automatic blind resend. Use provider idempotency where supported. Manual “send now” must use the same ledger and explicit human authorization.

Railway cron is UTC, minimum interval five minutes; an overlapping active run is skipped. Jobs must exit and release DB connections. These platform properties do not provide business idempotency or local-time semantics. Alert when last successful run is stale and distinguish “nothing due” from failure. During pilot, route mail to a test sink/allowlist and keep WhatsApp visibly unavailable.

## Backups, restoration and operating targets

R: provisional pilot objectives, to be approved by the business owner: **RPO ≤24 hours and RTO ≤4 hours** for approved pilot data. This is not an SLA delivered by merely selecting Railway. If reviewers use ERP as the sole writer for consequential transactions, agree a tighter RPO and evaluate PostgreSQL PITR before cut-over.

Enable native scheduled volume backups and verify their actual account retention; Railway documents daily/weekly/monthly options. Add encrypted logical DB exports to an independent destination with named retention/access policy. Account for schema, roles, extensions and migration history. Object storage requires its own backup/versioning plan; DB backup is not a file backup. Maintain object manifests/digests and separately escrow required decryption keys.

Restore drill: restore into an isolated environment, verify schema version and row/relationship counts, decrypt a synthetic protected value, open sampled documents by authorized ID, execute one business flow, measure elapsed recovery and record operator/evidence. Test missing/corrupt object detection and disable outbound effects in recovered environments. Alert on failed backups and storage capacity; test restore at initial gate and periodically after schema/storage changes.

Log structured event/time/release/environment/request ID/actor ID/command/outcome/latency, with sensitive values and signed URLs redacted. Alert on readiness failures, sustained error rate, disk usage, DB connection saturation, failed migrations, old backups, overdue outbox/jobs and unusual authorization denials. Proposed initial trigger thresholds are 80% storage/memory sustained, repeated readiness failure and job age beyond two expected runs; tune using pilot measurements rather than presenting them as measured limits.

## Cost and resource assumptions

No account usage or user/document volume was inspected. Values below are **planning estimates**, not a quote or measured load. Railway's published rates checked 2026-09-23: RAM $10/GB-month, CPU $20/vCPU-month, volume $0.15/GB-month, service egress $0.05/GB; Hobby $5 minimum includes $5 usage, Pro $20 includes $20. Approximate Railway bill is `max(plan minimum, eligible usage)`, plus any separately billed extras; do not add the included credit twice.

| Scenario | Explicit assumed average consumption over month | Illustrative Railway usage |
| --- | --- | --- |
| Minimum invited pilot | Web 0.5 GB + DB 0.5 GB + intermittent job equivalent 0.05 GB; total CPU 0.15 vCPU average; 5 GB DB volume; 10 GB service egress. Isolated staging runs only when testing. | `1.05×10 + 0.15×20 + 5×0.15 + 10×0.05 = $14.75/month`; budget roughly **$15–30** before extras. This is not a promise that all workloads fit 0.5 GB. |
| Recommended sustained validation | Always-on staging + pilot, each web 1 GB and DB 1 GB average; shared equivalent job usage 0.25 GB; total CPU 0.5 vCPU; 20 GB aggregate DB volumes; 30 GB service egress. | `4.25×10 + 0.5×20 + 20×0.15 + 30×0.05 = $57/month`; plan roughly **$40–90** as measured usage varies, Pro minimum applies. |

Exclude existing Intelligence stack, Supabase plan/storage/egress, independent backup storage, email, domain, optional Cloudflare/monitoring, taxes and engineering. A second always-on staging environment is not free. Document/video traffic and workbook memory can dominate these assumptions. Confirm region proximity, provider egress and actual Railway plan/limits before provisioning; use usage alerts and a named budget owner rather than an automatic hard cutoff that silently stops the ERP. Revisit after one week of measured concurrent-user, DB, upload and job activity.

## Acceptance record to collect

Project/environment IDs, region, exact service/image versions, public pilot URL, DNS/TLS/OAuth checks, DB role/volume evidence, bucket privacy, migration version, configured backup policy and timed restore report, key custody, release rollback drill, business/authorization smoke results, outbound allowlist, named BA/support/budget owners and first contextual feedback record. The audit does not supply invented IDs or claim these checks already passed.

## Primary references checked 2026-09-23

- [Railway pricing](https://docs.railway.com/pricing/plans)
- [Railway cron jobs](https://docs.railway.com/cron-jobs)
- [Railway volume backups](https://docs.railway.com/volumes/backups)
- [Railway PostgreSQL backup/restore guide](https://docs.railway.com/guides/postgres-backups-restores)
- [Railway private storage buckets](https://docs.railway.com/storage-buckets)
- [Railway environment isolation](https://docs.railway.com/guides/isolate-staging-production)
- [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)

Recheck provider-specific features/quotas/prices during implementation. Recommendations above are derived from the snapshot and these capabilities, not a claim about the user's currently configured account.
