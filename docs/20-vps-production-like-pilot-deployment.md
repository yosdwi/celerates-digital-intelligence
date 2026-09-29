# Celerates + Intelligence + ConForm — VPS Production-Like Pilot Deployment

**Status:** Deployment plan / execution contract  
**Date:** 2026-09-28  
**Primary execution environment:** existing Celerates/ConForm VPS  
**Executor:** Claude Code Remote Control running on the VPS  
**Target pilot personas:** Owner and Talent only  
**Target user-facing product:** Celerates  
**ConForm role:** independent operational-readiness engine behind Celerates

---

## 1. Purpose

This document defines the production-like VPS deployment plan for the current Celerates platform and the ConForm operational-readiness integration.

The goal is not to redesign either repository or to rewrite ConForm into Celerates. The goal is to create one production-like pilot environment on the existing VPS where:

1. Celerates ERP and Celerates Intelligence run on the same VPS as ConForm;
2. ConForm remains an independent bounded service and retains its mature source-ingestion/readiness/closing logic;
3. Celerates becomes the primary user-facing web/mobile/PWA product;
4. the pilot is intentionally limited to two personas: **Owner** and **Talent**;
5. the first end-to-end journey is usable without NocoDB or a separate ConForm/TalentOps UI;
6. Owner can review operational readiness, review Talent submissions, generate BAST, and export the canonical attendance CSV from Celerates;
7. Talent can enter from a WhatsApp reminder/deep link, be mapped to their existing identity, see only their own gaps, and complete the supported remediation flow;
8. WhatsApp campaign/blast dispatch remains disabled until the current Opus integration work has finished and has been verified end-to-end.

This is a **production-like pilot**, not the final infrastructure architecture. Railway remains available as rollback/reference during the pilot.

---

## 2. Repository and source-of-truth baseline

### Celerates

Repository:

```text
yosdwi/celerates-digital-intelligence
```

Working branch:

```text
audit/erp-production-readiness
```

Remote baseline when this document was created:

```text
beeb2f4957ebb3a0c388c32caaa1f9136db58008
```

The Opus integration work may create newer commits after this document. **Deployment must always use the latest committed and pushed integration checkpoint, never an uncommitted Claude/Opus sandbox working tree.**

### ConForm

Repository:

```text
yosdwi/celerates-bast-digital
```

Current operational branch:

```text
chore/session-20260918-fixes
```

Remote baseline when this document was created:

```text
49a13a42bad8048db6a9081cf8fc140f822ad055
```

The Opus integration work may add the Celerates integration adapter/API on top of this branch. Deployment must use the latest committed/pushed checkpoint after the integration work is complete.

### Important rule

Before executing any deployment, Claude Code must run in both repositories:

```bash
git status
git branch --show-current
git rev-parse HEAD
git log --oneline -5
```

If a repository contains uncommitted work, deployment must not overwrite, reset, or discard it. The current work must be understood first.

---

## 3. Locked product and infrastructure decisions

The following decisions are locked for this pilot unless an implementation blocker proves one of them unsafe.

### 3.1 One PostgreSQL runtime on the VPS

The target is **one PostgreSQL server/runtime**, not multiple PostgreSQL containers/services.

Domain ownership must still remain clear by using separate logical databases and separate roles inside the same PostgreSQL instance, for example:

```text
PostgreSQL 17
├── conform
├── prefect
├── celerates_erp
└── celerates_intelligence
```

A single shared schema or a single shared application role is explicitly **not** the goal.

The intended outcome is infrastructure simplification while preserving domain boundaries.

#### pgvector hard gate

Celerates Intelligence depends on PostgreSQL vector capability. Before consolidating PostgreSQL, Claude Code must verify that the unified PostgreSQL runtime can provide the required vector extension/version.

At minimum verify:

```sql
SELECT version();
SELECT * FROM pg_available_extensions WHERE name = 'vector';
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
```

If the current ConForm PostgreSQL image cannot provide pgvector safely, create a PostgreSQL 17 image/runtime that includes the required extension and perform a controlled backup/restore migration. Do not silently remove Intelligence vector functionality in order to force consolidation.

### 3.2 NocoDB is fully OFF in the pilot runtime

NocoDB is not part of the target Celerates experience.

For the pilot:

```text
NocoDB runtime = OFF
NocoDB public exposure = OFF
NocoDB volume/data = preserved temporarily for rollback only
```

