# 02 — As-is technical architecture

## Observed topology (F)

The ZIP is a Next.js App Router monolith using React, TypeScript, Server Components and Server Actions. Page loaders and action modules query PostgreSQL directly through Drizzle/postgres-js. This is an internal application implementation pattern; it is not an API contract for Intelligence. Canonical diagram: [13-erp-as-is.mmd](../architecture/13-erp-as-is.mmd).

| Boundary | Evidence and current behavior | Implication |
| --- | --- | --- |
| Browser ↔ Next.js | `ERP:package.json`; 87 `page.tsx`; `ERP:next.config.mjs` permits 300 MB Server Action bodies | Large uploads and workbook/document generation share the web process. No worker isolation is supplied. |
| Server Actions | `ERP:src/app/marketing/actions.ts`, `ERP:src/app/tasks/actions.ts`, ten Sheets action files | Authorization is distributed; some modules use a strong division-level helper and others do not. An action reference is not an authorization grant. |
| Explicit HTTP API | `ERP:src/app/api/auth/[...nextauth]/route.ts`, `ERP:src/app/api/cron/reminders/route.ts` | Only two route handlers; no versioned ERP integration, health or readiness handler. |
| Database | `ERP:src/db/index.ts`; `ERP:src/db/schema.ts`; `ERP:drizzle.config.ts` | PostgreSQL with 60 tables, typed query builder, FKs and indexes. Runtime URL and migration/direct URL are separate. No checked-in migration history in the archive. |
| Authentication | `ERP:src/lib/auth.ts` — credential `authorize`, `signIn`, `jwt`, `session` callbacks | Credentials use bcrypt; Google OAuth can create pending users. Database claims are refreshed during JWT callback, but middleware reads token claims. Pending/rejected gating is concentrated in middleware. |
| Division authorization | `ERP:src/lib/require-division-access.ts:22` — `requireDivisionAccess`; `ERP:src/lib/division-map.ts`; `ERP:src/middleware.ts` | viewer/editor/full ranks and owner override exist. Cross-division pages are explicitly mapped. Helper does not check active status; some action families bypass it. |
| Self-service ownership | `ERP:src/lib/require-timesheet-access.ts`, `ERP:src/lib/require-attendance-access.ts` | Talent ownership is `users.id`; PMO privileges are separate. Do not replace these with a blanket “logged in” guard. |
| Object storage | `ERP:src/lib/storage.ts`, `ERP:src/lib/automation/storage.ts` | Supabase service-role client; candidate-documents and automation-documents buckets; one-hour signed downloads. This proves SDK coupling, not actual bucket privacy or ownership policy. |
| Google integration | `ERP:src/lib/google-sheets.ts`; `googleTokens`, `sheetConnections` | OAuth token refresh and Sheets REST requests. Tokens stored as text in DB. Each module independently maps/pulls/pushes rows. |
| Outbound automation | `ERP:src/lib/automation/reminder-engine.ts`, `channels/email.ts`, `channels/whatsapp.ts` | Resend email path, sequential dispatch, per-recipient sent/failed logs. WA is a throwing stub. No durable queue/lock/idempotency or automatic schedule registration in ZIP. |
| Audit/notification | `ERP:src/lib/activity-log.ts`, `ERP:src/lib/notifications.ts`; schema lines 778–802 | Activity and inbox records exist. They are not an immutable transition ledger or an event outbox. Many mutations then notify/log separately. |
| Files/document processing | `ERP:package.json`: ExcelJS, Docxtemplater, PizZip, Mammoth; timesheet converter and automation code | Server-side XLSX/DOCX work is real; input validation, size limits and failure recovery must accompany deployment. |

## Runtime and connection assumptions

F: `ERP:src/db/index.ts` disables prepared statements, sets a production pool maximum of 3 (development 10), idle timeout 20 seconds and connection timeout 10 seconds. It reuses a global client in non-production. Comments mention a Vercel-style pooler; these comments do not establish where the ERP is currently hosted. `drizzle.config.ts` reads `DIRECT_URL` and does not load dotenv itself. The seed does import `dotenv/config`.

