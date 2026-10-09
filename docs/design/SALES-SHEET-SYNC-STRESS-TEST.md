# Sales Google Sheet Sync: stress test and target design

Status: test sheets ready (2026-10-09). The predictions in section 3 come from reading the code and have not been
observed yet; the Product Owner runs the test in the web app and records what really happens in section 4.

## 1. Goal

The Sales team already keeps its pipeline in Google Sheets. Before the pilot relies on Sheet Sync, we check how the
current sync (V1 actions, reused by the Sales V2 dialog) copes with a sheet that looks like a real team sheet:
- headers that differ from the ERP's labels;
- mixed value formats;
- typed cells;
- blanks and duplicates;
- rows that must be refused.

The result decides how far the sync must move towards an import flow like Attio's or Frappe's (section 5).

## 2. Test sheets

Both sheets are owned by yoses.maheswara@gmail.com and shared with celeratesapps@celerates.co.id as Editor (the
account the ERP syncs as).

| Sheet | Tabs | Link |
|---|---|---|
| UJI Sheet Sync - Opportunity Tracker (Tim Sales) | Pipeline (messy, 17 rows), Rapi (clean baseline, 3), Lebar (needed columns at Y–AB), Catatan Uji | https://docs.google.com/spreadsheets/d/1DkW3upjRl-k-sd8MujMBrWzITPoPueThLRGwJfOcwag/edit |
| UJI Sheet Sync - PQ Tracker (Tim Sales) | PQ (messy, 8 rows), Rapi (clean baseline, 1), Catatan Uji | https://docs.google.com/spreadsheets/d/1twHtZ_76MffUIV7Nsigj6hdTgo0S2ir4RCA8tUAAYdo/edit |

- **Generator:** `artifacts/sheet-sync-stress/generate_sheets.py` builds both workbooks with openpyxl, as XLSX, and
  uploads them to Drive, where they are converted. The data is synthetic.
- **Marker:** every client name starts with `UJI `, so imported rows can be found and removed (section 6).
- **Catatan Uji tab:** each case and what a mature sync should do with it.

### How to run

1. **Connect the account.** As Owner, open Sales V2 → Opportunity Tracker → Google Sheet Sync and connect
   celeratesapps@celerates.co.id.
2. **Baseline first.** Use "Tampilkan daftar Google Sheet", pick the Opportunity sheet and the **Rapi** tab, connect,
   map the columns and run **Pull**. Everything should import.
3. **Messy tab.** Switch the connection to the **Pipeline** tab, map the columns, then:
   - run **Pull**;
   - check the records in the ERP;
   - run **Pull** a second time.
4. **Wide tab.** Switch to the **Lebar** tab and look at the mapping list.
5. **PQ sheet.** Repeat steps 2–3 for the PQ sheet in PQ Tracker, using its **Rapi** and **PQ** tabs.
6. **Push, last.** Only after the Pull checks, try **Push** on the test sheet. It must never be tried on a real team
   sheet first (section 3).

## 3. What the code predicts (not yet observed)

