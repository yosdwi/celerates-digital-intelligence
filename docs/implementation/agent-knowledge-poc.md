# Agent knowledge POC and feedback understanding (doc 22 P4): implementation record

Date: 2026-09-29. Branch: `feat/agent-knowledge-poc` (local commits, not pushed, not deployed).
Requirement: [doc 22 §2.7](../22-pmo-talent-operational-completion.md) (R7.1 POC, R7.2 diagnose, R7.3 feedback). Background: [M3](operating-substrate-m3.md) (generation/embedding modes), [M4](operating-substrate-m4.md) (model turns, evaluation cases), [doc 17](../17-company-files-architecture.md) (Company Files classes).

## 1. What was reported

The Agent felt "too deterministic":

- feedback was recognised only by keywords;
- a leave (cuti) policy could not be uploaded and then asked about.

The candidate causes were:

- the model path failing validation and falling back;
- file content not shared with the model;
- Indonesian retrieval;
- routing.

## 2. Evidence from production logs

Source: Railway `intelligence-api`, deploy logs 2026-09-20 → 2026-09-29. Read-only; no variables were read. Provider payloads contained no secrets; none are reproduced here.

| When (UTC) | Observation | Count |
| --- | --- | --- |
| 09-26 15:31–15:33 | `litellm.AuthenticationError 401` (Cloudflare "Authentication error") → `Agent model path fell back to deterministic: ModelUnavailable`. **The fallback then failed too** (`Agent run failed`): the deterministic path's knowledge/file search embedded the query through the same failing provider. | 2 runs failed |
| 09-26 15:45 | `410 Model has been deprecated: @cf/meta/infire-llama-3.1-8b-instruct was deprecated on 2026-05-30` → `ModelUnavailable`. There is no Agent fallback log at that time, so it was most likely an evaluation or fallback-model call. | 1 |
| 09-26 15:47 | `TypeError: the JSON object must be str … not NoneType`. The provider returned a message with no content, typical of a reasoning model that spends its token budget before answering. It surfaced as `ModelUnavailable` with no reason. | 1 |
| 09-26 16:07 | `ValueError: Invalid entity reference` → `Agent run failed`. Most likely the model read a record with a label instead of an id. | 1 run failed |
| 09-27 08:22, 08:36 | `Agent model path fell back to deterministic: ReasoningFailed`. The old log carried only the class name. The exact verdict is in the Brain Console trace of runs `b380c58b-7b4a-404a-aae7-2ea44d41af8b` and `8c7d9fb9-a9f2-4f45-8747-6e403f2454b1`, shown as `rejected: …` or `invalid: …`. | 2 |
| 09-28 01:50–01:52 | A file upload (`POST /api/files`) and an Agent run with an attachment. No fallback and no error logged. | — |

**Totals.** 37 Agent runs between 09-26 and 09-28:

- 4 logged fallbacks: 2 `ModelUnavailable` (auth) and 2 `ReasoningFailed`;
- 3 runs failed outright.

After the 09-28 redeploy, no provider error appears. So the provider is reachable now. What remained were **validation brittleness** and **retrieval/extraction quality**, and both are fixed below.

## 3. Root causes and fixes

