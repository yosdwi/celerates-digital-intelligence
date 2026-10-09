# Sales V2 tab migration: method and parity lists

Status: started 2026-10-09 (QA doc pages 24–25 discussion).
- Done earlier: Opportunity Tracker, PQ Tracker, Account (CRM).
- Order agreed for the rest:
  1. Client Active
  2. Profitability Tracker
  3. Overtime & Business Trip
  4. Dashboard

## Method (how a tab moves without regressions)

1. **Parity list first.** Write down every V1 field, filter, sort, summary card, action, permission, export and notification in this document before building.
2. **Same data, same writes.** V2 reuses V1's server actions and tables:
   - no new schema;
   - no data migration;
   - no second write path.
   V1 and V2 therefore always show the same rows. Any additive change goes into the V1 action, so both pages get it. An example is edit history.
3. **One kit.** Each V2 tab is a config on `features/sales-v2/record-workspace.tsx`, which provides:
   - table, board and grid;
   - views, filters and in-cell edit;
   - the record panel and its history.
   A tab adds only its model (pure, tested), its data loader, its config and its panel.
4. **Access unchanged.**
   - The route gate (`lib/route-access.ts`) lists the same divisions as V1.
   - The page computes `canEdit` from the same division levels V1's action requires, and the action still checks on its own.
   - Collaborating divisions keep their access.
5. **Checks per tab:**
   - a model and contract test in `tests/sales-v2.test.ts`;
   - the action-coverage security test;
   - a browser check on the pilot right after deploy (the qa23 lesson).
6. **Switch.** The menu points to V2, and V1 stays at "Versi lama" for at least one cycle. V1 is removed only after QA sign-off.

## Client Active (V2 at `/sales/v2/client-active`, V1 `/ta/client-active`)

| V1 | V2 |
|---|---|
| Rows: every application, with its candidate and requisition, newest first | Same query (`client-active-data.ts`) |
| Grouped by client (accordion) | Table grouped by client (`groupBy`); client is also a filter |
| Cards: Total Candidate, Total sent, Client Interview, Client Accepted | Same four KPIs |
| Search: candidate no, name, position, WA, email | Same, plus client |
| Filters: hiring status, client status (with "not sent") | Same, as toolbar filters; "Belum dikirim" is a status value |
| Sorts: name, position, price, hiring status, client status | Every column sorts; status in pipeline order |
| Columns: No, Name, Positions, Level, WA, Email, Price, Hiring Status, Client Status (+ by/when, note) | Same, each its own column |
| Update status + note (`updateClientSubmissionStatus`, TA or Sales editor) | The same action, from the cell, the panel, the board, or the panel note |
| Notifications on update (`notifyAboutClientSubmissionUpdate`) | Unchanged (inside the action) |
| None | Added: board by client status, saved views, record panel, edit history (`client_submission`, recorded by the V1 action so V1 edits show too) |

V1 limitation kept: a status cannot be cleared back to "not sent". The board refuses moves into "Belum dikirim" and says so.

Access:
- Sales or TA (any level) open the page.
- Editors of either division write.
- The Owner opens and writes.

## Next tabs: parity lists to be written before building
- Profitability Tracker (`/sales/profitability-tracker`; Sales, TM, PMO)
- Overtime & Business Trip (`/pmo/overtime-business-trip`; PMO-owned, shared with Sales, HR, Finance)
- Sales Dashboard (`/sales/dashboard`)
