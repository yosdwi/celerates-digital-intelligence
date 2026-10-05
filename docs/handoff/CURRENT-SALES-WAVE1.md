# CURRENT HANDOFF — Sales Wave 1 Pilot

**Last updated:** 2026-10-05  
**Repository:** `yosdwi/celerates-digital-intelligence`  
**Active implementation branch:** `feat/sales-pilot-wave1-passkey`  
**Current automated-green checkpoint:** `39364a35c00fea36a1d1bcd57b5cb3010be20288`  
**Current execution continuation head before this handoff update:** `8980dc0a389080b3d5e7c173ef7ae106afa734f6`

This file is the **session-to-session execution handoff** for the current pilot.  
A new ChatGPT/agent session must read this file together with `AGENTS.md` and `docs/development/01-development-execution-rules.md` before making changes.

Do **not** restart the architecture audit, re-plan Wave 1 from zero, or recreate work already listed as implemented/verified below.

---

## 1. Product / management decisions already locked

### ERP direction

- Celerates ERP is the **Digital Operational Core** for the capabilities it owns.
- Intelligence is downstream from trusted operational state; it is not the source of truth.
- Business/domain architecture is separate from user navigation/workspaces.
- Prefer configuration/reusable interaction patterns before custom one-off screens.
- Existing specialist systems can be retained/integrated/migrated/rebuilt/retired capability-by-capability.
- Full Mekari Talenta replacement is **not** an initial prerequisite.

Canonical architecture alignment lives in:

- `docs/01-product-and-architecture.md`
- `docs/05-execution-plan.md`
- `docs/architecture/12-current-transition-target.mmd`
- `docs/adr/ADR-020-capability-driven-migration-and-vps-target.md`

### Wave 1 pilot

Wave 1 is **Sales first**, because Sales is the upstream entry point of the operational lifecycle.

Critical pilot path:

```text
Sales login
  ↓
Opportunity Tracker
  ↓
Qualification / requirement / status
  ↓
Convert
  ├─ PQ Tracker
  └─ Requisition
        ↓
clean handoff to TA
  ↓
PQ document / signature when applicable
```

Pre-Sales Intelligence is **not** a blocker for the operational Sales pilot.

Execution baseline:

- `docs/23-sales-pilot-wave-1.md`

### Authentication decision

Approved backoffice login paths:

- WebAuthn passkey / device biometric (Face ID / Touch ID / Windows Hello / supported device verification);
- corporate identity under `@celerates.com`;
- corporate identity under `@celerates.co.id`.

Important:

- Celerates does **not** store fingerprint/face templates.
- Authenticator private keys stay on the user's device.
- ERP stores credential id/public key/counter/audit metadata only.
- Email/password + corporate mailbox OTP remains bootstrap/recovery.
- Google OAuth is not reintroduced.
- Corporate domains are mailbox eligibility rules, not an OIDC/SAML IdP claim.

---

## 2. Branch / PR stack — do not lose this dependency

Architecture PR:

- **PR #6** — `docs: align ERP-first architecture, migration strategy, and VPS target`
- branch: `docs/architecture-alignment-oct-2026`
- base: `feat/talent-ops-completion`
- currently open / draft at this handoff

Wave 1 implementation PR:

- **PR #7** — `feat: prepare Sales Wave 1 pilot with passkey authentication`
- branch: `feat/sales-pilot-wave1-passkey`
- base: `docs/architecture-alignment-oct-2026`
- currently open
- this PR is intentionally stacked on the architecture branch

Do not accidentally retarget or flatten the stack without checking the architecture PR state.

---

## 3. Implemented — authentication

Already implemented on the active branch:

- dual corporate-domain policy:
  - `celerates.com`
  - `celerates.co.id`
- non-corporate backoffice invitations are refused;
- WebAuthn/passkey login option on the ERP login screen;
- passkey registration from Profile;
- passkey revoke from Profile;
- discoverable/resident credential requirement;
- server-side WebAuthn verification:
  - challenge;
  - RP ID;
  - origin;
  - user presence;
  - user verification;
  - public-key signature;
  - authenticator counter when provided;
