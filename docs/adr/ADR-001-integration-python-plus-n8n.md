# ADR-001 — Python Integration Core with n8n as Supporting Automation

**Status:** Accepted

## Context

Celerates needs to ingest and integrate heterogeneous raw sources. A fully visual n8n-first architecture is fast initially but makes critical domain logic harder to test, review, version and productize. Pure custom Python makes every SaaS trigger/connector unnecessarily expensive.

## Decision

Use **Python Integration Core** as the primary integration implementation and **n8n self-hosted** as a supporting low-code automation/connector surface.

Critical mapping, validation, reconciliation, idempotency, pricing, approval and domain rules live in code and Git.

Use n8n for low-risk triggers/connectors, simple SaaS workflows, intake API calls and notification fan-out.

## Consequences

Positive:

- vendor-neutral core;
- testable business logic;
- easier code review/versioning;
- n8n still accelerates common integrations;
- future commercialization is less coupled to n8n.

Trade-off:

- more connector code than an n8n-only solution;
- requires maintaining both code and optional visual automation patterns.

## Explicit non-decision

Airbyte is not included in v0. Reconsider only when database replication/CDC scale requires it.
