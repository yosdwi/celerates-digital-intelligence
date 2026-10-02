# 06 — Independent security test handoff

For the external tester (review Phase 7). Read 01–05 first. Use synthetic data only: never upload a real KTP/KK or
type a real NIK, NPWP or bank number.

## 1. Scope

| Target | Notes |
| --- | --- |
| `https://ierp.celeratesapps.com` (ERP, Cloudflare Tunnel) | primary; build `c5c163a` |
| `/api/login`, `/api/step-up`, `/api/session-check`, `/api/auth/*` | authentication |
| `/api/identity-documents`, `/api/identity-documents/<id>`, `/api/documents` | private documents |
| Server Actions in `/access-management`, `/profile`, `/hr/<id>` | capability grants, session revocation, reveal |
| `/go/<code>` and the `talent-link` provider | Talent entry |
| Agent (`/api/agent/*` via ERP) | disclosure of identity data |
| Railway `erp-web` | out of scope unless the owner confirms it holds data (old auth code) |

Out of scope without separate written approval: ConForm, the WhatsApp bot, MinIO/Postgres directly, the VPS host,
denial-of-service, email bombing of real mailboxes, social engineering.

## 2. Accounts

- Synthetic POC accounts exist and are **inactive**: `security-poc.hr@celerates.com` (HR editor +
  `identity_document.read`), `security-poc.pmo@celerates.com` (PMO full). The operator reactivates them
  (Access Management → *Aktifkan kembali*) and hands over the passwords from `/etc/celerates/secrets/poc-accounts`
  out of band. Ask for more personas (TA, Finance, Owner-without-capability, Talent) as needed; they are created with
  synthetic data only.
- Until the SMTP App Password is configured, codes are delivered by the operator with the audited break-glass script
  (02 §6). Agree a contact channel for that before testing.
- Synthetic record for document tests: employee `SYN-POC-0001` (one encrypted synthetic KTP uploaded).

## 3. What to try (expected result in brackets)

Authentication and sessions
- Brute-force the 6-digit code (≤ 5 guesses per code, then a new code is needed; per-IP/user limits). Replay a used
  code; use a code after 10 minutes; use a login code as a step-up code (all refused).
- Email enumeration through `/api/login` start/reset timing or responses (reset answers identically).
- Session fixation; copy the session cookie to another machine, then log out / log out everywhere / have the Owner
  deactivate the user (refused on the next request). Forge or edit JWT claims (claims are ignored; only `sid` matters).
- CSRF against `/api/login`, `/api/step-up`, `/api/identity-documents` (same-origin JSON / SameSite=Lax cookies) and
  Server Actions (Next origin check).
- Trusted-browser cookie theft: it skips only the code, never the password.

Authorization
- Change employee/onboarding/document ids in every request (404 for out-of-scope, 403 for missing capability).
- Call Server Actions without the UI (`grantCapability` needs Owner/`access.admin` + step-up; `revealField` needs the
  capability + step-up; `deactivateUser` needs Owner).
- Talent → backoffice routes and other people's documents (403/404). TA after promotion + 14 days (404).
- Owner without an explicit capability → KTP (403).

Documents
- Upload polyglots (JPEG/HTML, PDF/JS), SVG, oversized, wrong declared type, path-like names (all refused; file name is
  discarded). Try to make the browser render a document inline (always `attachment`, CSP `sandbox`).
- Cache leakage through Cloudflare or the service worker (`private, no-store`; SW handles navigations only).
- `/api/documents?bucket=identity-documents&path=id/...` (404).

Agent
- Prompt injection through dropped files or Company Files asking for KTP/NIK content (the Agent has only `ktp_status`).
- Note: the Agent dataset egress guard (review R11.2) is **not** implemented; a user-dropped CSV with identity or pay
  columns still reaches the model. Report it, but it is a known gap.

## 4. Known gaps (report, but expected)

See 01 §7–9: email delivery pending, bank-change UI without a step-up dialog, `identity.read` not enforced on
non-number fields, pay data still division-only, no EXIF stripping, KEK on the same host, shared test accounts active,
no automated backups, Railway `erp-web` on the old auth code, no HSTS/CSP on pages.

## 5. Evidence the tester can request

`sensitive_access_log` extracts for their test window (no sensitive values are stored), `docker logs celerates-erp`
for the window, `auth_sessions` rows for their accounts, and the raw stored object for their uploads (to confirm
ciphertext). Deliverables: findings ranked by severity with reproduction steps; a retest after fixes.
