# Repository Agent Instructions

## Intent

This repository must remain both an architecture source of truth and an executable product foundation for Celerates Digital Intelligence.

## Non-negotiable principles

1. Existing Celerates ERP is the Digital Operational Core and source of truth.
2. Intelligence augments ERP; it does not fork operational truth into a second ERP.
3. PostgreSQL/pgvector is an intelligence store and retrieval index, not a reason to embed every ERP row.
4. Deterministic business facts remain deterministic.
5. Model providers are accessed through the Model Gateway abstraction.
6. Human review is explicit for critical outputs and external communication.
7. Outcomes/status return to ERP through an adapter/action boundary.
8. Critical integration logic belongs in Python and Git. n8n is supporting low-code automation.
9. No Airbyte in the initial baseline.
10. Mermaid files are canonical diagrams.

## Before changing architecture

Read all files under `docs/adr/`. If a locked decision changes, add a new ADR or supersede the old one. Do not silently rewrite architectural intent.

## Product implementation

Prioritize a working end-to-end Pre-Sales flow before broad feature count. A smaller complete workflow is preferable to many static screens.

UI must stay presentation-quality, responsive, concise, and business-first. BMS Services is a visual/storytelling reference only; do not copy proprietary assets or page content.
