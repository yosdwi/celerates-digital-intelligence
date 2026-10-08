# Sales Pilot Wave 1 — Execution Baseline

**Status:** Approved direction / implementation in progress  
**Decision date:** 2026-10-05  
**Pilot owner:** Product Owner + Tech Lead  
**Pilot domain:** Sales, end-to-end from opportunity handling to a clean downstream handoff

## 1. Why Sales is Wave 1

Management alignment is complete enough to move from broad planning into execution.

Sales is the first pilot because it is the upstream operational entry point for the commercial lifecycle and already has a substantial working ERP baseline. The purpose of Wave 1 is not to validate every Sales feature at once. It is to prove that a real Sales user can enter Celerates, run the priority journey, and hand clean operational state to the next division without falling back to an uncontrolled duplicate process.

Wave 1 therefore prioritizes the operating chain before Pre-Sales Intelligence.

```text
Sales user
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
PQ document / signature where applicable
```

The existing "Add Extension Request" path into TM remains available but is **not the critical path of the first pilot**. It becomes a follow-up scenario after the new-opportunity path is stable.

## 2. Existing implementation we are building on

Current ERP code already contains:

- Sales Dashboard;
- Opportunity Tracker with qualification, status, requirement and Sales PIC;
- PQ Tracker;
- client/accounts;
- Profitability Tracker;
- Google Sheet sync paths;
- PQ attachments and TTD request;
- `Opportunity Tracker → Convert to Requisition`, which transactionally creates the Requisition and linked PQ Tracker while preserving the same `opty_no` for upstream/downstream traceability;
- an extension flow for existing Talent into TM.

This pilot hardens those flows rather than replacing them with a greenfield Sales application.

## 3. Wave 1 user journey

### Entry

A pilot Sales user has:

- an active backoffice account;
- Sales division access appropriate to the scenario;
- one of the approved corporate email identities;
- a supported login/recovery method.

### Journey

1. Sign in.
2. Open the Sales workspace/dashboard.
3. Create or continue an Opportunity.
4. Capture/confirm client, service, requirement, position/headcount, PIC and commercial context required by the real Sales workflow.
5. Update qualification and opportunity status.
6. Convert a qualified Opportunity to the downstream flow.
7. Verify that Requisition and PQ Tracker are created/linked correctly.
8. Upload/use PQ documents and request signature when the business scenario requires it.
9. Confirm that the downstream division can continue from the generated state without re-entering the same critical data.
10. Submit feedback into the single pilot backlog.

### Exit condition for the October pilot gate

Wave 1 is ready to proceed when:

- selected Sales users can sign in safely;
- the priority Sales journey can be completed without a P0 blocker;
- the same opportunity can be traced through the downstream handoff;
- critical fields are not re-entered manually only because of a broken system handoff;
- access and write permissions behave as intended;
- user feedback is captured in one backlog and P0/P1 items have clear owners.

This is intentionally a business-readable gate. Detailed test cases can be stricter without changing the management wording.

## 4. Authentication decision for the pilot

Approved login choices for backoffice users:

1. **Biometric / Passkey** — implemented with WebAuthn, using Face ID, Touch ID, Windows Hello, Android/device biometrics or device PIN depending on the authenticator.
2. **Corporate email identity: `@celerates.com`**.
3. **Corporate email identity: `@celerates.co.id`**.

Important boundaries:

- Celerates never receives or stores a fingerprint/face template.
- The authenticator keeps the private key; ERP stores only the credential id, public key, counter and audit metadata.
- Corporate email + password + mailbox verification remains the bootstrap/recovery path.
- A passkey must first be registered from an authenticated account and currently requires password confirmation.
- Passkey login requires WebAuthn user verification.
- Google OAuth is not reintroduced by this decision.
- The two approved email domains identify eligible corporate mailboxes; they do not imply that either mail system is an OIDC/SAML identity provider.
- Explicit audited mailbox exceptions remain a break-glass compatibility mechanism and are not the normal pilot path.

### Production configuration

Set/verify:

```text
AUTH_EMAIL_DOMAINS=celerates.com,celerates.co.id
NEXTAUTH_URL=https://<canonical-erp-host>
PASSKEY_RP_ID=<canonical-erp-host-without-scheme>
PASSKEY_ORIGIN=https://<canonical-erp-host>
PASSKEY_RP_NAME=Celerates ERP
```

`PASSKEY_RP_ID` and `PASSKEY_ORIGIN` are optional when they match `NEXTAUTH_URL`, but explicit production values reduce ambiguity during cut-over.

## 5. Implementation status

### Authentication