| # | Case | Current behaviour, from the code | Risk |
|---|---|---|---|
| P1 | Headers differ ("Nama Klien ", "PIC Sales", "Rate / bulan") | The mapping form lists the sheet's headers, but every field is picked by hand; nothing is auto-matched. The mapping stores the exact header text. | Slow setup; a renamed header silently unmaps a column. |
| P2 | Formatted numbers: currency cells "Rp15.000.000", typed text "Rp 18.000.000", "15jt", "4.500.000", "USD 2,000", "TBD" | Values are read as **formatted text** and parsed with `Number()`. Every one of these becomes **empty** without a warning. Only plain digits survive. | Price and deal values are lost silently. |
| P3 | Dates "01/10/2026", "10/01/2026", "Oct 1, 2026" | Passed straight to PostgreSQL `date` (pilot DateStyle `ISO, MDY`, checked 2026-10-09). "01/10/2026" is stored as **10 January**. | Wrong dates, silently. |
| P4 | Dates "1 Okt 2026", "kemarin", "TBD" | PostgreSQL rejects them. The whole Pull stops with a database error. Rows before it are already saved, with no transaction. | Partial import; the person sees one cryptic error. |
| P5 | Status "Closed Lost", "Won", "Drop", "On Hold", "CV Submitted"; service "Manage Service", "IT Consulting"; level "C-Level", "Sr." | Unknown values are slugified and **stored as new codes** (`closed_lost`, `drop`, `cv_submitted`, `manage_service`). Only exact matches of the V1 maps convert. | Deals with an unknown stage drop out of the Kanban columns and the stage filters. |
| P6 | Qualified "✓", "x", "Ya", "TRUE" | Only text containing true, yes or ya counts as yes. "✓" becomes **no**. | Wrong flag. |
| P7 | Headcount "3 orang", "2-3"; BANT "High", "80%", "4/5" | `Number()` fails and the field is left empty. | Lost data, no warning. |
| P8 | Sales PIC "tyas ", "Budi S." | Stored as typed. They do not match a Sales account, so "Deal saya" misses them. | Inconsistent PIC. |
| P9 | Rows with no client, no PIC, or a section title | Skipped and counted as "skipped" with no reason. | Fine, but not explained. |
| P10 | No Opty No | Each Pull **creates a new record** (`OPTY-IMPORT-<time>-n`). A second Pull duplicates every such row. | Duplicates on every Pull. |
| P11 | Same Opty No twice | The second row overwrites the first. | Silent data loss. |
| P12 | Opty No that already exists (seed `OPTY2026-S058`, `OPTY2026-S069`) | Overwrites the existing record with no preview and no history. Sync writes bypass `record_field_changes`, so the change is not in Riwayat. | Untraceable overwrite. |
| P13 | Needed columns past Z (tab Lebar) | Headers are read from A1:Z1 and data from A2:Z1000. Columns AA/AB never appear in the mapping. | Wide team sheets can't be synced. |
| P14 | `<script>` text, a `=HYPERLINK` cell, multi-line notes, emoji | Stored as text. React escapes it on screen. A formula cell is read as its displayed text ("klik"). | Low; correct. |
| P15 | **Push** | Clears columns **A:R** of the connected tab and rewrites it with **all** ERP records (300+ seed rows), as codes, under fixed headers. Extra team columns (S onwards) stay, but their rows no longer line up. | **Destroys a team sheet.** Any Sales editor can trigger it. |
| P16 | PQ sheet | Same pattern. PQ codes are slugified with no map at all ("Manage Service" → `manage_service`, "P1" → `p1`). A blank ID Opty or PQ No generates new numbers, so every Pull duplicates the row. | As P5 and P10. |

## 4. Observed results (run 2026-10-09 by the Product Owner; rows checked in the pilot DB)

| Tab | What happened | Confirms |
|---|---|---|
| OT **Rapi** | Pull imported all 3 rows with correct codes, numbers and dates. | Baseline OK |
| OT **Pipeline** | Pull stopped at row 5 (UJI PT Nusantara Logistik) with a raw "Failed query: insert into sales_opportunity_trackers …" message; the date "1 Okt 2026" was refused. Rows 2–4 were already saved and rows 6–18 never ran. | P4 |
| OT **Pipeline** row 2 | Price "Rp15.000.000" (currency cell) stored **empty**. Date "01/10/2026" stored as **2026-01-10**. Deal from the formula (no format) stored correctly. | P2, P3 |
| OT **Pipeline** row 4 | Service "Managed Services" stored as the invalid code `managed_services`; client type "Lama" as `lama`; deal "Rp 540.000.000", price "Rp 18.000.000" and headcount "3 orang" stored **empty**; date stored as 2026-01-10. | P2, P3, P5, P7 |
| OT **Pipeline** row 5 (not saved) | The failing insert shows `won`, `headhunt`, `baru` and `c_level` as codes. | P5 |
| OT **Lebar** | The mapping form still showed the **Pipeline** headers after the tab changed, because its header list is kept from the previous tab. The saved mapping used "Nama Klien " (with a space), which this tab doesn't have, and Rate/Status sit at AA/AB, past Z. Pull: 0 imported, 1 skipped. | P1, P13, new bug: stale headers |
| Mapping form (doc page 13) | Even the **Rapi** tab, whose headers equal the ERP labels, opened with every column on "Jangan diimport". | P1 |
| Not yet run | Second Pull (P10), duplicate and existing keys (P11, P12), PQ sheet (P16), Push (P15). | — |

