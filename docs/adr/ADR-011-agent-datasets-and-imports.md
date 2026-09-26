# ADR-011 — Agent datasets and imports

Status: accepted (2026-09-26) with the Operating Substrate M2 increment. Record: [operating-substrate-m2.md](../implementation/operating-substrate-m2.md). Depends on ADR-010.

## Decision

1. **A dataset is an immutable, user-owned upload.**
   - The user sends CSV or XLSX (≤ 2 MB, ≤ 2,000 rows, ≤ 60 columns) through the ERP BFF (`POST /api/agent/datasets`). The BFF forwards it under the user's delegation.
   - Intelligence stores the original in object storage and keeps `agent_datasets` (profile + rows).
   - Only the owner (`principal_sub`) can use it. Datasets are not knowledge, and they are not retrieved for other users.
2. **Parsing is deterministic.**
   - The delimiter is chosen by vote: the one that gives a consistent field count across early lines wins, so `;` exports and title rows work.
   - The header row is detected in the first 10 rows.
   - Dates are day-first, and Indonesian month names are accepted.
3. **Mapping is an inference, and it is labelled as one.**
   - Intelligence chooses the untargeted ERP command whose parameter specs (names, labels, aliases, and enum values from `GET agent/catalog`) the columns satisfy best.
   - Mapping strength, strongest first:
     1. `template`: learned;
     2. `name`: exact name or alias;
     3. `similar`: ≥ 0.82;
     4. `values`: the column's values are enum codes or labels.
   - The mapping is shown to the user as `Inferensi` evidence. Unused columns are listed.
   - If a required parameter has no column, no proposal is made and the user is told which columns are missing.
4. **ERP validates every row** (ADR-010).
   - Types, enums and PIC names are checked, along with duplicate client+position within 180 days (a warning).
   - Only rows ERP marks `ok` are pre-selected. Nothing is written until the user confirms.
5. **Mapping memory is learned only from applied outcomes.**
   - When ERP reports `applied` or `partially_applied` for an import run, `agent_mapping_templates(fingerprint of normalized header set, command)` is upserted.
   - The next file with the same headers uses that mapping, shown as `Observasi`.
   - A rejected or expired proposal teaches nothing.

## Consequences

- One path imports any command that has parameter specs. Requisitions and follow-up tasks work today. Leads need a `lead.create` command in ERP.
- The existing Google Sheet sync importers stay until parity is proven for their sources. They are not retired in this increment.
- Not yet covered:
  - users correcting a mapping in the UI before proposing (today: rename the columns and re-upload);
  - mapping by model;
  - PDF, DOCX or image "drop anything";
  - datasets larger than one proposal.
