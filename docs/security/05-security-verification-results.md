# 05 — Security verification results

All evidence from 2026-10-02 (UTC). Synthetic people and documents only. Secret values were never printed; only
names, lengths, hashes and equality checks appear here.

## 1. M0 — clean execution baseline

| Item | Evidence |
| --- | --- |
| Committed baseline | The 4 uncommitted files the running image was built from were committed as `ecb82c7`. Every later deploy is built with `git archive <sha>:apps/erp \| docker build` (image `celerates-erp:c5c163a`, id `15b1a23bd010`). |
| Migrations safe | Applied `0000`–`0010` in `celerates_erp.erp_migrations` match the repo SHA-256 checksums (11/11 OK). `0011_security_foundation.sql` applied at 08:35:22 by the start script. |
| Rollback points | `/var/backups/celerates/celerates_erp-pre-security-20261002T073643Z.dump` (sha256 `ebc903e4…f766355`, 74 tables) and `celerates_erp-pre-0011-20261002T083506Z.dump` (sha256 `4f8e67a1…0159624`), root 0600. Previous image tagged `celerates-erp:pre-security-20261002`. `docker inspect` of the three containers saved alongside (root 0600). |
| Secrets off tmpfs | All three Celerates containers recreated by `infra/pilot/celerates-run.sh` from `/etc/celerates/secrets/*.env`. |
| MinIO separation | Policies `erp-app` (`s3:*` on `erp-*`) and `intelligence-app` (`s3:*` on `intelligence`); users created with secrets read from stdin (never on a command line). Root credential unchanged (no rotation). `mc` was built from source because MinIO no longer publishes images. |
| Separation proof | `erp-app`: erp-candidate ALLOW, erp-automation ALLOW, intelligence DENY, celerates-pilot DENY. `intelligence-app`: both ERP buckets DENY, intelligence ALLOW, only 1 bucket visible. From inside `celerates-intelligence-api` (boto3, its own env key): `list erp-candidate-documents / erp-automation-documents / erp-identity-documents → AccessDenied`. |
| Shared / test accounts | Identified: 10 shared test backoffice accounts (incl. a test Owner, `*.test.ierp@celerates.com`) and 2 test Talents. **Kept active by owner decision** (development environment). `seed:test-accounts` now refuses to create them when `APP_ENV` is `pilot`/`production`; `--disable` also revokes their sessions. |

## 2. Automated tests

`cd apps/erp && npm test` — **32 / 32 pass** (23 existing + 9 new in `tests/security.test.ts`, 174 assertions,
PGlite + s3rver, the same modules the ERP runs). `npx tsc --noEmit` clean. `npm run build` clean.

