# Live ERP contract v1 — implemented narrow boundary

Supersedes the original P0 hypothetical `read/{kind}` / `actions` document.
Implementation: `apps/erp/src/lib/integration/{contract,service}.ts` and
`apps/erp/src/app/api/integration/v1/[...path]/route.ts`; Python client `cdi.erp.HttpERP`.
ADR-006 and ADR-007 apply. Demo adapter remains isolated for local fixtures.

## Identity and scope

`ERP_BASE_URL=https://<ERP host>/api/integration/v1`, never supplied by uploaded content.
Requests include `X-ERP-Audience: celerates-intelligence`, `X-ERP-Environment: <INTELLIGENCE_ENVIRONMENT>` (defaults to APP_ENV).
Reads use `Authorization: Bearer <ERP_TOKEN>`; POST review/commands use separate
`ERP_ACTION_TOKEN`. ERP stores SHA-256 hashes only, in `INTELLIGENCE_READ_TOKEN_SHA256`
and `INTELLIGENCE_ACTION_TOKEN_SHA256`. Tokens are opaque 32–200 URL-safe characters.
The narrow machine principal is `intelligence-pilot`; credentials cannot approve reviews.
Owner grants specific tracker IDs in ERP `/intelligence`. Active grantor, grant and
record access are rechecked; revocation also denies historical receipt disclosure.
Sales tracker IDs are not Project Quotation IDs. No global ERP database credential.

## Read

- `GET resources/sales_opportunity?limit=50&cursor=<uuid>` → `items,next_cursor`.
- `GET resources/sales_opportunity/{uuid}` → schema_version, resource_type,
  record_version, as_of, source_refs, quality, data.
- `GET commands/{uuid}` → original durable receipt (read credential).
- `GET events?cursor=0&limit=50` → committed, grant-filtered events and next_cursor.

Projection includes tracker ID/number, client display name, requirement text,
position/headcount target, qualification/status, assigned Sales display name and
bounded attached references. No contact details, rates, payroll, candidate data,
signed documents or raw database rows. Capacity, canonical customer identity,
project history and commercial approval remain explicitly unknown/unsupported.
Pagination is a live keyset read, not a snapshot export. No ERP embedding mirror.

## Human proposal and action

`POST review-requests` with `Idempotency-Key` accepts exactly resource_type
`sales_opportunity`, resource_id, expected_version and manifest. Manifest has run_id,
context_id, context_sha256, workflow_version, outcome, note, and exactly eleven
artifacts (id, kind, title, version, summary/rows). Complete bounded content is stored
for independent ERP review. It expires after 24 hours. Unknown fields fail validation.

An active authenticated ERP Owner reviews that exact manifest at `/intelligence`.
The same-origin session endpoint binds review ID, digest, source version and note.
Machine credentials cannot invoke it. Human review records approver and decision.

`POST commands` with `Idempotency-Key` accepts exactly:

```json
{"kind":"artifact.persist_approved_reference","review_id":"<uuid>",
 "resource_type":"sales_opportunity","resource_id":"<uuid>",
 "expected_version":1,"manifest_sha256":"<sha256>"}
```

Within one transaction: lock principal/key, enforce current record grant, return
matching prior receipt **before** consumed-review checks, otherwise validate exact
approved/unexpired review and active approver, lock/check ERP version, insert one
immutable reference, increment tracker version, persist receipt, consume approval,
write activity and outbox. Unique principal/key, review and opportunity/run constraints
prevent duplicate effects. Same key/different payload is 409. Stale source is 412.
The command does not advance commercial status or imply a proposal was sent.
Python reads the command receipt back before persisting workflow success/outcome.

## Events and failure semantics

Source updates and reference attachment emit versioned events transactionally. A
statement trigger takes a transaction advisory lock **before** identity allocation;
a committed cursor cannot skip a lower in-flight publication. Rollback gaps are valid.
Reads apply current grants, so this is a pull signal feed, not a full change-data-capture
replica. Revocation is enforced on subsequent reads; clients must not retain access
based only on old events. No webhook transport, consumer daemon or replay retention
policy is claimed in this baseline.

Errors contain fixed code, safe message, retryable flag and correlation ID. No SQL
or transport credential details. Missing/invalid credential 401; wrong audience 403;
unavailable record 404; conflicting idempotency 409; stale/missing approval 412;
invalid schema 422. No HTTP-mode fallback to demo. Pending human review is surfaced as
ERP_REVIEW_REQUIRED in Intelligence; explicit Check approval resumes its checkpoint.
