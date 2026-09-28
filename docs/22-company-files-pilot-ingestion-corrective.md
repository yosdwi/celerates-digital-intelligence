# Company Files — Pilot Ingestion Corrective Note

Status: **observed in deployed pilot; documentation-only handoff, no code change in this commit**  
Date: 2026-09-28  
Branch: `audit/erp-production-readiness`  
Related architecture: [17-company-files-architecture.md](17-company-files-architecture.md), ADR-018, M6 Company Files.

## Purpose

Record a real pilot failure so the next implementation agent can continue from the observed runtime behavior without re-diagnosing the whole Company Files architecture.

This note is intentionally narrow. It does **not** change the locked Company Files authorization model or access-class semantics. The corrective work belongs in ingestion/extraction and its regression coverage.

---

## 1. Observed pilot case

A managed Company File was uploaded through the ERP Company Files UI:

- title: `BAST DEVELOPER PAMA`
- source file shown by the UI: `BAST_developer_2026-08 (9).pdf`
- kind: `bast`
- access class: **Divisi**
- owner division shown by UI: `PMO`
- origin: uploaded in Company Files (`managed`)
- version: `v1`
- upload time shown by UI: `28/9/2026, 17.38.18`

The file detail UI reports:

```text
Versi 1 · Metadata saja · 26 tabel
v1 · BAST_developer_2026-08 (9).pdf · ... · Metadata saja
```

In the same pilot, another managed PDF behaves correctly:

- title: `GUIDE LINE CHATBOT IOT DEV PAMA`
- kind: `sop`
- access class: **Umum**
- source file: `Guideline Chatbot Conform IoT PAMA.pdf`
- UI reports: `Versi 1 · Dapat dicari · 5 hal.`

This comparison is useful because it confirms that Company Files upload and general PDF indexing are functioning in the deployment; the failure is specific to the BAST/table-oriented extraction path or its fallback behavior.

---

## 2. Agent symptom

From Celerates Agent, the user asked about the uploaded BAST and then explicitly asked to search Company Files.

Observed behavior:

1. the Agent found one evidence item (`E1`), so the file metadata/title was discoverable;
2. the Agent still answered that there was no readable BAST content;
3. the BAST detail view then confirmed the version was `Metadata saja`, not `Dapat dicari`.

Important distinction for future debugging:

- `E1` in this case does **not** prove that the PDF body was successfully extracted;
- `files_search` can return a title/metadata hit without a matching chunk;
- `file_read` depends on current-version rows in `chunks`, so a `metadata_only` version yields no page passages for the Agent.

Do not diagnose this case as a Commercial/model-visibility restriction. The actual uploaded record is class **Divisi**, whose content is intended to be model-readable under the current class policy.

---

## 3. Relevant implementation path

Current code paths:

- `services/intelligence-api/cdi/files.py`
  - `TABLE_KINDS` includes `bast`, `contract`, `manpower`, `proposal`, `po`, and `invoice`;
  - `ingest()` calls `extract.extract(..., want_tables=file["kind"] in TABLE_KINDS, ...)`;
  - chunks are produced with `extract.chunks(got.pages)`;
  - final ingestion state is `indexed` only when at least one usable piece exists, otherwise `metadata_only`.
- `services/intelligence-api/cdi/extract.py`
  - for PDFs, `want_tables=True` makes the extraction path prefer Docling even when the PDF already has a text layer;
  - `docling_pages()` increments the `tables` count when a table object is detected;
  - only blocks with non-empty usable text are inserted into `pages`;
  - therefore a run can legitimately report a non-zero table count while still producing zero usable chunks.
- `services/intelligence-api/cdi/agent/tools.py`
  - `files_search` returns Company Files metadata and snippet content only when retrieval produced one;
  - `file_read` reads page-cited passages from indexed chunks.
- `services/intelligence-api/cdi/agent/reasoning.py`
  - a file metadata hit can become numbered `E` evidence even when the result has no matching text.

The observed combination `Metadata saja · 26 tabel` is therefore consistent with this sequence:

```text
managed BAST PDF
  -> kind=bast
  -> want_tables=True
  -> Docling table/layout path
  -> table structures detected (26)
  -> zero usable text chunks
  -> ingest_state=metadata_only
  -> title remains searchable as metadata
  -> Agent gets metadata evidence but no passages
```

