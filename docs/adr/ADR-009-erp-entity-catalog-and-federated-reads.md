# ADR-009 — ERP Entity Catalog and federated, delegated reads

Status: accepted for Operating Substrate M1 (2026-09-26).

## Context

Doc 15 identified that entity knowledge is scattered across 10 disabled Sheet importers, `target-fields.ts` files, the operational rules, the path parser and one hand-written Sales projection. The Agent needs page/entity context, entity reads, relationships and search across modules without copying ERP rows into Intelligence (AGENTS.md principle 3) and without a second authorization model.

## Decision

1. **One declarative catalog, owned by ERP code** (`apps/erp/src/lib/agent/catalog.ts`). Each entity type declares:
   - table and module;
   - a display label expression;
   - fields, each with a sensitivity: `internal`, `commercial`, `pii` or `restricted`;
   - search fields;
   - page route patterns;
   - relationships: explicit code-owned SQL, each marked `fk` or `name_match`.
2. **Sensitivity is enforced in ERP before data leaves.**
   - `internal` values are returned.
   - `commercial` fields return presence only (`terisi` / `kosong`).
   - `pii` and `restricted` fields are omitted, with only their names listed as withheld.
   - Salary, religion, tax, bank and similar fields are not declared at all.
3. **Federated, not replicated.** Intelligence reads ERP facts at run time through `/api/integration/v1/agent/*` under ADR-008 delegation:
   - `catalog`;
   - `entities/{type}/{id}`;
   - `…/neighbours`;
   - `…/signals`;
   - `signals/{key}`;
   - `search`.

   Queries are read-only snapshots with explicit row limits under the existing 15 s statement timeout.
4. **Page context comes from the catalog.** A known route pattern with a UUID resolves to `{entity_type, entity_id}`, and only if the user can read that module.
5. **Signals stay deterministic.** The nine existing rules keep their SQL, wording, counts and links. The catalog adds only the mapping from rule to entity type and a restricted-ID evaluation mode (`check`), later reused for outcome watch.
6. **v1 scope** — 8 entity types, read-only:
   - `lead`, `sales_opportunity`, `commercial_pq`, `requisition`, `crm_client`;
   - `employee` (non-personal fields only);
   - `task`, `feature_request`.

   PMO/Finance entities are excluded until BAST and handoff semantics are settled (ERP audit F13).

## Consequences

- Adding an entity type is a catalog entry plus tests, not a new endpoint.
- Relationship traversal is relational (no graph database). `name_match` edges are labelled as such in evidence.
- Sheet importers and the Sales projection are not yet migrated onto the catalog; that happens with imports (ADR-011, M4).
- Search in M1 is case-insensitive substring matching over declared fields. Multilingual ranking and normalized entity resolution are M2.
