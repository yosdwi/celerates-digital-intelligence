# 04 — Private identity-document POC (M4)

Synthetic data only. No real KTP, KK or NIK was uploaded, in tests or on the pilot.

## 1. Vertical slice

```mermaid
sequenceDiagram
  autonumber
  actor U as HR / TA / Talent
  participant R as /api/identity-documents
  participant P as can()
  participant A as sensitive_access_log
  participant K as KeyProvider (keyring v1)
  participant S as MinIO erp-identity-documents
  participant DB as identity_documents
  Note over U,DB: Upload
  U->>R: POST multipart (subject, doc_type, file ≤ 5 MB)
  R->>P: identity_document.upload (division editor in stage owner, or own record)
  P-->>R: allow / deny → audit deny
  R->>R: magic bytes JPEG/PNG/PDF = declared type; reject markup (SVG/HTML polyglots)
  R->>K: wrap(fresh 256-bit DEK)
  R->>R: AES-256-GCM(file, DEK, AAD = doc id · type · subject ids)
  R->>S: PUT id/<32 hex> (If-None-Match *), iv‖ciphertext‖tag
  R->>DB: metadata (subject, type, sha256, size, sniffed type, wrapped DEK, KEK version)
  R->>A: identity_document.upload allow
  Note over U,DB: Read
  U->>R: GET /api/identity-documents/<id>
  R->>DB: row + current lifecycle stage
  R->>P: identity_document.read
  alt deny / step-up missing
    R->>A: deny (reason) — written before answering
    R-->>U: 404 / 403 / 401 step_up_required
  else allow
    R->>A: allow — written before any byte (fail closed)
    R->>S: GET object
    R->>K: unwrap(DEK, version)
    R->>R: decrypt in memory, verify sha256
    R-->>U: bytes · attachment · no-store · nosniff · CSP sandbox · CORP same-origin
  end
```

The browser panel (`components/security/identity-documents.tsx`) fetches the bytes and shows them from an in-memory
blob URL that is revoked when closed; a direct navigation only downloads. On 401 it opens "Konfirmasi ini Anda"
(email code) for backoffice users, or tells a Talent to open their latest WhatsApp link.

Surfaces: HR profile (`/hr/<employee>`), TA onboarding edit (`/ta/onboarding/<id>/edit`), Talent `/me/documents`.

## 2. Storage

- Bucket `erp-identity-documents` (created by `init-storage` with the `erp-app` key). It is **not** in the generic
  `/api/documents` allow-list (`lib/object-store.ts` `allowed`), so that route can never name it (test + runtime: 404).
- Keys are `id/<32 random hex>`: no name, NIK, email, document type, onboarding or document id.
- No bucket policy, no presigned or permanent URL is ever issued; MinIO has no host port. Anonymous GET → 403.
- Intelligence uses `intelligence-app`, limited to the `intelligence` bucket: listing or reading
  `erp-identity-documents` → `AccessDenied` (runtime evidence in 05). Its code never names the bucket (static test).
- Identity documents are never registered as Company Files (`lib/files/sources.ts` has no reference; static test).

## 3. Encryption and keys

- Per object: random 256-bit DEK, random 96-bit IV, AES-256-GCM, 128-bit tag. Object = `iv ‖ ciphertext ‖ tag`.
- AAD binds the ciphertext to its row: `identity-document:v1:<doc id>:<type>:<onboarding>:<employee>:<user>`.
  Subject columns are never updated after upload; promotion is derived from `employees` at read time.
- DEK wrapped with AES-256-GCM under the KEK (`AAD identity-dek:v<N>`), stored as `wrapped_dek` + `kek_version`.
- `KeyProvider` interface (`wrap`, `unwrap`, async) in `lib/security/keyring.ts`; v1 is `LocalKeyring`, a file with
  one `v<N>:<64 hex>` line per version (`IDENTITY_KEYRING_FILE` → `/run/secrets/identity-keyring`, host file
  `/etc/celerates/secrets/identity-keyring`, uid 1000, mode 0400, mounted read-only). Separate from `PII_ENCRYPTION_KEY`.
  A KMS/Vault provider can implement the same two methods later; rows keep their version, so no data migration.
- **Rotation**: append `v2:<new hex>` to the keyring and restart → new uploads use v2, v1 documents stay readable
  (tested). Re-wrapping old DEKs to v2 is a later script (`unwrap` + `wrap` per row); objects are never rewritten.
- **Backup the keyring offline, separately from data backups.** Losing it makes every identity document unreadable.
  Anyone with host root can read it (01 §8).

## 4. Metadata

`identity_documents(id, subject_onboarding_id, subject_employee_id, subject_user_id, doc_type, object_key, sha256,
size_bytes, media_type, wrapped_dek, kek_version, uploaded_by, uploaded_at, verification_status, verified_by,
verified_at, retention_until, deleted_at)`. Doc types: `ktp`, `kk`, `npwp`, `bpjs_kesehatan`, `bpjs_ketenagakerjaan`.
Retention (`retention_until`) and deletion are modelled but not automated (UU 27/2022 period is a business decision).

## 5. Agent / model

| Data | Agent |
| --- | --- |
| KTP binary, OCR, text | DENY: no route, no storage credential, never a Company File |
| KTP exists / verified / verified_at | metadata field `ktp_status` on the `employee` entity ("terverifikasi (2026-10-02)"), only for users whose division can read the employee record (`identity_document.status`) |
| Document id, object key, wrapped key | never |

## 6. Upload validation

Max 5 MB (checked from `Content-Length` before parsing and on the bytes). Accepted only when the first bytes are
JPEG (`FF D8 FF`), PNG (8-byte signature) or PDF (`%PDF-` with `%%EOF` in the last 1 KB) **and** equal the declared
type, and the first 2 KB contain no `<html`, `<script`, `<svg`, `<!doctype`, `<iframe`, `<object`, `<embed`. The client
file name is discarded. Not done: EXIF/GPS stripping or image re-encoding.