No normal Owner or Talent operation may depend on NocoDB.

Do not delete the volume/data during the first pilot deployment. Disable the runtime first; physical deletion is a later cleanup after parity and soak.

### 3.3 Local Ollama must be removed from active runtime

Local Ollama is not used as the pilot AI provider.

The local Ollama service/process must be stopped and disabled from the production-like pilot runtime after Claude verifies that no active required flow still depends on it.

Celerates Intelligence continues to use the configured external model providers.

Do not leave local Ollama consuming production RAM merely as a fallback.

### 3.4 Claude Code Remote Control stays on the VPS

Claude Code Remote Control remains available on the VPS because it is the deployment/operations executor for this phase.

It is not part of the Celerates product runtime and must not become an application dependency.

During heavy production-like testing, avoid unnecessary parallel repository builds or large Claude jobs if they materially starve the runtime. However, the remote-control service itself remains installed and usable.

### 3.5 One WhatsApp transport only: whatsapp-web.js

The pilot must run exactly one WhatsApp transport implementation:

```text
whatsapp-web.js / whatsapp-web-session
```

Other experimental/legacy transports such as old `wa-session` implementations or `whatsmeow-session` must not run in parallel.

Their source directories may remain in Git for history/reference, but runtime deployment must have a single authority for the live WhatsApp session.

Preserve the existing authenticated WhatsApp session data/volume before any deployment change.

### 3.6 Existing ConForm web / Talent Mobile / TalentOps remains temporarily available

The existing ConForm web, Talent Mobile, and TalentOps surfaces are not deleted during the first pilot.

They remain as rollback/internal fallback until the Celerates Owner/Talent closed loop is proven.

Target direction:

```text
normal user entry point  -> Celerates
fallback during pilot    -> existing ConForm/Talent Mobile/TalentOps
```

Do not expand or redesign the old surfaces. They are transitional.

### 3.7 ConForm remains plug-and-play as much as possible

Do not aggressively decompose or rewrite the ConForm runtime merely to save resources.

Apart from the explicit pilot trims in this document:

- NocoDB off;
- local Ollama removed;
- only one WhatsApp Web JS transport active;

keep the proven ConForm runtime topology and business engine intact unless a real deployment blocker requires a change.

ConForm must be allowed to keep the services it needs for:

- source ingestion / bridge;
- normalized operational data;
- Redis where currently required;
- Prefect server/services/workers where currently required;
- readiness calculations;
- attendance correction;
- task/evidence workflow;
- Payroll Closing;
- BAST Closing;
- canonical CSV export;
- BAST/PDF rendering;
- WhatsApp delivery/session;
- existing fallback web/Talent Mobile/TalentOps.

Do not re-merge the dedicated BAST renderer into the main API process. The current separation exists to prevent expensive Chromium rendering from starving unrelated API traffic.

### 3.8 WhatsApp bulk/campaign work waits for Opus implementation completion

Do not enable general WhatsApp blast/campaign dispatch during the initial VPS deployment.

The initial pilot may use a tightly controlled allowlist/single-recipient test only after the relevant integration implementation exists.

Full reminder/campaign sending is enabled only after Opus has finished and the final integration contract, audience controls, deduplication, pacing, pause/stop behavior, and closed-loop tests have been reviewed.

---

## 4. Target pilot topology

The production-like VPS target is:

```text
                         Internet
                            │
                      Cloudflare
                            │
                 pilot.celeratesapps.com
                            │
                      Cloudflare Tunnel
                            │
                            ▼
                 ┌─────────────────────┐
                 │       VPS           │
                 │                     │
                 │  Celerates ERP Web  │
                 │         │           │
                 │         ├────────────── Celerates Intelligence API
                 │         │                    │
                 │         │                    └── Intelligence Worker
                 │         │
                 │         └────────────── ConForm integration client
                 │                              │
                 │                              ▼
                 │                         ConForm API
                 │                              │
                 │        ┌─────────────────────┼─────────────────────┐
                 │        │                     │                     │
                 │     Prefect               Redis             BAST Renderer
                 │                                                    │
                 │                                            whatsapp-web.js
                 │
                 │  One PostgreSQL runtime
                 │  ├ conform
                 │  ├ prefect
                 │  ├ celerates_erp
                 │  └ celerates_intelligence
                 │
                 │  Object storage / persistent volumes
                 └─────────────────────┘
```