- passkey login creates a normal revocable DB-backed ERP session;
- passkey session appears in session/security UI;
- corporate password + mailbox OTP stays available for bootstrap/recovery;
- mailbox-backed password reset revokes sessions, trusted browser state, and registered passkeys;
- public passkey login challenge endpoint is the only passkey endpoint exposed before auth;
- registration stays behind an authenticated backoffice session plus current-password confirmation;
- registration/login paths are rate limited.

Database migration:

- `apps/erp/drizzle/0012_passkeys.sql`

Security docs:

- `docs/security/02-auth-session-implementation.md`

Main implementation:

- `apps/erp/src/lib/security/passkey.ts`
- `apps/erp/src/lib/auth.ts`
- `apps/erp/src/app/api/passkey/login/options/route.ts`
- `apps/erp/src/app/api/passkey/register/route.ts`
- `apps/erp/src/app/login/login-form.tsx`
- `apps/erp/src/app/profile/passkeys-panel.tsx`

---

## 4. Implemented — Sales Wave 1 hardening

Already implemented:

- Opportunity Tracker remains the existing Sales baseline; no greenfield Sales rebuild;
- Sales `viewer / editor / full` access is reflected in the UI:
  - viewer = read-only;
  - editor = mutate/update/convert;
  - full = editor capabilities + delete;
- Sales-only users are not redirected into the TA workspace after conversion;
- Opportunity → Requisition + PQ Tracker remains transactional;
- `opty_no` remains the cross-flow traceability key;
- conversion is protected against double-submit/retry/concurrent duplicate creation;
- DB enforces one downstream Requisition and one PQ Tracker for the same upstream Opportunity Tracker;
- Sales handoff now requires:
  - Sales Qualified;
  - valid position;
  - integer headcount >= 1;
- duplicate conversion behavior is covered by HTTP regression;
- downstream record visibility is included in the automated Sales browser journey.

Database migration:

- `apps/erp/drizzle/0013_sales_handoff_uniqueness.sql`

Main Sales implementation:

- `apps/erp/src/app/sales/opportunity-tracker/actions.ts`
- `apps/erp/src/app/sales/opportunity-tracker/page.tsx`
- `apps/erp/src/app/sales/opportunity-tracker/opportunity-trackers-table.tsx`
- `apps/erp/src/app/sales/opportunity-tracker/opportunity-kanban.tsx`
- `apps/erp/src/app/sales/opportunity-tracker/tracker-view-tabs.tsx`

---

## 5. Automated E2E / CI status at this handoff

The expensive CI loop was refactored because earlier development became too slow.

Mandatory workflow rules now live in:

- `docs/development/01-development-execution-rules.md`

Key rule:

> **CI is a verifier, not the primary debugger.**

Current model:

```text
logical batch
  ↓
Fast Gate
  ↓
Integration Gate
  ↓
Full Gate at checkpoint / review readiness
```

Additional bounded-wait rule:

- no unbounded/opaque sleep loops;
- jobs have timeout limits;
- service readiness uses bounded/native wait semantics where possible;
- deterministic failures are diagnosed before rerunning an expensive gate.

### Current green checkpoint

At branch checkpoint `39364a35c00fea36a1d1bcd57b5cb3010be20288`:

- **ERP pilot checks** — success
  - run id: `37292241819`
- **P0 verification** — success
  - run id: `37292241890`

Therefore the automated review-checkpoint is currently **green**.

Earlier run confusion came from repeated polling and long-running full workflows, not from a permanent deadlock. The current branch has passed both major workflows.

### Sales browser E2E

Automated Sales Wave 1 browser coverage is in:

- `apps/erp/tests/sales-pilot-browser.mjs`
- wired into `apps/erp/tests/http-smoke.mjs`

It covers a disposable/synthetic path including:

- authenticated corporate bootstrap;
- passkey enrollment with virtual WebAuthn authenticator;
- passkey login;
- Sales Opportunity visibility;
- converted-state duplicate guard;
- downstream TA visibility.

This is **not** a substitute for real-device biometric checks or real Sales/TA pilot users.