## 5. Target design (Attio / Frappe style)

What both products do, and what we would adopt:

1. **Connect once, sync many times.** The connection holds the sheet, the tab, the column mapping, the value mappings
   and the type settings. Each run is recorded with who ran it, when, and its counts and errors.
2. **Column matching.** Columns are auto-matched by name, with synonyms and a fuzzy match: "Nama Klien" → Client Name,
   "PIC Sales" → Sales PIC. The person confirms or changes each match. Unmatched columns are ignored, or appended to
   Notes if chosen. All columns are read, not just A–Z.
3. **Value mapping for choice fields** (stage, service, level, client type, priority, BU, Sales PIC):
   - every distinct value found in the sheet is listed once, with a suggested ERP value;
   - unknown values must be mapped or the row is refused;
   - mappings are remembered for later runs;
   - this is Attio's "map select options" step.
4. **Type settings per column:**
   - date format (DD/MM/YYYY or MM/DD/YYYY);
   - number locale (Indonesian thousands with ".");
   - currency, with "jt"/"juta" understood;
   - checkbox words (✓, x, ya, tidak).
   - Values are read unformatted from the Sheets API (`valueRenderOption=UNFORMATTED_VALUE`, dates as serial numbers),
     so currency formats stop mattering.
5. **Preview (dry run).** Every row shows Create / Update / Skip / Error with the reason, and Updates show a field
   diff. Nothing is written until the person confirms. This is Frappe's Data Import preview with warnings.
6. **Identity and duplicates.**
   - The person chooses the key: Opty No, PQ No, or "create only".
   - Rows without a key are matched by client + position + Sales PIC, and a likely duplicate is flagged instead of
     created.
   - Keys duplicated within the sheet are reported, not applied.
7. **Commit safely.**
   - Valid rows go in one transaction, and the failed rows are listed and can be retried (Frappe's "retry failed
     rows").
   - Updates go through the same history as manual edits (`record_field_changes`).
   - Each run can be undone: created rows deleted, updates reverted from the history.
8. **Push without damage:**
   - Push updates only the mapped columns of rows it can match by key, in the team's own column order and labels, and
     leaves other columns and formatting alone.
   - New ERP rows are appended.
   - "Export to a new tab" is offered for a full dump.
   - Push is limited to Sales Full or Owner and asks for confirmation, showing how many cells will change.
9. **Direction and conflicts.** One source of truth per field during the pilot: ERP wins after go-live, the sheet wins
   during migration. A conflict (both changed since the last run) is shown, not silently overwritten.

## 6. Clean-up after the test

Imported test rows carry the `UJI ` marker. Remove them after a `pg_dump` backup, then check that no other record
changed. The two seed records named in P12 may have been overwritten by the test (OT `OPTY2026-S058`, PQ
`OPTY2026-S069`); restore them from the backup if needed.

```sql
DELETE FROM sales_opportunity_trackers WHERE client_name LIKE 'UJI %';
DELETE FROM opportunities WHERE client_name LIKE 'UJI %';
```

Disconnect the test sheets in the dialog ("Putuskan" is for the Google account; re-point the connection at the real
sheet) before the real team sheet is used.

## 7. Open decisions

- Build the full import flow in section 5 before the pilot, or ship a safe subset first? The safe subset would be:
  - unformatted reads;
  - Rupiah/date parsing;
  - value mapping;
  - preview;
  - per-row errors;
  - no duplicate on re-Pull;
  - Push limited and non-destructive.
- Who may Push during the pilot, if anyone.
- Which side wins per field during the pilot.