R: first run one long-lived Railway web process with a bounded connection pool. Keep `prepare:false` until database compatibility is verified; do not add PgBouncer merely because comments mention serverless. Budget connections across web replicas, jobs, migrations and support sessions. At three connections per web process, two replicas plus a worker do not equal a three-connection application. Measure query latency and exhaustion before resizing.

## Configuration contract

F: explicit environment accesses below are present in code. Requiredness in the target column is R; optional modules must fail closed or be disabled when their dependencies are absent. No production values were loaded.

| Variable | Evidence | Proposed requirement / owner |
| --- | --- | --- |
| `DATABASE_URL` | `src/db/index.ts` | Web/jobs runtime, least-privilege app DB role, private network; Platform |
| `DIRECT_URL` | `drizzle.config.ts` | Migration job only, privileged migration role; Platform |
| `NEXTAUTH_SECRET` | `src/middleware.ts`, NextAuth configuration | Stable per environment; web only; Platform |
| `NEXTAUTH_URL` | NextAuth deployment configuration (implicit, not explicit ZIP access) | Exact public HTTPS origin for each environment; Platform |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `src/lib/auth.ts`, `src/lib/google-sheets.ts` | Separate OAuth app/redirects per environment if OAuth enabled; Platform + Google admin |
| `BETA_EMAILS` | `src/lib/beta.ts` | Explicit beta allowlist; optional, never substitutes for division/record authorization; Product |
| `PII_ENCRYPTION_KEY` | `src/lib/pii-crypto.ts` | 32-byte key represented as 64 hex characters, separately backed up; Security/Platform |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Both storage modules | Server only, isolated storage environment, required for existing upload path; Platform |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | `src/lib/automation/channels/email.ts` | Required only after outbound approval; verify sender domain, use test sink during pilot; Platform |
| `CRON_SECRET` | `src/app/api/cron/reminders/route.ts` | Machine endpoint only if retained, not browser session; Platform |
| `NODE_ENV` | `src/db/index.ts` | `production` at runtime |
| `PORT`, `HOSTNAME`, `RELEASE_SHA`, `APP_ENV` | Proposed runtime additions; not implemented contract | Railway binding, release context and observability; Platform |

R: validate configuration at startup, with errors naming missing keys but never values. Production secrets must not be Docker build arguments or `NEXT_PUBLIC_*`. The direct build succeeded with placeholders, which is useful evidence that production credentials need not be exposed to the image build. Real runtime dependencies remain mandatory.

## Security and operational boundary

F: AES-256-GCM field encryption exists for selected onboarding identifiers (`encryptPII`); legacy unprefixed values pass through decryption unchanged. The source does not establish encryption coverage for all records or a rotation process. Supabase service-role credentials are server environment variables, not evidenced browser leaks. The actual defect is that some server signing/deletion helpers lack resource-level checks (F03/F04).

F: root `ERP:src/app/error.tsx` provides a recovery UI; numerous actions return domain errors and revalidate pages. No dedicated loading files, structured logging/tracing setup, health endpoints, CI/test suite, migration history, backup job or deployment rollback runbook is supplied. Provider/ORM errors are handled inconsistently. DB mutations can succeed before storage, notification or activity steps fail, so “try again” may duplicate or strand work.

R: preserve current modules and add a small shared application layer for actor checks, validated commands, transactional state changes, audit records and outbox publication. Do not move all logic to Python. Python owns the critical cross-system integration adapter per ADR-001; ERP continues to own its business commands. Use database transactions for local atomicity and durable reconciliation for external side effects.

## Architecture decisions retained

All five accepted ADRs remain unchanged. ERP stays operational truth. Intelligence keeps PostgreSQL/pgvector/FTS for retrieval and metadata, LiteLLM Model Gateway, LangGraph workflows, Python integration and supporting n8n. No Airbyte or blanket row embedding is introduced. ADR-005's pinned Quay MinIO image remains the Intelligence storage baseline. Retaining the ERP's existing Supabase object storage during a Railway pilot does not replace that decision; a future consolidation would need measured migration evidence and an ADR.

External reference checked 2026-09-23: [Next.js 15 data security](https://nextjs.org/docs/15/app/guides/data-security) treats Server Actions as security-sensitive HTTP entry points and requires server-side authorization. [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control) confirms that service keys bypass Storage RLS. These explain why middleware and private buckets alone do not close the observed action-level gaps.
