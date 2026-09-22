# ADR-002 — PostgreSQL + pgvector for the Initial Intelligence Store

**Status:** Accepted

## Context

The Intelligence Layer needs relational metadata, document/chunk metadata, source provenance, artifact/workflow records, and semantic retrieval. A dedicated vector database would add another operational system before scale requires it.

## Decision

Use PostgreSQL for the intelligence store, pgvector for vector retrieval, and PostgreSQL full-text search for keyword/hybrid retrieval.

Store document binaries in MinIO/S3-compatible storage.

## Important boundary

Do not mirror the whole ERP into embeddings. Current structured operational state remains authoritative in ERP and should be queried through structured tools/read models. Vector search is primarily a retrieval capability for knowledge/document context.

## Consequences

- smaller POC operational footprint;
- relational filters and vector retrieval can live together;
- easy migration path if a specialized search/vector system becomes justified later.