| # | Root cause | Effect | Fix (file) |
| --- | --- | --- | --- |
| 1 | Text PDFs from pypdf have no blank lines. Each page became **one block**, cut into 900–1800-character chunks mid-sentence, with no headings. | A policy's rules sat in oversized chunks. | Lines that read as numbered headings start a section; numbered clauses and bullets start a paragraph (`extract._pdf_blocks`). The sample now yields one chunk per section, each at most ~750 characters, with headings. |
| 2 | Evidence items were clipped to 700 characters. | The model never saw the tail of a passage, so later numbers were missing. Answers were then rejected ("numbers not present") or said "not found". | File and document passages keep up to 1000 characters (`reasoning.PASSAGE_CHARS`), about one chunk. File passages also carry the file id and section heading. |
| 3 | One optional extra tool argument aborted the whole run: `"kind": null`, `"limit": 5`, an unknown `mode`. So did an unknown tool name. | Needless `ReasoningFailed`. | Extras are dropped. A call missing a required argument, or naming a tool outside the allowlist, is **not run**. It becomes evidence (`call not run: …`), so the model can correct it within the 4 rounds. The allowlist and the bound `dataset_id` are unchanged (`_validate_call`, `_loop`). |
| 4 | A made-up file id or record id raised `PolicyError`, `ValueError` or a database error. | The run failed ("Agent gagal…"), not even a fallback. | A read that is not permitted, not found or malformed becomes evidence ("not available"). Non-UUID file ids are refused before SQL (`tools._file_read`). |
| 5 | Shape and citation strictness: `{"answer": …, "calls": []}` counted as two shapes. `cite: "E2"` and grouped `[E1, E2]` were rejected. A route without a `title`, or `intent: "Agent_Feedback"`, failed. | Valid answers and routes were thrown away. | Empty companions are ignored. Citations are normalised (`reasoning.cites`, `answer_cites`). A route title defaults to the user's words and the intent is lower-cased. |
| 6 | The number check rejected answer list markers ("1.", "2)") and equivalent spellings (`01` = `1`, `1.500.000` = `1500000`). | Grounded answers were rejected. | List markers are exempt and number forms are compared canonically. **Invented numbers are still rejected**, and citations must still exist (`_check_answer`). |
| 7 | JSON in a ```` ```json ```` fence or inside a sentence, an already-parsed object, or `content: null` raised a bare `TypeError`. | `ModelUnavailable` with no reason. | `gateway.json_object` reads fenced or embedded JSON and parsed objects. Empty content raises "Model returned no content (finish_reason=…)". |
| 8 | Fallback logs carried only the exception class. | The cause was invisible in logs. | The log line and the run result (`fallback_detail`) carry a log-safe reason: the validation message, or exception types and HTTP status only, never payloads (`playbooks._fallback_detail`, `gateway.failure`). |
| 9 | Query embedding failure (the 401 above) broke file and knowledge search. | Even the deterministic fallback failed. | `retrieval.query_embedding` logs and falls back to lexical ranking (`files.search`, `knowledge.search_for_principal`). File **ingestion** is unchanged. |
| 10 | The prompt did not tell the model to read Company Files for policy and HR questions. Implicit feedback had no examples. | The model answered "not found" without reading, or treated feedback as a question. | Prompt `agent-ask-v4` adds a rule: policies, SOPs and cuti → `files_search`, then `file_read`, then cite the page. It also gives three implicit feedback examples. |
| 11 | Without a model, a question with no file keyword ("berapa jatah cuti tahunan?") never searched Company Files. | The no-model answer said nothing matched. | As a last resort, when no rule, record or knowledge matches, the deterministic `ask` searches Company Files and shows the matching passage for shared classes. |

**Unchanged by design:**

- facts come only from tool results, and answers must cite existing evidence;
- numbers must occur in evidence;
- proposals stay ERP-held and the user confirms them;
- model-hidden classes never return content;
- the deterministic cue router is still the no-model fallback (`intents.cues`, `offers`).

### Company Files class for a policy

The kind **Kebijakan** (`policy`) and the kind **SOP / prosedur** (`sop`) both default to class **general**. ERP seed `0008_company_files.sql` sets general to `model_visibility = full` and `indexing = semantic`. So a policy's content is shared with the model, and every user with ERP access can read it.

This default is right for company-wide policies, so it was not changed.

- Do not upload a policy as `commercial` or `personal`. Those classes are `model_visibility = none`. The Agent would then only say "open the file".
- The PII hold (NIK, NPWP, KTP, bank-account patterns) still applies to general files. The sample contains none of these.

### Indonesian retrieval

`chunks.search_multi` combines the `indonesian`, `english` and `simple` configurations. Stemming works for these questions:

- "tahunan" → `tahun`;
- "dibawa" → `bawa`;
- "berikutnya" → `ikut`.

Local results on the sample:

| Question | Best file passage | `file_read` order |
| --- | --- | --- |
| berapa jatah cuti tahunan? | p. 1, §2 Jenis Cuti ("Cuti tahunan 12 hari kerja…") | §2, then §3 Cuti Tahunan (p. 1) |
| apakah cuti tahunan bisa dibawa ke tahun berikutnya? | p. 3, §9 Sisa Cuti dan Carry-over | §9 first |
| cuti bersama memotong cuti tahunan? | p. 3, §10 | §10 first |

This lexical ranking works without semantic embeddings. With `EMBEDDING_MODE=litellm`, vector rank is fused in as well.

## 4. Feedback understanding (R7.3)

With a model configured, the model classifies every message itself: question, action, or one of four feedback intents (`route`). No keyword is needed.

- "kok angkanya beda sama laporan finance" and "jawaban tadi kurang lengkap" contain none of the deterministic cue words. The tests assert that `intents.cues()` is false for them and that the model still routes them.
- Keyword cues remain only for the no-model fallback, which *offers* the kinds for the user to pick.

## 5. POC artefacts and evaluation cases

- **Sample policy:** `samples/policies/kebijakan-cuti-karyawan-contoh.pdf`, 3 pages, Bahasa Indonesia.
  - Its header and footer say "CONTOH / POC — bukan kebijakan resmi".
  - It covers: jenis cuti; cuti tahunan 12 hari with pro-rata of 1 hari per bulan penuh; cuti sakit with a surat dokter; cuti melahirkan (3 bulan) and cuti ayah (3 hari); cuti besar (20 hari per 6 tahun); pengajuan and approval in ERP Time Off (7 hari / 3 hari notice, 2 hari kerja to decide); carry-over of up to 5 hari, used by 31 Maret; cuti bersama.
  - Generator: `samples/policies/generate_kebijakan_cuti.py` (reportlab).
- **Evaluation cases:** `services/intelligence-api/tests/eval_cases_p4.json`. Each has a question, an expected shape, pages or intents, and a reference script:

  | Case | Question | Expected |
  | --- | --- | --- |
  | `cuti-jatah-tahunan` | berapa jatah cuti tahunan? | answer citing p. 1: "12 hari kerja" |
  | `cuti-carry-over` | apakah cuti tahunan bisa dibawa ke tahun berikutnya? | answer citing p. 3: "5 hari kerja", "31 Maret" |
  | `feedback-filter-per-client` | tabel ini harusnya bisa difilter per client | route `feature_request`, which becomes an ERP-held Feature Request |
  | `feedback-angka-beda-finance` | kok angkanya beda sama laporan finance (after an answer) | route `agent_feedback` (no keyword) |
  | `feedback-jawaban-kurang-lengkap` | jawaban tadi kurang lengkap (after an answer) | route `agent_feedback`, reason incomplete (no keyword) |

  `tests/test_agent_knowledge_poc.py` runs each case with a stubbed provider. It then saves the run through `quality.create_case` (the real `agent_eval_cases` storage) and replays it: plan valid, shape, grounded and recall 1.0.

  The scripts deliberately include realistic small-model deviations:
  - `"kind": null`;
  - `cite: "E2"`;
  - a route without a title;
  - `"Agent_Feedback"`;
  - an empty `calls` companion.

  The same test file also covers:
  - section chunking;
  - Indonesian retrieval for both questions;
  - lexical search when embeddings fail;
  - the no-model answer finding the policy;
  - bad reads that the model recovers from;
  - invented numbers still being rejected;
  - the fallback reason.

**Tests run:** only the affected files. `tests/test_agent_knowledge_poc.py`, `tests/test_agent.py`, `tests/test_files.py` and `tests/test_retrieval.py` give **41 passed**. One existing assertion changed: an extra `dataset_id` from the model is now dropped instead of aborting the run. The test now asserts that the run's own document is read and that the model's value never reaches the tool.

## 6. How Yos runs the POC on production

This needs the branch deployed (see §7).

1. **Upload.** In ERP, open **Company Files** (`/files`) → **Unggah**.
   - Choose `kebijakan-cuti-karyawan-contoh.pdf`.
   - **Jenis: Kebijakan**. Keep the default **kelas: Umum (general)**.
   - Wait until the version shows **indexed**. Ingestion takes seconds; failures show in the Brain Console ingestion queue with **Ulangi**.
   - A policy uploaded before the deploy keeps its old chunks. Upload it again as a new version to re-index it.
2. **Ask** in the Agent panel on any page:
   - "berapa jatah cuti tahunan?"
     - A good answer: "12 hari kerja per tahun kalender; karyawan baru pro-rata 1 hari per bulan kerja penuh" with `[E…]` citations.
     - The evidence shows *Kebijakan Cuti Karyawan (Contoh) · hal. 1* cards with the passage, labelled *inferensi* (model).
   - "apakah cuti tahunan bisa dibawa ke tahun berikutnya?"
     - A good answer: "bisa, maksimal 5 hari kerja, dipakai paling lambat 31 Maret; sisanya hangus", citing hal. 3.
   - A bad answer is one that ends with "(Model tidak menghasilkan jawaban yang dapat dibuktikan…)". That is a fallback; go to step 4.
3. **Feedback without keywords.**
   - On a table page, type "tabel ini harusnya bisa difilter per client". Expect a Feature Request draft to review.
   - After any answer, type "jawaban tadi kurang lengkap" and "kok angkanya beda sama laporan finance". Expect an *Umpan balik untuk Agent* draft, with the kind shown as *inferensi*.
4. **Provenance.** Open the Brain Console from the ERP Agent panel (**Brain Console: kualitas & pembelajaran Agent →**) → Agent → the run.
   - The badge is *Model · inferensi*, *Fallback deterministik* or deterministic.
   - The model turns show each verdict (`calls`, `answer`, `route`, `rejected: …`, `invalid: …`, `unavailable`), with model, tokens and latency.
   - The tool calls include `files_search` and `file_read`.
   - A fallback run's result now carries `fallback_detail`, and the Railway log line says why.
5. **Save the cases.** In each good run's trace, click **Simpan sebagai kasus uji**. Keep the cited sources: the file page refs `file:<id>@v1#p1` or `#p3`, or the route intent.
   - Then open **Evaluasi model**, pick `AGENT_MODEL` or an `AGENT_EVAL_MODELS` candidate, and run.
   - Production cases must come from production runs, because they replay the recorded evidence. The JSON file is the checklist and the reference behaviour.

