# Pilot test accounts, OTP waiver and synthetic data — cut-off plan

**Status:** temporary, pilot only. **Cut-off:** before the production go-live planned for January 2027 (or earlier if the pilot ends).
**Decision:** Product Owner, 2026-10-07. The pilot ERP (`https://ierp.celeratesapps.com`) holds no real Sales data yet, so the team tests Sales end to end with shared synthetic accounts and synthetic data.

This file lists everything that exists only for that testing and exactly how to remove it. Nothing here may reach production.

## 1. What exists

| Item | Where | What it does |
| --- | --- | --- |
| Test accounts | `users` rows with `role_title = 'Test account (seed:test-accounts)'`, emails `<division>.test.ierp@celerates.com` | Shared logins per division (Sales, TA, HR, Finance, PMO, Marketing, TM, Automation, School). Created by `apps/erp/scripts/seed-test-accounts.mjs`. |
| OTP waiver | env `AUTH_OTP_WAIVED_EMAILS` in `/etc/celerates/secrets/celerates-erp.env`; code `otpWaived()` in `apps/erp/src/lib/security/email-otp.ts` | The listed accounts sign in with the password alone; no mailbox code. Each such login is audited with reason `password;otp_waived`. |
| Test password | `/etc/celerates/secrets/test-accounts-password` (root only, mode 600) | One random password shared by the waived accounts. Never in Git or chat. |
| Synthetic Sales data | `apps/erp/scripts/seed-sales-pilot-data.mjs` | 300 trackers, 15 clients, 40 converted to Requisition + PQ Tracker. Marked `OPTY<year>-S###`, `REQ-<year>-S###`, client code `SEED-`, notes `[SEED pilot]`. |

## 2. Waiver rules (what it does and does not weaken)

- Exact addresses only; case and spaces ignored. No domain wildcard.
- **Never applies to an Owner**, in code, even if the address is listed. `administrator.test.ierp@celerates.com` (Owner) still needs the mailbox code.
- The password check, rate limits, session revocation, audit and `can()` policy are unchanged.
- A waived session has no step-up. Anything needing a recent strong check (identity reveal, document access) still asks for a code or a passkey.
- `sales-wave1-preflight.mjs` prints a warning while the variable is non-empty.
- Residual risk accepted for the pilot: these accounts are password-only on an internet-facing host and the password is shared. Their data is synthetic; they cannot reach identity numbers or documents without a step-up.

## 3. Cut-off checklist (do all, in this order, before go-live)

1. **Remove the waiver:** delete the `AUTH_OTP_WAIVED_EMAILS` line from `/etc/celerates/secrets/celerates-erp.env`, then `infra/pilot/celerates-run.sh erp celerates-erp:pilot`. Preflight must stop warning.
2. **Disable every test account and end its sessions:**
   `DATABASE_URL=... node scripts/seed-test-accounts.mjs --disable` (sets all to inactive and revokes their sessions; run it inside the ERP image like the preflight).
3. **Remove synthetic data** after a `pg_dump`: `ALLOW_PILOT_SEED_DATA=1 ... node scripts/seed-sales-pilot-data.mjs --remove` (deletes only marked rows).
4. **Delete the secret file:** `sudo shred -u /etc/celerates/secrets/test-accounts-password`.
5. **Check nothing is left:** no `users.role_title` starting with `Test account` that is active; no `sales_opportunity_trackers.progress_notes` starting with `[SEED pilot]`; `SELECT count(*) FROM sensitive_access_log WHERE reason = 'password;otp_waived'` is only history. Record the result in the handoff.
6. Decide, with the Product Owner, whether the code path `otpWaived()` is removed from the codebase or kept dormant (an empty variable disables it).

## 4. Findings to keep in mind

- `administrator.test.ierp@celerates.com` is an Owner and active on an internet-facing system; its only protection is the mailbox code. Disabling it earlier is the safer default if it is not used.
- Test accounts conflict with the earlier security rule R5.4 (shared test accounts never sign in to an internet-facing pilot); `seed-test-accounts.mjs` still refuses `APP_ENV=pilot` unless `ALLOW_TEST_ACCOUNTS=1`. This pilot decision is the documented exception.
