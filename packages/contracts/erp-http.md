# ERP adapter HTTP contract — P0

All requests use `Authorization: Bearer <ERP_TOKEN>` and a 20-second timeout. `ERP_BASE_URL` is configured by an operator, never from uploaded content. API access must also be token-protected (`API_ACCESS_TOKEN`) when `ERP_MODE=http`.

## Read

- `GET read/{kind}` → `{ "items": [...] }`
- `GET read/{kind}/{id}` → one object.

P0 consumes `opportunity`, `capability`, `project`, `exception`, `case`. Additional conceptual read domains (talent, allocations, contracts, BAST, invoices, timesheets) can be implemented behind these read models without direct database coupling.

Opportunity fields: `id,title,customer,owner,stage,status,timeline,notes`. Capability: `id,name,available,constraint,as_of`. Project: `id,name,domain,skills:string[],lesson`. Exceptions and service-case shapes are typed in `apps/web/src/types.ts`; example values are in `cdi/seed.py`.

## Creation / actions

`POST opportunities` accepts the `OpportunityCreate` schema and returns a persisted ERP opportunity. A mandatory `Idempotency-Key` identifies the creation request.

`POST actions` accepts:

```json
{
  "kind": "opportunity.outcome",
  "object_id": "OPP-001",
  "payload": {
    "status": "READY_FOR_SALES",
    "note": "Reviewed for Sales discussion; pricing remains unquoted.",
    "artifacts": [{"id":"run:brief","version":1,"review_state":"APPROVED"}]
  }
}
```

Response: `{ "acknowledged": true }`. The server **must** durably deduplicate by `Idempotency-Key`, return the prior acknowledgement on replay, and reject conflicting payload reuse. The workflow only reports success after a valid acknowledgement. `CLARIFICATION_REQUIRED` is the alternative outcome. External messaging is not part of either action.

`intake.upsert` accepts `{entity,records}` for approved, fully validated batches of `customer`, `capability`, or `project`. General ERP task/case/reminder commands and event subscriptions are extension points, not implemented write operations in P0.

## Error / retry semantics

Non-2xx, malformed response, and missing acknowledgement fail the workflow. No silent fallback to demo ERP occurs. Failed closed-loop actions are retried with the same run-based idempotency key. The browser sees `FAILED` until retry succeeds.

ERP is authoritative. The demo adapter's `demo_erp` schema represents a **stand-in ERP**, not an intelligence-layer mirror of the production ERP.