The exact internal ports, Compose networks, and container names should follow the existing repositories rather than being invented solely from this document.

---

## 5. Domain and URL plan

### Pilot user-facing URL

Use:

```text
https://pilot.celeratesapps.com
```

for the production-like pilot.

Reason:

- clearly identifies this environment as pilot;
- safe to share with Owner and selected Talent users;
- does not prematurely claim the permanent primary domain;
- allows the future production URL to become `app.celeratesapps.com` without changing product semantics.

Suggested future progression:

```text
pilot.celeratesapps.com  -> selected production-like pilot
app.celeratesapps.com    -> primary production after pilot approval
```

### ConForm URL

ConForm should not require a new normal user-facing URL for the target experience.

Celerates should consume ConForm through a single integration base URL, configured conceptually as:

```text
CONFORM_BASE_URL=<private/internal ConForm API origin>
CONFORM_SERVICE_TOKEN=<service credential>
```

If both applications are on the same VPS, prefer a private Docker/LAN/local origin rather than routing normal Celerates-to-ConForm traffic out to the public internet.

Existing ConForm domains may remain operational temporarily for fallback/admin purposes during the pilot.

### Cloudflare

Reuse the existing Cloudflare account and `celeratesapps.com` zone.

Prefer Cloudflare Tunnel to a localhost/internal origin so the VPS does not require the application ports to be publicly exposed.

The existing ConForm tunnel configuration must be inspected before editing; do not break currently active hostnames.

---

## 6. Pilot personas and RBAC

The pilot deliberately enables only two operational personas.

### 6.1 Owner

Owner keeps the existing high authority and acts as the pilot backoffice/PMO reviewer.

Owner pilot capabilities include:

```text
- existing Celerates ERP capabilities
- operational readiness aggregate
- Talent drill-down according to authority
- Tinjau / review submissions
- approve/reject supported attendance correction
- inspect submitted evidence
- generate canonical BAST through ConForm
- export canonical attendance CSV through ConForm
- preview reminder/campaign state when implemented
```

### 6.2 Talent

Talent is strictly self-service.

Talent capabilities:

```text
- see own Kelengkapan Saya
- see own applicable attendance gaps
- submit own supported attendance correction/evidence
- see own task/evidence requirements
- use the applicable Celerates timesheet self-service flow
- see own status/history
- use Agent only within the allowed self context
```

Talent must not be able to:

```text
- browse another Talent
- access aggregate PMO readiness
- generate BAST
- export organization-wide CSV
- run campaigns
- approve another user's correction
- gain access merely because a frontend route is hidden/shown
```

Server-side authority is mandatory.

---

## 7. WhatsApp identity mapping and low-friction Talent entry

The pilot should reuse the existing ConForm WhatsApp-to-Talent mapping rather than forcing every Talent to perform a new manual registration/login flow.

Canonical conceptual mapping:

```text
Celerates user
   ↕
employee / Talent identity
   ↕
NRP / external operational identity
   ↕
ConForm employee identity
   ↕
WhatsApp JID
```

WhatsApp JID is an external identity mapping, not a permanent authorization mechanism by itself.

### Required Talent deep-link behavior

Target flow:

```text
ConForm detects actionable blocker
        ↓
WhatsApp DM to mapped Talent
        ↓
"Lengkapi sekarang"
        ↓
https://pilot.celeratesapps.com/go/<opaque-grant>
        ↓
Celerates validates grant + mapping + status + expiry
        ↓
normal Celerates Talent session
        ↓
exact Kelengkapan Saya context
```

Requirements:

- use an opaque, high-entropy grant/token;
- token is bounded to a mapped Talent and intended destination/purpose;
- token expires;
- prefer single-use exchange into a normal Celerates session;
- do not expose phone number, NRP, employee ID, or other sensitive identity information in the URL;
- if a browser already has the same Talent session, open the destination directly;
- if the browser is authenticated as a different user, fail closed instead of silently switching identity;
- Talent can complete work in the browser without first installing the PWA;
- PWA install is an optional convenience after the user has entered successfully.

Personal remediation links must be sent by direct message, not by group, because the link represents a specific mapped Talent context.

---

## 8. Celerates ⇄ ConForm integration boundary

Celerates is the user-facing authority layer. ConForm remains the operational-readiness engine.