## 7. Config actions for Yos

Nothing was changed on Railway.

1. **Deploy** this branch to `intelligence-api` through the normal merge path. The ERP needs no change. After the deploy, upload the sample again (§6.1).
2. **Model names.** Make sure none of `AGENT_MODEL`, `FALLBACK_MODEL` or `AGENT_EVAL_MODELS` still names `@cf/meta/infire-llama-3.1-8b-instruct`, which Cloudflare deprecated on 2026-05-30 (410).
3. **Reasoning models.** If `AGENT_MODEL` or `FALLBACK_MODEL` is a *reasoning* model (content `null` was observed), either:
   - prefer an instruct model with JSON-mode support as `AGENT_MODEL`; or
   - compare candidates with **Evaluasi model** on the saved cases before switching.
4. **Model path switches.** The model path needs `GENERATION_MODE=litellm` and a non-empty `AGENT_MODEL`. `EMBEDDING_MODE=litellm` adds semantic ranking; lexical retrieval works either way.
   - The 401 on 09-26 was the provider credential at that time.
   - If the Brain Console shows `unavailable` turns, check `MODEL_API_KEY` and `MODEL_API_BASE`.
5. **Class policy.** In ERP, confirm the class policy for **general** still reads `model_visibility = full`. An Owner can edit it, and `none` would hide every policy's content from the Agent.
