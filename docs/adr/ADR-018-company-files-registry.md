# ADR-018 — Company Files: a governed registry over files wherever their bytes are owned

Status: accepted (2026-09-27) with Operating Substrate M6. Proposal and audit: [doc 17](../17-company-files-architecture.md). Record: [operating-substrate-m6.md](../implementation/operating-substrate-m6.md). Amends ADR-011 (Agent drops share the extractor). Keeps ADR-002, ADR-005 and ADR-007 unchanged.

## Context

Company files that matter already exist in ERP: CVs, PKS/PO/CR and BAST are stored as attachments and legacy file columns. They have no metadata, no hashes, and a download route that checks only "is Owner". SOPs, proposals and manpower sheets have no home at all.

The production image already carries Docling 2.129 with RapidOCR and TableFormer, but they are switched off. Users need one place to find, open and ask about files. Access must follow ERP authority, and CV and contract content must not leak to the model or to other users.

## Decision

1. **The registry lives in Intelligence; the bytes stay with their owner.**
   - `files`, `file_versions`, `file_links` and `file_access_log` (migration 009).
   - Three origins:
     - `managed`: uploaded to Company Files; stored in Intelligence object storage under sha-addressed keys;
     - `erp`: declared by ERP; the bytes never leave ERP except to the indexer, and ERP authorizes every read;
     - `external`: a link; metadata only.
2. **ERP declares which of its files are Company Files, and serves them only to the indexer.**
   - The declaration covers `attachments.source_type` and legacy columns, with kind, class, module and linked record (`src/lib/files/sources.ts`).
   - A machine-only feed with a read credential exposes `files/catalog`, `files/feed` (full-snapshot paging) and `files/content`.
   - Identity documents (KTP, NPWP, KK, BPJS, selfies, signatures) and undeclared attachments are never declared, so they never reach the registry.
3. **Access = ERP authority ∩ access class ∩ linked-record visibility ∩ purpose.**
   - Classes are named by risk: `general`, `division`, `commercial`, `personal`.
   - Grants and per-class handling are ERP data that the Owner can edit (`file_class_grants`, `file_class_settings`, ERP migration 0008).
   - Intelligence obtains them per request (`agent/files/access`) and pre-filters in SQL before ranking.
   - For `commercial`/`personal`, ERP also confirms per request that the user can read the file (ERP origin) or a person-confirmed linked record (managed), via `agent/files/readable`.
   - Extracted links never grant access.
4. **Classes tighten automatically and loosen only by a person.**
   - A kind's default class is the minimum. Only an Owner may choose or set a looser one.
   - Identity-document patterns (NIK, NPWP, KTP/KK wording) found in a `general`/`division` file put it in `pending_review`, where only the uploader and Owners see it until a person reclassifies or withdraws it.
   - A model never sets a class.
5. **Model-hidden content never enters an Agent run.**
   - For classes whose `model_visibility` is `none` (the defaults for `commercial` and `personal`), tools return metadata and pages only.
   - No snippet or passage reaches AG-UI events, model turns, the ledger or the Brain Console trace.
   - Users read the content through the authorized, logged preview. This keeps the M1 invariant "commercial values never leave ERP".
6. **One extractor** (`cdi/extract.py`):
   - pypdf per page for text PDFs;
   - Docling with RapidOCR (torch backend, Latin script) and TableFormer for scanned pages and table-heavy kinds, keeping page provenance;
   - DOCX paragraphs and tables;
   - XLSX/CSV sheets as table blocks.
   - Chunks never cross pages, and tables are chunked alone. They are stored in the existing `chunks` table (`file_id`, `page_from`, `heading`, `block`), which reuses the multilingual FTS, embeddings and RRF.
   - Knowledge retrieval joins through `document_id`, so file chunks cannot appear in knowledge search.
   - Indexing follows class policy: `semantic` embeds, `lexical` stores no embedding, `none` stores metadata only.
   - Docling models are fetched at image build (`DOCLING_ARTIFACTS_PATH`).
7. **Ingestion is a real queue.** `file_versions` rows are claimed with `SKIP LOCKED`, a 10-minute lease, and 3 attempts with backoff; curators can retry. The worker also syncs the ERP feed every `FILES_SYNC_SECONDS` (600) and purges withdrawn managed files past their class retention unless they are on hold.
8. **The ERP document route authorizes by record.** `/api/documents` resolves an object to the record that references it and checks module access. Keys no declared row references are served to Owners only, for legacy compatibility; `DOCUMENTS_STRICT=1` refuses them.

## Consequences

- One search and open path covers CVs, contracts, BAST, SOPs, proposals and manpower sheets, with no second copy of ERP files and no new service or search engine.
- Derived text of `personal`/`commercial` files is personal or commercial data in the Intelligence database. Its protection is the platform's encryption at rest plus the access model above. Backups and retention are documented in the M6 record.
- A derived index never outlives its source:
  - an ERP deletion or replacement is reconciled at the next sync;
  - a withdrawn managed file disappears from search immediately.
- M7 builds on the file-to-record links (structured file facts, file ↔ ERP insights, CV matching) without changing this access model.