Do not copy ConForm tables into the ERP as a shortcut.

Celerates should use one typed/server-side ConForm client instead of direct calls scattered across UI components.

Conceptual configuration:

```text
CONFORM_BASE_URL
CONFORM_SERVICE_TOKEN
```

The exact API routes must follow the adapter implemented by Opus, but the integration must ultimately support the pilot capabilities:

```text
READ
- Talent readiness / Kelengkapan Saya
- operational readiness aggregate
- source freshness/status
- closing state
- submission/review state

COMMAND
- submit supported attendance correction/evidence
- approve/reject governed correction where allowed
- BAST preview/generate
- canonical attendance CSV export

LATER / WAIT FOR OPUS COMPLETION
- campaign preview
- campaign audience snapshot
- reminder dispatch
- delivery status/audit
```

Mutating commands should be idempotent and actor-aware.

---

## 9. One-PostgreSQL migration plan

The existing ConForm PostgreSQL is the safest starting data authority because it already contains the mature operational data.

The preferred consolidation sequence is:

```text
1. backup existing ConForm PostgreSQL completely;
2. verify PostgreSQL version and pgvector availability;
3. establish a unified PostgreSQL 17 runtime capable of pgvector;
4. restore/preserve ConForm + Prefect databases;
5. create celerates_erp database + dedicated role;
6. create celerates_intelligence database + dedicated role;
7. run ERP migrations against celerates_erp;
8. run Intelligence/LangGraph migrations against celerates_intelligence;
9. verify application readiness and permissions;
10. only then disable the old redundant PostgreSQL runtimes.
```

Each application receives only its own database credential.

Example conceptual roles:

```text
conform_app
prefect_app
celerates_erp_app
celerates_intelligence_app
```

Do not give application users PostgreSQL superuser privilege.

### Required backup before migration

At minimum retain:

```text
- pg_dump/pg_dumpall as appropriate
- volume-level rollback copy/snapshot if practical
- current Docker Compose + env/secrets references
- WhatsApp authenticated session volume
- ConForm export/evidence persistent volumes
```

Do not delete old database volumes during the first successful cutover.

---

## 10. Runtime trimming matrix

| Component | Pilot state | Notes |
|---|---|---|
| ConForm API/core | KEEP | operational engine |
| ConForm Postgres data | KEEP / consolidate into unified PostgreSQL | do not lose current source-of-truth data |
| Redis | KEEP | retain where current ConForm runtime requires it |
| Prefect server/services/worker | KEEP | do not redesign scheduling today |
| BAST renderer | KEEP | isolated Chromium rendering is intentional |
| canonical CSV exporter | KEEP | reused from Celerates |
| Payroll/BAST Closing | KEEP | core business logic |
| source ingestion/bridge | KEEP | operational inputs |
| whatsapp-web.js | KEEP — sole WhatsApp transport | preserve session |
| other WA transports | RUNTIME OFF | source may stay in Git |
| NocoDB | OFF | keep data/volume temporarily for rollback |
| local Ollama | REMOVE/OFF | external Intelligence provider is used |
| ConForm web | KEEP TEMPORARILY | fallback only |
| Talent Mobile/TalentOps | KEEP TEMPORARILY | fallback only |
| Claude Remote Control | KEEP | deployment/operator tooling |
| Railway Celerates | KEEP TEMPORARILY | rollback/reference during VPS pilot |

---

## 11. Celerates runtime on the VPS

Deploy the latest pushed Celerates checkpoint required by the pilot.

Minimum runtime:

```text
- ERP Web / PWA
- Intelligence API
- Intelligence worker
- unified PostgreSQL access
- required object storage
- Cloudflare origin/tunnel integration
```

The exact service shape should be derived from the current repository deployment definitions and Railway environment rather than recreated from memory.

Copy only required production environment variables/secrets. Never print secrets into the deployment handoff or shell history unnecessarily.

### Object storage

Do not mix Company Files and workflow evidence conceptually merely because they share infrastructure.

A single object-storage runtime may be used if convenient, but keep separate buckets/prefixes/credentials for different ownership domains where the current implementation expects separation.

---

## 12. VPS resource safety

Current observed VPS baseline before this plan:

```text
4 vCPU
~8 GB RAM
~3 GB RAM used during observed state
0 swap
low CPU load during observation
```