---

## 6. CI / infrastructure fixes already made — do not rediscover them

Issues already found and addressed during the current session:

### Duplicate / expensive CI loop

Problem:

- repeated small commits were triggering expensive CI too frequently.

Resolution:

- mandatory batch-first development rules;
- fast-vs-full gate split;
- concurrency/cancel superseded runs;
- full suites reserved for review/checkpoint/high-risk work.

### Opaque sleep/readiness waiting

Problem:

- visible repeated waiting made execution look stuck.

Resolution:

- bounded wait rule in development rules;
- job-level `timeout-minutes`;
- Compose readiness uses bounded wait semantics;
- do not repeatedly poll GitHub Actions from the development process.

### MinIO / local Compose

Problem:

- public MinIO image path caused registry failures during CI;
- filesystem fallback originally did not share objects across API/worker containers.

Resolution:

- local/demo Compose can use filesystem storage;
- shared object volume is used where the API and worker must see the same object path;
- production target still expects private S3-compatible object storage as architecture direction.

### Stale Intelligence contract version expectation

Problem:

- tests assumed `record_version === 1`;
- Sales qualification/update legitimately incremented record version.

Resolution:

- contract test now uses the actual source version instead of hardcoding the old version.

Do not revert these fixes merely to restore older test assumptions.

---

## 7. What is still NOT complete

The automated implementation is significantly ahead of the real-user pilot.

Still required before declaring Sales Wave 1 complete:

### Production/pilot environment

- confirm canonical ERP hostname;
- configure:
  - `AUTH_EMAIL_DOMAINS=celerates.com,celerates.co.id`
  - `NEXTAUTH_URL=https://<canonical-host>`
  - `PASSKEY_RP_ID=<canonical-host-without-scheme>`
  - `PASSKEY_ORIGIN=https://<canonical-host>`
  - `PASSKEY_RP_NAME=Celerates ERP`;
- inspect target DB for pre-existing duplicate downstream handoffs;
- apply:
  - `0012_passkeys.sql`
  - `0013_sales_handoff_uniqueness.sql`;
- deploy the Wave 1 build to the approved environment.

### Real users / devices

- provision actual Sales pilot accounts;
- validate Sales viewer/editor/full role assignments;
- validate one actual TA account can continue from generated Requisition/PQ state;
- run passkey/biometric checks on actual devices used by the pilot:
  - Windows Hello;
  - iPhone/iPad Face ID / passkey as relevant;
  - Android device credential/biometric as relevant;
  - macOS/Touch ID if in scope.

### Business-flow validation

Run one real representative Sales journey with Product Owner / Sales user:

```text
login
→ opportunity
→ qualification
→ requirement/headcount
→ status
→ convert
→ PQ + Requisition
→ downstream TA visibility
→ document/signature where applicable
```

Then classify feedback:

- P0 = cannot complete the critical flow / security/data blocker;
- P1 = serious friction or wrong operational behavior;
- P2 = improvement/UX polish.

Do not redesign the whole module before this evidence exists.

### Open business/data boundary

Still confirm:

- which Google Sheet sync remains transitional during Wave 1;
- which side is the write-owner during the pilot;
- when/if Sheet sync is retired after ERP adoption is proven.

### Pilot operations

- create/use one feedback backlog;
- onboard selected Sales users;
- observe real usage;
- close P0/P1;
- record pilot outcome and November scope.

---

## 8. Next execution order for a new session

A new session should continue from the current branch and **not** restart planning.

Recommended order:

```text
1. Read AGENTS.md
2. Read docs/development/01-development-execution-rules.md
3. Read this handoff
4. Read docs/23-sales-pilot-wave-1.md
        ↓
5. Verify current branch/PR head has not moved unexpectedly
        ↓
6. Prepare pilot-environment deployment checklist
        ↓
7. Validate target DB before migrations 0012 / 0013
        ↓
8. Configure canonical passkey RP/origin
        ↓
9. Provision actual Sales + TA pilot accounts
        ↓
10. Deploy
        ↓
11. Run real-device auth + real Sales E2E
        ↓
12. Capture P0/P1/P2
        ↓
13. Fix only evidence-based blockers in logical batches
        ↓
14. Start controlled pilot + feedback loop
```