- [x] Allow both corporate domains in the authentication policy.
- [x] Enforce corporate-domain eligibility for backoffice password and passkey sign-in.
- [x] Add passkey credential/challenge persistence.
- [x] Add passkey cryptographic verification with RP/origin, UP/UV, signature and counter checks.
- [x] Add discoverable passkey login option.
- [x] Add passkey registration/revocation from Profile.
- [x] Keep password + corporate mailbox verification as bootstrap/recovery.
- [x] Revoke registered passkeys during mailbox-backed password reset.
- [x] Configure canonical production RP/origin (`https://ierp.celeratesapps.com`, verified live 2026-10-07).
- [ ] Run real-device passkey checks on the Windows, Android/iOS/macOS devices used by pilot users (needs real devices and users).
- [ ] Provision actual Sales pilot users and validate their roles. Production today has only one `sales:full` and one `ta:full` backoffice account; no viewer or editor exists yet. Needs an Owner session in Access Management.

### Sales flow

- [x] Existing Opportunity Tracker baseline identified.
- [x] Existing PQ Tracker / Requisition handoff identified.
- [x] Existing document/TTD path identified.
- [ ] Run one representative Sales scenario with the Product Owner/Sales user.
- [ ] Record field/workflow mismatch as P0/P1/P2 instead of redesigning from assumptions.
- [x] Enforce server-side Sales Qualified + valid position/headcount before Opportunity can be handed downstream.
- [ ] Fix remaining pilot-blocking P0/P1 items found by real-user validation.
- [x] Make Opportunity Tracker UI reflect Sales viewer/editor/full access: viewer is read-only, editor can mutate/convert, full can also delete.
- [ ] Verify authorization for viewer/editor/full Sales access with actual pilot accounts.
- [x] Keep Sales users inside the Sales workspace after conversion; the downstream record is created for TA without redirecting Sales into a TA-only page.
- [ ] Verify downstream TA can continue from the generated Requisition/PQ state with an actual TA account.
- [x] Add database-level one-to-one guards for Opportunity → Requisition/PQ Tracker and cover conversion retry in HTTP smoke.
- [ ] Verify duplicate conversion and orphan-state protections with real pilot scenarios.
- [x] (2026-10-08, Product Owner: Sales OT and PQ sync both ways through a Google service account; other modules stay off. Needs GOOGLE_SERVICE_ACCOUNT_JSON on the server.) Confirm what Google Sheet sync remains transitional during Wave 1 and who is the write-owner during the pilot. Fact found 2026-10-07: every Sales Sheet sync action (connect, headers, mapping, pull, push, debug) is hard-disabled in this build by `integrationDisabled()` ("Fitur ini belum diaktifkan pada pilot.") and `sheet_connections` has 0 rows, so ERP is the only write-owner today. Whether the Sheet is re-enabled one-way, imported once, or retired is a Product Owner decision.

### Pilot release

- [x] Apply migrations `0012_passkeys.sql` and `0013_sales_handoff_uniqueness.sql` after checking the target DB for pre-existing duplicate handoffs (applied once at container start, 2026-10-07; the check was vacuous because production had 0 Sales/PQ/Requisition rows).
- [x] Deploy the pilot build to the approved environment (`celerates-erp:pilot` is `wave1-952c266`).
- [x] Add disposable automated E2E for corporate bootstrap → passkey enrollment/login → Sales Opportunity visibility → converted-state guard → TA downstream visibility.
- [x] Full automated E2E gate is green on the review-ready PR revision (ERP pilot checks + P0 verification green at handoff checkpoint).
- [ ] Smoke-test the same login, session revocation, Sales create/update/convert, document flow and downstream visibility in the approved pilot environment. Done so far without credentials: login page, passkey UI bundle, public challenge endpoint, anonymous route protection. Everything that needs a signed-in user is pending.
- [x] Start the single feedback backlog — GitHub Issue #8 (`Sales Wave 1 — Pilot feedback backlog`).
- [ ] Onboard selected Sales users.
- [ ] Observe real use and close P0/P1.
- [ ] Record pilot result and November follow-up scope.

## 6. Tech Lead implementation guardrails

- Do not redesign the whole Sales module before observing pilot users.
- Do not make Pre-Sales Intelligence a blocker for Wave 1.
- Do not create a second source of truth just to preserve a legacy screen.
- Do not weaken existing RBAC/session/audit controls to make the pilot easier.
- Keep migration additive and reversible where practical.
- Protect downstream handoffs with transaction/idempotency/duplicate guards rather than relying only on UI state.
- Treat real user friction as product evidence; classify it before turning it into custom code.
- Preserve `opty_no` as the traceability key across the current Opportunity → PQ/Requisition flow unless the business owner explicitly changes that contract.

## 7. Immediate execution order

```text
1. Merge/approve architecture alignment
        ↓
2. Finish auth/passkey verification in CI
        ↓
3. Configure pilot environment + corporate domains
        ↓
4. Provision Sales pilot accounts/access
        ↓
5. Run Sales scenario with real user
        ↓
6. P0/P1 remediation
        ↓
7. Release pilot
        ↓
8. Feedback + November scope
```