| Test | What it proves |
| --- | --- |
| policy matrix | 37 persona × action × resource rows incl. lifecycle, grace period, Owner-without-capability, step-up edge (9 min fresh, 10 min stale, future timestamp never fresh) |
| sessions | revoked / deactivated / rejected / idle-expired / absolute-expired sessions refused on the same `sid` (copied cookie); logout-all also forgets trusted browsers; password change keeps only this browser; users cannot revoke others' sessions; division and capability changes visible on the next request; Talent link revoke ends the session; 7/30 and 30/90 day lifetimes |
| email codes | stored as HMAC only; bound to user and purpose; replay refused; expired refused; locked after 5 wrong guesses; newer code supersedes; step-up code bound to its session; break-glass code survives an emailed code; non-corporate mailbox refused unless excepted; rate limit |
| backoffice login | wrong password sends no code; cross-origin refused; password alone on a new browser → no session; code → HttpOnly trusted-browser cookie → session (`password+email_otp`, step-up fresh, device "Chrome · Windows", IP prefix /24); OTP replay refused; cookie holds only `sid`,`sub`; trusted browser next time → no email; a later sign-in is not a fresh step-up; revoked session makes NextAuth's callback throw; revoked trusted browser needs a code again; reset is enumeration-safe and revokes prior sessions |
| middleware | valid session passes; forged cookie claiming Owner/finance gains nothing; revoked session → `/login` + stale cookie deleted; API → 403; anonymous → login |
| identity documents | MIME spoof, GIF, SVG with script, JPEG/HTML polyglot, PDF without EOF, oversize, bad doc type, PMO upload all refused and audited; opaque key; raw S3 object is ciphertext (length = plain + 28, no marker, no JPEG magic); listing reveals nothing; `/api/documents` cannot name the bucket; full access matrix (03 §4); IDOR random id and `../../etc/passwd` → not found; promotion + 14-day grace; verification needs step-up; Talent self vs cross-Talent; status metadata only; Agent payload has `ktp_status` and no id/key/marker; KEK v2 rotation keeps v1 readable; every deny reason audited; audit rows hold no NIK/marker/bank/wrapped key; UPDATE/DELETE on the log refused |
| identity numbers | masking; reveal needs capability + step-up (+ correct division); bank.read separate; invalid field refused; allow/deny audited with field name only; blank edit keeps value; HR cannot change a bank account without `bank.write`; TA can enter it while onboarding; generated documents masked unless revealable now |
| static boundaries | `decryptPII` only in `lib/people/identity.ts` + `pii-crypto.ts`; identity bucket not in the generic allow-list; every identity-document handler starts from the live session; Google provider absent; middleware never trusts cookie claims; no Intelligence file names the identity bucket; only synthetic 16-digit numbers in fixtures |
| log hygiene | nothing logged during the whole suite contains the synthetic NIK, document marker, bank number, any emailed code or key material |

`node tests/security-http.mjs` (after `npm run build`; real `next start`, PG wire, S3 emulator, loopback SMTP sink) —
**13 / 13 PASS**, 60 assertions:

```
PASS: anonymous is refused before any page or API code
PASS: new browser: password → corporate-mailbox code → trusted browser → revocable session
PASS: trusted browser: password only after logout; valid session: direct access, no repeated OTP
PASS: upload → validation (magic bytes, declared type, size) → stored          (incl. a 4.9 MB scan)
PASS: private storage: opaque key, ciphertext at rest, generic route refused
PASS: authorized scoped read with step-up; safe response headers
PASS: valid session without recent step-up → step_up_required
PASS: HR with capability allowed after step-up; PMO denied on the direct API
PASS: copied browser session stops working immediately after revocation
PASS: deactivation revokes sessions immediately
PASS: Talent own document; cross-person denied
PASS: audit: 39 rows, every required event present, no sensitive values
PASS: server logs carry no code, NIK or document bytes
```

`node tests/http-smoke.mjs` (existing end-to-end smoke, codes off for its scope) — PASS, including its revoked-session step.

## 3. Defects found by the tests and fixed before deploy

1. A trusted browser counted as "fresh code" for 10 minutes after creation, so a second password sign-in in that window
   got step-up for free. Now only the first use of a new trusted browser is fresh.
2. Next 15.5 Node-runtime middleware did not await its request-body swap: uploads ≥ ~1 MB failed with HTTP 500. The
   middleware stays on the Edge runtime and checks the session through `/api/session-check`.
3. `postgres` rejected JS `Date` parameters with `prepare: false`; step-up times are written as SQL `now()` / ISO text.

## 4. Runtime evidence on the pilot (through Cloudflare, `https://ierp.celeratesapps.com`)

Image `celerates-erp:c5c163a`; `/api/health/ready` → `{"status":"ready"}` (includes the identity bucket). Synthetic
accounts `security-poc.hr@celerates.com` (HR editor + `identity_document.read`) and `security-poc.pmo@celerates.com`
(PMO full); synthetic employee `SYN-POC-0001`. SMTP is not configured yet, so codes came from the audited break-glass
script; the flow is otherwise identical.