If deployment access/credentials are unavailable, do not invent them. Prepare the exact checklist/configuration and stop at the external dependency.

---

## 9. Development constraints that remain mandatory

Do not:

- restart the audit;
- redesign architecture from scratch;
- rebuild Sales as a new application;
- make Pre-Sales Intelligence a blocker;
- weaken RBAC/session/audit controls to accelerate pilot;
- create uncontrolled duplicate write-owners;
- reintroduce Google OAuth;
- store biometric templates;
- use one-file → commit → full-CI loops;
- use unbounded sleep/polling as a readiness strategy;
- repeatedly rerun deterministic failures without root-cause change.

Do:

- implement in logical batches;
- use Fast Gate first;
- treat CI as verifier;
- preserve `opty_no` traceability;
- keep Sales→TA handoff idempotent;
- capture real-user evidence before broad UX redesign;
- update this handoff if the execution baseline materially changes.

---

## 10. Source-of-truth reading order

For a new development session:

1. `AGENTS.md`
2. `docs/development/01-development-execution-rules.md`
3. `docs/handoff/CURRENT-SALES-WAVE1.md` **(this file)**
4. `docs/23-sales-pilot-wave-1.md`
5. `docs/01-product-and-architecture.md`
6. `docs/05-execution-plan.md`
7. `docs/security/02-auth-session-implementation.md`
8. `docs/adr/ADR-020-capability-driven-migration-and-vps-target.md`

If older handoff/audit documents conflict with the current architecture/security/pilot documents above, treat the older material as historical evidence unless a newer ADR explicitly says otherwise.


---

## 11. Continuation executed after the green checkpoint

The session that continued from this handoff did **not** restart planning or recreate completed Sales/passkey work.

Completed on `feat/sales-pilot-wave1-passkey`:

- added read-only pilot preflight:
  - `apps/erp/scripts/sales-wave1-preflight.mjs`
  - validates canonical HTTPS host, explicit passkey RP/origin, corporate mailbox domains, runtime config shape, migration tracking, duplicate Sales handoffs, migration/index presence, and active Sales/TA access coverage;
  - exits `NO-GO` before deployment when a migration/config/data-integrity blocker exists;
- added exact pilot release/deploy/rollback runbook:
  - `docs/24-sales-wave1-pilot-release-runbook.md`;
- opened the single governed real-user feedback backlog:
  - **Issue #8 — Sales Wave 1 — Pilot feedback backlog**;
- marked the feedback-backlog item complete in `docs/23-sales-pilot-wave-1.md`.

Purpose-driven commits:

- `d8df7aa6cfa7277d90f61eed4071e3d2ce268c7a` — ERP Sales Wave 1 deployment preflight;
- `26f0fc31929ffa4bba0c54d543427edb0aa89f3c` — pilot release runbook;
- `8980dc0a389080b3d5e7c173ef7ae106afa734f6` — record Issue #8 as the feedback backlog.

Important deployment boundary:

- `apps/erp/scripts/start.mjs` runs migrations automatically on container start;
- therefore target DB preflight must pass **before** recreating the ERP container;
- do not bypass duplicate `requisitions.opportunity_id` or `opportunities.opportunity_tracker_id` findings to force migration `0013`.

External validation still pending because it requires the actual pilot VPS/database and real users/devices:

1. run `sales-wave1-preflight.mjs` against the target DB using the canonical environment;
2. confirm canonical ERP hostname and passkey RP/origin;
3. take the approved DB restore point;
4. deploy the versioned Wave 1 image;
5. rerun preflight + live/ready health checks;
6. provision/validate actual Sales viewer/editor/full + TA accounts;
7. run real-device passkey checks;
8. run the representative Sales → PQ/Requisition → TA journey;
9. record evidence in Issue #8;
10. confirm the transitional Google Sheet write-owner before controlled rollout.

Do not mark Sales Wave 1 complete until those environment/user gates are evidenced.