Technical design should now be written only for decisions needed by this execution path (auth, Sales handoff, deployment, backup/observability and required provider boundaries), not as another broad architecture exercise.


## 8. Automated verification strategy

Development follows `docs/development/01-development-execution-rules.md`.

For Wave 1:

- Draft PR revisions run the ERP **Fast Gate** (unit/security/schema + typecheck).
- The Sales ERP browser/HTTP Full Gate and the broader Intelligence P0/Compose gate are separate checkpoint gates.
- Sales Wave 1 Full Gate intentionally does **not** build/run the Intelligence web/API/worker stack; Pre-Sales Intelligence is not a blocker for the operational Sales pilot.
- The broader `P0 verification` workflow remains responsible for Intelligence API/web/Compose regression and runs at the same review-ready checkpoint.
- The Sales browser journey uses a disposable database and Chromium virtual WebAuthn authenticator. It never targets a live ERP and never stores a real biometric.
- Real-device biometric checks and real Sales/TA accounts remain pilot-environment validation and are not replaced by synthetic E2E.

## 9. Pilot environment deployment record (2026-10-07)

Facts below were observed on the pilot VPS during the deployment. Nothing here claims a user or device validation that did not happen.

| Item | Value |
| --- | --- |
| Release | `952c26605d9d07adb12b9b69ca282d5e4684e3bf` on `feat/sales-pilot-wave1-passkey` (working tree clean before build) |
| Image | `celerates-erp:wave1-952c26605d9d07adb12b9b69ca282d5e4684e3bf`, promoted as `celerates-erp:pilot` (`sha256:a0354ac5fc74`) |
| Previous image kept | `celerates-erp:fb4b452` and `celerates-erp:rollback-20261007T003958Z` (`sha256:2de60e55c758`). The old container ran the `fb4b452` tag, not `:pilot`. |
| Canonical host | `https://ierp.celeratesapps.com` (already in `NEXTAUTH_URL` and `CELERATES_PUBLIC_URL`; public TLS and `/api/health/ready` OK) |
| Auth config set | `AUTH_EMAIL_DOMAINS=celerates.com,celerates.co.id`, `PASSKEY_RP_ID=ierp.celeratesapps.com`, `PASSKEY_ORIGIN=https://ierp.celeratesapps.com`, `PASSKEY_RP_NAME=Celerates ERP`. No other env line changed. Previous file kept root-only as `celerates-erp.env.bak-20261007T003519Z`. |
| Database | `celerates_erp` on `conform-unified-pg`, role `celerates_erp_app` |
| Restore point | `/var/backups/celerates/celerates_erp-pre-wave1-20261007T003943Z.dump` (custom format, 247955 bytes, 492 TOC entries readable by `pg_restore --list`), taken before the restart |
| Preflight before restart | GO: 0 requisition and 0 PQ handoff duplicates; 0012 and 0013 pending |
| Migrations | `0012_passkeys.sql` and `0013_sales_handoff_uniqueness.sql` applied once at start; both unique indexes and both passkey tables present |
| Health | `/api/health/live` ok and `/api/health/ready` ready on `127.0.0.1:3000` and on the public URL; container healthy, `unless-stopped`, bound to `127.0.0.1:3000` |
| Preflight after restart | GO: 0012 and 0013 already applied, passkey tables and unique indexes present, 0 duplicates |
| Anonymous smoke | `/login` 200; login bundle contains the passkey UI; `POST /api/passkey/login/options` returns `rpId=ierp.celeratesapps.com`, `userVerification=required`; `/sales`, `/sales/opportunity-tracker`, `/profile`, `/ta` redirect to login; `/api/passkey/register` and `/api/identity-documents` return 403 |
| Mailbox policy | The single active backoffice `gmail.com` account is exactly the one listed in `AUTH_EMAIL_EXCEPTIONS`, so the new mailbox check does not lock it out |

Rollback if needed: `docker tag celerates-erp:rollback-20261007T003958Z celerates-erp:pilot` then `infra/pilot/celerates-run.sh erp celerates-erp:pilot`. Migrations are additive and the old image ignores them; restore the dump only if data state must change.

### Not done, and why

- Signed-in smoke (session, Profile/Security, Sales, Opportunity Tracker, TA, session revocation, private documents): needs a real account and its mailbox code. No credential was used or created.
- Pilot accounts: only `sales:full` and `ta:full` exist (1 each); viewer and editor must be granted by an Owner in Access Management so the grants are audited.
- Production has 0 opportunities, 0 PQ Trackers, 0 requisitions: the representative Sales to TA journey has to be entered by a Sales user or on a clearly marked synthetic record.
- Real-device passkey matrix and the password-reset-revokes-passkeys check: need real devices.
- Google Sheet write-owner: see section 5, Product Owner decision.