```
GET /hr anonymous → 307 ; GET /api/identity-documents/<random> anonymous → 403
/api/auth/providers → credentials, talent-link            (Google gone)
HR start (new browser, codes required, no SMTP) → 503 {"error":"mail_unavailable"}
HR password-only sign-in on new browser → session cookie: none
HR verify code → 200; trusted-browser cookie: Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000; Secure
HR sign-in after code → session yes; GET /hr 200, /profile 200, /finance 403
copied cookie after logout → GET /hr 307
HR start on trusted browser → {"next":"signin"} (no code); password only → session; GET / ×3 → 200,200,200
upload SVG → 415; MIME spoof → 415; oversize → 413; synthetic KTP → 201
HR (no recent step-up) GET doc → 401 {"error":"step_up_required"}
HR (capability + recent code) GET doc → 200; bytes match; cache-control private, no-store, max-age=0;
   disposition attachment; csp default-src 'none'; sandbox; corp same-origin; cf-cache-status DYNAMIC
status metadata → {"doc_type":"ktp","status":"uploaded","verified_at":null,…}
generic /api/documents?bucket=identity-documents → 404
PMO GET doc → 404; status list → 404; /hr → 403; /pmo → 200
PMO deactivated → GET /pmo 307 on the next request; sign-in → 401
```

Storage, read with the `erp-app` key: object `id/ea9c70a1…dfe89b`, 4,155 bytes (= 4,127 + 28), synthetic marker absent,
no JPEG magic. `intelligence-app`: `Unable to list folder. Access Denied.` Anonymous GET from inside the Docker network:
`HTTP 403 Forbidden`.

Audit rows for the run: `login` allow (`password+email_otp` ×3, `password` ×1) and deny (`email_verification_required`,
`bad_credentials`), `otp_login_send` deny `delivery_failed` ×3, `otp_login_verify` allow `break_glass` ×3,
`break_glass_code_issued` ×3, `logout`, `identity_document.upload` allow ×1 and deny (`unsupported_content`,
`type_mismatch`, `invalid_size`), `identity_document.read` allow ×1 and deny (`step_up_required`, `out_of_scope`).
`docker logs celerates-erp`: 0 lines containing a code, the marker or "Kode Anda"; no errors.

Afterwards both POC accounts were set `inactive` and their 3 sessions and trusted browsers revoked (0 open sessions).
The synthetic employee and its encrypted synthetic KTP remain as evidence.

Audit integrity after the ownership change, as `celerates_erp_app`: INSERT ok (a live `login` deny row was written
by the ERP afterwards); UPDATE, DELETE, TRUNCATE, `DISABLE TRIGGER`, DROP, `ALTER EVENT TRIGGER … DISABLE` refused.

## 5. Required negative/adversarial tests → where

| Required | Where |
| --- | --- |
| revoked session replay | security.test sessions + middleware; security-http; pilot |
| disabled-user replay | security.test sessions; security-http; pilot |
| OTP replay / expired / brute-force limit | security.test email codes + login |
| trusted-browser revocation | security.test sessions + login |
| direct API calls bypassing UI | security-http (all document calls are direct); pilot |
| IDOR (employee/document ids) | security.test identity documents (random id, other subject, path string) |
| cross-Talent | security.test; security-http |
| missing capability | security.test; security-http (Owner, HR) |
| direct MinIO access | security.test raw S3; pilot (anonymous 403, Intelligence AccessDenied) |
| MIME spoofing / invalid magic bytes / oversized | security.test; security-http; pilot |
| generic document-route bypass | security.test; security-http; pilot |
| stale step-up | security.test policy + Talent + document; security-http; pilot |
| Agent/model leakage | security.test (Agent payload, Company Files, Intelligence code); pilot (storage credentials) |
| logs containing sensitive bytes | security.test log hygiene; security-http server output; pilot `docker logs` |
| raw stored object is ciphertext | security.test; security-http; pilot |

Not exercised at runtime (covered by tests only): Talent sessions on the pilot (would need a ConForm-linked test
Talent), Agent `ktp_status` through Intelligence, real email delivery (App Password pending).