This sequence is the current leading diagnosis because it matches both the deployed UI state and the implementation. The next executor should still verify the stored `file_versions` row and chunk count before patching.

---

## 4. Corrective requirement

Implement the fix **generically for the table-oriented PDF path**, not as a special case for this BAST filename.

Required behavior:

1. Preserve the existing pypdf text extraction result before attempting Docling for a table-oriented PDF.
2. Attempt Docling/table extraction as today.
3. Evaluate **usable extracted content/chunks**, not only detected table count.
4. If Docling produces zero usable chunks while the original PDF text layer contains usable text, fall back to page-aware pypdf paragraph extraction.
5. Keep page provenance.
6. Record the parser/fallback in diagnostics (for example `pypdf-v1-fallback` or an equivalent explicit value).
7. Do not weaken access class, authorization, model-visibility, or file policy to solve an extraction failure.
8. After the fix, requeue/re-ingest existing affected `metadata_only` versions that are eligible for this fallback.

Conceptual behavior:

```python
raw = pdf_pages(body)

# table-oriented attempt
pages, tables = docling_extract(...)
pieces = chunks(pages)

if not pieces and any(text.strip() for _, text in raw):
    pages = [(page, paragraph_blocks(text)) for page, text in raw if text.strip()]
    parser = "pypdf-v1-fallback"
    pieces = chunks(pages)
```

Exact implementation may differ, but the invariant is: **a text-bearing PDF must not become metadata-only solely because the richer table/layout parser returned no usable blocks**.

---

## 5. Scope of the corrective

The same risk applies to every current `TABLE_KINDS` PDF:

- `bast`
- `contract`
- `manpower`
- `proposal`
- `po`
- `invoice`

Do not limit regression coverage to `bast`.

Non-table-oriented PDFs such as the observed SOP must continue to index normally.

---

## 6. Regression tests required

At minimum add tests for these cases:

### A. Table-oriented PDF: Docling yields useful content

Expected:

- parser remains Docling;
- pages/chunks are indexed;
- `ingest_state=indexed`;
- table count is retained.

### B. Table-oriented PDF: Docling detects tables but yields zero usable blocks; pypdf has text

Expected:

- fallback is invoked;
- page-aware pypdf text produces chunks;
- `ingest_state=indexed`, not `metadata_only`;
- parser/diagnostic indicates fallback;
- detected table count may remain diagnostic metadata but must not imply successful content indexing by itself.

### C. Truly contentless/scanned PDF where no OCR/text can produce chunks

Expected:

- existing safe behavior is retained (`metadata_only` or failure according to extractor semantics);
- no fabricated content.

### D. Agent retrieval after fallback

For an authorized `division` file:

- `files_search` finds the file;
- `file_read` returns page-cited passages from the current version;
- Agent can answer from the passages and cite the file evidence.

### E. Authorization regression

The extraction fix must not change:

- division access checks;
- commercial/personal model-visibility behavior;
- record-level authorization;
- audit logging.

---

## 7. Pilot acceptance for this exact case

After corrective deployment and re-ingestion of `BAST DEVELOPER PAMA`:

- Company Files detail must no longer show the current version as `Metadata saja` if usable PDF text exists;
- it should be represented as searchable/indexed (`Dapat dicari`) with page diagnostics;
- `file_read` should return at least one real passage from the BAST;
- asking the Agent to search Company Files for this BAST should produce content-backed evidence, not a metadata-only `E1` followed by "tidak ada file BAST yang dapat dibaca";
- the file remains class **Divisi / PMO**; no reclassification is required for this corrective.

---

## 8. Next-agent execution instruction

For the next Opus/execution agent:

1. **Do not restart the Company Files architecture audit.** ADR-018/M6 remain the baseline.
2. Reproduce/verify this specific persisted version: inspect `file_versions.ingest_state`, `parser`, `pages`, `tables`, `flags`, `error`, and current-version `chunks` count.
3. Confirm the source PDF has a usable pypdf text layer.
4. Implement the generic Docling-zero-content -> pypdf fallback.
5. Add the regression matrix above.
6. Re-ingest affected metadata-only versions safely/idempotently.
7. Validate the complete flow: Company Files detail -> search -> `file_read` -> Agent evidence/answer.

Do not solve this by changing `BAST` from `division` to another class or by weakening governance. The observed defect is an ingestion/content-availability problem.