This may be sufficient for a controlled Owner + Talent pilot if runtime trimming is applied, but it is not comfortable growth capacity for simultaneous Chromium rendering, WhatsApp Chromium, OCR/Docling, Agent traffic, builds, and closing workloads.

### Swap safety net

Before adding the Celerates runtime, create a small swap safety net unless the host/provider has an equivalent configured mechanism.

Suggested starting point:

```text
4 GB swap
vm.swappiness = 10
```

Swap is not a substitute for RAM. It is only protection from short transient spikes.

### Resource observation

Before and after deployment capture:

```bash
free -h
swapon --show
docker stats --no-stream
docker system df
df -hT
ps -eo pid,user,comm,%cpu,%mem,rss --sort=-rss | head -30
```

Do not assume the VPS is undersized until actual runtime data shows sustained memory/CPU/disk pressure.

---

## 13. Deployment phases for Claude Code Remote Control

Claude Code Remote Control is expected to execute this deployment from the VPS after the Opus integration code is committed/pushed.

### Phase A — preflight and snapshot

1. inspect both repo heads and working trees;
2. inspect active Docker/systemd services;
3. capture `docker stats`, memory, disk, and database sizes;
4. identify the one active WhatsApp Web JS session/runtime;
5. identify current Cloudflare tunnel/ingress configuration;
6. back up ConForm database and required volumes/session state;
7. verify rollback procedures before changing runtime.

No destructive action before this phase is complete.

### Phase B — explicit ConForm trimming

1. stop/disable NocoDB runtime;
2. verify no pilot-critical operation still depends on NocoDB;
3. stop/disable local Ollama after active provider dependency is verified;
4. ensure only whatsapp-web.js transport is active;
5. keep ConForm web/Talent Mobile/TalentOps available as fallback;
6. keep Prefect, Redis, bridge/source ingestion, BAST renderer, closing logic and workers as required.

### Phase C — PostgreSQL consolidation

1. perform pgvector compatibility gate;
2. establish one PostgreSQL runtime;
3. preserve ConForm/Prefect data;
4. create ERP and Intelligence logical databases/roles;
5. run migrations;
6. verify all database connections independently;
7. retain rollback volumes until soak is complete.

### Phase D — deploy Celerates runtime

1. deploy ERP Web/PWA;
2. deploy Intelligence API;
3. deploy Intelligence worker;
4. deploy/configure required object storage;
5. configure ConForm base URL/service credential;
6. verify internal Celerates → ConForm connectivity;
7. verify API readiness and web health.

### Phase E — Cloudflare pilot domain

1. add `pilot.celeratesapps.com` to the existing Cloudflare tunnel;
2. map it to the Celerates web origin;
3. keep application origin ports private/local where practical;
4. verify HTTPS, cookies/session behavior, PWA manifest and service worker under the real hostname;
5. do not break existing ConForm hostnames during pilot cutover.

### Phase F — Owner/Talent RBAC and identity smoke

1. Owner login works normally;
2. Talent mapping resolves from existing WhatsApp/Talent identity data;
3. mapped Talent deep-link flow can establish the correct restricted session;
4. Talent cannot see another person's data;
5. Owner can access PMO/Operational Readiness/Tinjau paths;
6. server-side guards fail closed.

### Phase G — one complete closed-loop pilot

Use one allowlisted real/test Talent identity.

Prove:

```text
ConForm blocker
→ mapped Talent context
→ Celerates Kelengkapan Saya
→ supported correction/evidence submission
→ Owner Tinjau
→ approve/reject
→ ConForm effective readiness recalculates
→ resolved item disappears from Talent requirements
→ Owner readiness reflects new state
→ BAST generation works from Celerates
→ attendance CSV export works from Celerates
```

The closed loop is the pilot acceptance criterion.

### Phase H — soak, not cleanup

After the first successful closed loop:

- keep Railway Celerates live as rollback/reference;
- keep ConForm web/Talent Mobile/TalentOps fallback available;
- keep old database/volume rollback artifacts temporarily;
- do not enable broad WhatsApp blast yet;
- observe CPU, RAM, disk, DB connections and application errors;
- only after soak decide which old services/volumes can be permanently removed.

---

## 14. WhatsApp campaign/blast rollout gate

General campaign/blast is deliberately not part of the initial deployment activation.

It waits for the Opus implementation and verification of:

```text
- audience resolution
- eligibility rules
- deduplication
- resolved-item exclusion
- bounded batches
- configured send windows
- pacing/cooldown
- pause/resume/stop
- transport/session failure handling
- audit trail
- no duplicate reminders after issue resolution
```

When implemented, start with an allowlisted cohort rather than the full Talent population.

The purpose is operational safety and controlled rollout, not anti-ban evasion.

---

## 15. Go-live definition for this pilot

The pilot is considered ready to share with Owner and selected Talent users only when all of the following are true:

```text
[ ] pilot.celeratesapps.com is healthy over HTTPS
[ ] Celerates ERP/PWA is running from the VPS
[ ] Intelligence API and worker are healthy
[ ] one PostgreSQL runtime is serving separated logical databases/roles
[ ] NocoDB runtime is off
[ ] local Ollama is off
[ ] Claude Remote Control remains available
[ ] exactly one WhatsApp Web JS runtime/session is active
[ ] existing ConForm/Talent Mobile/TalentOps remains available as fallback
[ ] Owner can log in and access the pilot backoffice flow
[ ] mapped Talent can enter the intended self-service context without repeated manual login setup
[ ] Talent is server-side restricted to self data
[ ] one correction/evidence submission reaches Owner/Tinjau
[ ] Owner decision updates effective ConForm readiness
[ ] Celerates can trigger canonical BAST generation
[ ] Celerates can retrieve/export canonical attendance CSV
[ ] Railway is still available as rollback/reference
[ ] broad WhatsApp campaign dispatch remains disabled until its implementation gate is passed
```

---

## 16. Explicit non-goals for the first VPS pilot

Do not block the pilot on:

```text
- migrating every ERP role to the new RBAC model;
- fully retiring ConForm web/TalentOps immediately;
- physically deleting NocoDB volumes;
- rewriting ConForm business rules into ERP;
- migrating WhatsApp Web JS to Meta Cloud API;
- general WhatsApp blast to all Talent;
- redesigning Jernih/mobile navigation;
- implementing M7 Insight Agent;
- moving every historical Railway component before the closed loop is proven;
- creating a new standalone Talent app.
```

---

## 17. Rollback principles

Rollback must remain simple during the pilot.

If the VPS Celerates candidate fails:

```text
- keep or restore existing ConForm runtime;
- restore NocoDB only if an admin fallback operation still requires it;
- restore the pre-consolidation PostgreSQL volume/dump if the DB migration failed;
- preserve WhatsApp session state;
- continue using the existing Railway Celerates deployment while VPS issues are corrected;
- revert Cloudflare pilot ingress without modifying the existing primary ConForm routes.
```

Do not delete rollback artifacts on the same day as initial go-live.

---

## 18. Post-pilot direction

After Owner + Talent closed loop is proven and has soaked:

```text
1. expand selected PMO users;
2. enable governed reminder/campaign rollout;
3. make Celerates the normal daily operational entry point;
4. remove public dependency on ConForm web/Talent Mobile/TalentOps;
5. permanently remove NocoDB only after mutation parity is proven;
6. decide whether Railway remains staging or is retired;
7. profile the VPS again under real workload;
8. upgrade to a larger VPS if sustained usage requires it;
9. only then consider the permanent `app.celeratesapps.com` production hostname.
```

The target product outcome remains:

> **Owner and Talent use Celerates. ConForm runs behind it as the operational-readiness engine.**

---

## 19. Required end-of-deployment handoff from Claude Code

After Claude Code executes this plan, it must report:

1. exact final commit SHA deployed from both repositories;
2. exact VPS service/container inventory after trimming;
3. PostgreSQL topology, logical databases and roles created;
4. whether pgvector was verified and how it is provided;
5. NocoDB status;
6. Ollama status;
7. active WhatsApp transport/session status;
8. Celerates/ConForm integration URL topology without exposing secrets;
9. Cloudflare hostname/tunnel result;
10. Owner RBAC smoke result;
11. Talent mapping/deep-link smoke result;
12. end-to-end correction/review/readiness result;
13. BAST generation result;
14. CSV export result;
15. before/after VPS CPU/RAM/disk profile;
16. test/build commands run and result;
17. anything still using the fallback ConForm/TalentOps UI;
18. remaining blocker before wider pilot rollout;
19. rollback point and backup location/reference;
20. explicit confirmation that broad WhatsApp campaign/blast is still disabled unless separately approved after Opus completion.
