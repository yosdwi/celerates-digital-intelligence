# ADR-019: ConForm is a bounded operational service; Celerates is the only user-facing product

Status: accepted (2026-09-28). Requirements, identity, RBAC, journeys and retirement plan: [doc 21](../21-conform-bounded-service-execution.md). The provider-owned wire contract is `celerates-bast-digital/docs/celerates-integration-v1.md`. This ADR keeps ADR-001–018 unchanged and **amends the pilot access policy** (`src/lib/access-policy.ts`) in one bounded way: §4 below.

## Context

ConForm (`celerates-bast-digital`) already runs Talent/PMO operational closing:
- PAMA attendance ingest;
- a correction-aware Payroll closing projection;
- attendance corrections with evidence and PMO approval;
- the canonical BAST assembler and renderer;
- the canonical attendance CSV exporter;
- a whatsapp-web.js bridge.

Its user-facing surfaces (TalentOps web, Talent Mobile, NocoDB, bot menus) overlap with Celerates, which is becoming the one product people use.

Rebuilding these rules in Celerates would fork operational truth. Merging the codebases would couple two deployments: Railway for Celerates and Intelligence, a VPS for ConForm.

## Decision

1. **Celerates is the single user-facing operational product.**
   - Talent and PMO closing work happens in Celerates (Kelengkapan Saya, PMO › Operational Readiness, Tinjau).
   - ConForm Web, Talent Mobile and NocoDB become internal and rollback tools, retired in stages (doc 21 §11).
2. **ConForm is an independent bounded service with a versioned API.**
   - The API is `/api/celerates/v1`. ConForm keeps ownership of readiness, corrections, evidence, BAST, CSV, WhatsApp identity and delivery.
   - Celerates calls it through one server-side client, configured only by `CONFORM_BASE_URL` and `CONFORM_SERVICE_TOKEN`.
   - Co-locating the services later is a configuration change.
3. **No duplication of canonical logic.**
   - Celerates never computes readiness, eligibility, CSV content or BAST, and never copies ConForm tables.
   - Decisions taken in Celerates are *applied by ConForm*, which re-validates first.
4. **Talent access in Celerates.**
   - Access is bounded to `/me`, `/api/talent` and `/go`.
   - A Talent session starts only from a single-use, expiring, hashed deep-link grant bound to a Celerates user with an **active identity link**, or from an already-valid session of that same user.
   - A different-user session fails closed.
   - WhatsApp is only a delivery channel: it never authenticates anyone to Celerates, and the JID never reaches Celerates.
5. **Backoffice non-Owners stay closed during the pilot.** The PMO rules are already written to division levels (PMO read / editor / full) so they apply unchanged once the pilot middleware opens to PMO users after record-level review.
6. **WhatsApp campaigns are governed in ConForm.**
   - Campaigns have an audience snapshot, eligibility, dedupe, a blocker re-check, bounded batches, sending windows, pacing, limited retry, approval, pause/resume/stop, a kill switch, auto-pause on transport failure, and an audit trail (doc 21 §8).
   - The transport is unchanged. There is no Meta Cloud API migration and no anti-ban evasion.
7. **Agent governance is unchanged.**
   - The Agent is PMO-only. It gets no ConForm write tools, and no model-generated SQL reaches ConForm.
   - Company Files and Tinjau authority patterns are reused as they are.

## Consequences

- There are two deployables with a stable contract between them. ConForm owns contract changes: a breaking change needs `/v2` and a Celerates change behind the same client.
- Talent requirements follow ConForm's Payroll cycle (21st to 20th, correction-aware). The calendar-month BAST gate stays ConForm's own. The two can differ after a rejected correction, which is a known ConForm defect listed in doc 21 §12.
- The action-coverage test accepts `requireTalentActor()` as a first-statement guard for Talent server actions.
- The ERP schema gains two tables: `talent_identity_links` and `talent_link_grants`.
