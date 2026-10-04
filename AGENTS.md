# Repository Agent Instructions

## Intent

This repository must remain both an architecture source of truth and an executable product foundation for Celerates ERP + Digital Intelligence.

## Non-negotiable principles

1. Celerates ERP is the **Digital Operational Core** for the business capabilities it owns. It becomes canonical operational truth per capability only after the workflow, data, control and cut-over are validated.
2. Existing specialist systems may remain authoritative for capabilities that Celerates deliberately retains or integrates. Never create two uncontrolled write-owners for the same operational state.
3. Intelligence augments ERP and governed external context; it does not fork operational truth into a second ERP.
4. PostgreSQL/pgvector is an intelligence store and retrieval index, not a reason to embed every ERP row.
5. Deterministic business facts remain deterministic.
6. Model providers are accessed through the Model Gateway abstraction.
7. Human review is explicit for critical outputs and external communication.
8. Outcomes/status return to ERP through an adapter/action boundary.
9. Critical integration logic belongs in Python and Git. n8n is supporting low-code automation.
10. No Airbyte in the initial baseline.
11. Mermaid files are canonical diagrams.

## Product and experience principles

- **Apps adapt to user workflow, not the opposite.**
- Business-capability/domain architecture and navigation are different concerns. Role-based workspaces may aggregate capabilities from several domains; do not force the sidebar to mirror backend ownership.
- Prefer **configuration before customization**: reusable list/form/table/filter/status/workflow patterns, saved views and governed configuration before one-off pages.
- Mature cross-division workflows first. Do not rebuild a mature commodity capability merely to make every function native to Celerates.
- For each overlapping capability, explicitly choose one transition direction: **retain, integrate, migrate, rebuild, or retire**.
- Keep one write-owner/source of truth per capability or datum at each transition stage. Avoid bidirectional sync without explicit authority and conflict rules.
- Treat user adoption as an architecture dependency: good UX → adoption → complete data → trusted operational state → useful Intelligence.

## Deployment direction

The target production architecture is portable Docker-based deployment on the approved VPS baseline. Provider-specific historical pilots are implementation records, not permanent target architecture.

The initial production topology remains deliberately small: ERP/runtime services, PostgreSQL, private S3-compatible object storage and self-hosted observability can share the VPS while measured capacity is healthy. Scale from evidence, not speculation.

## Before changing architecture

Read all files under `docs/adr/`. If a locked decision changes, add a new ADR or explicitly supersede the old decision. Do not silently rewrite architectural intent.

## Product implementation

Prioritize real, end-to-end divisional workflows and a working ERP user pilot before broad feature count. A smaller complete workflow is preferable to many static screens.

For retained specialist systems, integrate through explicit adapters/contracts instead of coupling UI components directly to provider schemas.

UI must stay presentation-quality, responsive, concise, and business-first. Frappe and other mature products may be used as interaction/product references; do not copy proprietary assets or require a framework rewrite solely for visual similarity.
