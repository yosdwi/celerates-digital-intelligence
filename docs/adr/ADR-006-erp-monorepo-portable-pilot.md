# ADR-006 — ERP baseline in the Intelligence monorepo; portable isolated pilot

Status: accepted by explicit user implementation instruction, 2026-09-23.

## Context and authority

Issue #3 audit is complete in `docs/erp-audit/`. Its initial implementation gate required a canonical source or explicit snapshot acceptance. The user subsequently instructed implementation **in yosdwi/celerates-digital-intelligence**, using Railway, Docker, PostgreSQL and future VPS portability. This explicitly selects the audited ZIP as the implementation baseline; it does not claim an unseen canonical ERP repository was reconciled or that independent BA acceptance occurred.

Input: `celerates-erp-main.zip`, SHA-256 `7c022ed3dd7759fb3317cbd9eebde882050f13a45b865ccc75e37b87f04ddee7`. Source is imported at `apps/erp` excluding assistant metadata and compiler cache. Original audit evidence remains unchanged.

## Decision

1. Keep original ERP business modules and PostgreSQL/Drizzle model. Add checked-in migrations and safe first-owner setup; never seed a personal hardcoded owner.
2. Deploy ERP separately from the existing Intelligence stack: dedicated PostgreSQL 16 and private S3-compatible storage with persistent volumes. One Next.js container, portable Docker Compose for VPS. The Railway project is `celerates-erp-pilot`; existing Intelligence services remain separate.
3. Replace Supabase-specific document transport with private S3 (MinIO), matching ADR-002/005 and avoiding a provider dependency on VPS. This is a necessary portability implementation change, not a change to ERP authority. Existing storage paths require an explicit object-copy migration before any legacy data import. This pilot starts with empty data.
4. Server-side Owner-only pilot guard covers all operational server actions; disabled integrations remain blocked at entry. Multi-role rollout is a separate authorization gate. Do not enable real payroll, billing, approvals or operational cutover on the basis of this deployment alone.
5. Existing feature tracker gains page/release/environment context and BA acceptance/release/validation fields. A real BA still supplies business acceptance; automated checks cannot stand in for it.
6. ERP-to-Intelligence contracts remain governed by `docs/erp-audit/07-erp-to-intelligence-contract.md`. No Intelligence direct database access, operational embedding, background synchronization, invented employee/user crosswalk, or model-generated business facts are introduced.

## Consequences

Runtime is independent of Railway APIs and uses standard PostgreSQL/S3/HTTP. Initial single-container pilot has a bounded pool (5), query/transaction timeouts, immutable upload keys and authenticated object reads. Startup runs checksum-verified transactional migrations under an advisory lock and private-bucket initialization. Existing nonempty databases without this migration history are refused. Schema rollback is forward-fix or coordinated restore, never automatic down-migration.

Initial DB/storage credentials are scoped to this isolated pilot but retain administrative capabilities needed for initialization. Separate provisioner and least-privilege runtime roles, offsite backup scheduling, measured sizing, broad role/record authorization and audited workflow repairs remain release gates for real production. This ADR does not supersede ADR-001 through ADR-005.
