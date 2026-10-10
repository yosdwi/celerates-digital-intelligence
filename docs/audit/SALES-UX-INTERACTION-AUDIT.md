# Sales UX Interaction Audit

**Date:** 2026-10-07 · **Target:** pilot `https://ierp.celeratesapps.com`, build `952c266` + waiver image `f9abeb8` (the build that was running during the audit)
**Method:** real browser (agent-browser 0.38.2, Chrome 155) signed in as the shared `sales.test.ierp` account (`full` Sales access) on 300 synthetic trackers. Layout was measured with scripts (`artifacts/sales-ux-dogfood/*.js`); screenshots only where a defect needed evidence. No page errors or console errors were raised during the journey.

## Executive Summary

| | P0 | P1 | P2 |
| --- | --- | --- | --- |
| Count | 0 | 6 | 7 |

Five highest-impact issues:

1. **SALES-UX-001** Kanban is 11,234 px tall at 300 cards; its horizontal scrollbar is at y = 11,665 and Win/Dropped sit off-screen at every tested desktop size.
2. **SALES-UX-002** Opening a Kanban card goes straight to the edit form; Back returns to the *List* tab at the top (Kanban view, scroll and column offset all lost).
3. **SALES-UX-003** On a phone the four sticky table columns (668 px) are wider than the table (324 px): only Action and Opty No can ever be read.
4. **SALES-UX-004** Table rows are 127–157 px (303 px with the inline Convert form); at 1366×768 about one row is visible and the table's horizontal scrollbar is below the fold.
5. **SALES-UX-005** Add/Extension modals ignore Escape, let the page scroll behind them, and push Save/Cancel below the fold at 1366×768.

Working well (observed, keep):
- Sign-in with the waived test account: no OTP prompt, straight to the app.
- Create: native required-field validation, success toast, list count 300 → 301, record appears.
- Qualify toggle in the table refreshes the row and reveals *Convert to Requisition*.
- **Convert, double-clicked:** exactly 1 Requisition (`REQ-2026-1666`) and 1 PQ row (checked in the database); row then shows "Sudah di-convert".
- Kanban drag between columns persists (DB `opty_status_code` = `solutioning` after the drop).
- The table's full-screen mode fits 1366×768 with its scrollbar on screen.
- No page-level horizontal overflow on any Sales page at any viewport; Dashboard renders without errors.

**Preserve the current Sales architecture: yes.** Every defect below is interaction/layout, not workflow. No capability (List, Table, Grid, Kanban, search/filter/sort, qualification, conversion, PQ, Extension Request, CRM, RBAC) was removed.

## Journey Coverage

Viewports measured: 1920×1080, 1440×900, 1366×768, 390×844 (Opportunity Tracker, table and Kanban).

| Area | Interacted with |
| --- | --- |
| Navigation | login, Dashboard, Opportunity Tracker, PQ Tracker, Account (CRM), Profitability Tracker, sidebar active state, Back |
| Opportunity Tracker table | load, search, sort (Opty No), pagination, sticky columns, h/v scroll, full-screen mode, Table↔Grid, Edit link, status select, Sales Qualified toggle, Convert (inline form, double click), Delete (affordance only, not executed) |
| Grid | render (20 cards, 257 px each), Edit link, view switch |
| Kanban | render, 6 columns, horizontal/vertical scroll, header position, card click → Back, drag/drop + reload persistence, filter behaviour |
| Create | manual create (valid + empty), modal geometry, Escape, close via X, focus, page scroll behind |
| Extension Request | open, talent select (1 talent option), field count, required fields, close |
| Edit page | opened from Kanban card; Back link label |
| Dashboard / PQ / Account | load, KPI labels, charts, measure, screenshot |

**Not covered (stated honestly):**
- *Viewer/editor behaviour* — only `full` accounts exist; needs created viewer/editor accounts.
- *Create from Marketing Lead* — 0 leads exist in the pilot, the picker only offers "manual".
- *PQ documents / signature* — need a step-up session; not exercised.
- *Edit save/cancel round trip, drag to Win/Dropped by hand, keyboard drag, real touch devices.*
- Delete was not executed; a `UXAUDIT Synthetic Client` record (OPTY2026-812, converted, `REQ-2026-1666`) was created on purpose and is still in the pilot; remove it with the seed data at cut-off.

## Findings

### SALES-UX-001 · P1 · Kanban — horizontal scrollbar and columns unreachable
- **Repro:** 1366×768 → Sales → Opportunity Tracker → *Kanban*.
- **Expected:** all columns reachable without scrolling to the end of the page; headers stay visible.
- **Actual:** board `clientHeight` = `scrollHeight` = 11,234 px (every column stretched to its longest, 11,202 px); the board is the horizontal scroller, so its scrollbar is at y = 11,665. `scrollWidth` 1,648 vs `clientWidth` 1,044. Win starts at x = 1,393 and Dropped at 1,665 (viewport 1,366). Even at 1920×1080 Dropped is off-screen (sw 1,648 > cw 1,214). After scrolling 3,000 px the column headers are at y = −2,541 (not pinned). No page-level overflow; the page scrolls vertically, the board horizontally, nobody scrolls the columns.
- **Evidence:** `screenshots/02-kanban-top-1366.png`; probe output (table in the viewport matrix below).
- **Root cause:** `opportunity-kanban.tsx` — wrapper `overflow-x-auto p-4` with no height bound and stretching flex columns.
- **Fix (done in 850e77a, re-measured live — see Verification):** board is the single scroller for X (`overflow-x-auto overflow-y-hidden`, `h-[calc(100dvh-10rem)] min-h-[420px]`); each column is `flex flex-col h-full` with a pinned header and its own `overflow-y-auto` card list.

### SALES-UX-002 · P1 · Kanban/Navigation — opening a card destroys the working context
- **Repro:** Kanban → scroll page to 4,000 px and board to 400 px → click a card → browser Back.
- **Expected:** return to the same view, column and position.
- **Actual:** card is a link to `/sales/opportunity-tracker/<id>/edit` (there is no read-only view, so "click" means "edit"). After Back: **List** tab shown (not Kanban), `scrollY` 389 (was 4,000), board offset gone, any search/filter gone.
- **Root cause:** `tracker-view-tabs.tsx` keeps the tab in `useState`; filter state lives inside `OpportunityTrackersTable`; nothing restores scroll.
- **Fix (done):** view kept in the URL (`?view=kanban`, `replaceState`); Kanban stores board offset + per-column scroll in `sessionStorage` when a card link is clicked and restores it on mount.
- **Not done / product decision:** a read-only detail (drawer) so *click = inspect*, *Edit = edit*; keeping search/filter across List↔Kanban (see 007).

### SALES-UX-003 · P1 · Responsive — table unreadable on a phone
- **Repro:** 390×844 → Opportunity Tracker → table → scroll sideways.
- **Actual:** sticky columns total 668 px (190+130+130+218) inside a 324 px scroller (scroll area −344 px). Only *Aksi/Status* and *Opty No* are ever visible; Client, Positions, Price… cannot be reached. Pagination "Berikut" is clipped at the right edge.
- **Evidence:** `screenshots/12-mobile-table-scrolled-390.png`.
- **Root cause:** unconditional `sticky left-[190px]/[320px]/[450px]` in `opportunity-trackers-table.tsx` (same pattern in `opportunities-table.tsx` for PQ).
- **Fix (done):** stickiness only from `md:` up in both tables.
- **Not done:** at 1366 the sticky block is still 668 of 1,044 px (376 px scroll area); consider a narrower sticky set (Action + Opty No + Client) — needs a column-order decision.

### SALES-UX-004 · P1 · Table — action cell density, content starts below the fold
- **Actual:** the first cell stacks Edit | Hapus, a status badge, the status select (same word twice), *Sales Qualified* checkbox and Convert. Rows are 127–157 px; the inline Convert form makes a row 303 px in a 190 px cell. At 1366×768 the table scroller spans y 589–1,069, so ~179 px (one row) is visible and its horizontal scrollbar (y 1,069) is hidden; at 1440×900 also hidden; only at ≥1080 px tall is it on screen. Header + KPI cards + buttons + tabs take 589 px. Status and qualify change on a single click/toggle with no confirmation or error display (`opty-status-selector.tsx`).
- **Fix (done, partial):** editors no longer get the duplicate badge. 
- **Recommended next:** collapse chrome above the table (smaller KPI row or collapse on scroll), make the Convert form a popover/side sheet instead of growing the row, keep Delete away from Edit (it does use `confirm()`), surface status-change failure. Not done: needs product sign-off, no capability removed.

### SALES-UX-005 · P1 · Create/Extension modals (shared `AddRecordModal`, 23 usages)
- **Repro:** 1366×768 → *Tambah Opportunity Baru* → press Escape; wheel-scroll; look for Simpan.
- **Actual:** Escape does not close; the page behind scrolls (scrollY 0 → 389); Simpan/Batal are at y = 843 (> 768) inside a 653 px panel whose content is 850 px (not sticky); focus stays on the trigger button behind the overlay. Panel is translucent (`bg-white/85`) over a blurred page.
- **Root cause:** `components/add-record-modal.tsx` has click-outside and X only.
- **Fix (done):** Escape closes (not while saving), body scroll locked while open, focus moves to first field and returns to the trigger, sticky Save/Cancel footer, `role="dialog"`.

### SALES-UX-006 · P1 · Extension Request — re-keying data ERP already has
- **Actual:** 17 fields, 5 required. Picking the talent populates **0** of them; Client Name, Project Name, Service Type and Sales PIC stay empty and required.
- **Recommended:** on talent select, prefill from the talent's current contract/requisition (client, position, level, price) and Sales PIC from the session. Needs a data-contract check of which fields can be derived — not changed.

### SALES-UX-007 · P2 · View hierarchy — two stacked toggles, filters not shared
- **Actual:** `List | Kanban` (tabs) above a card with `Tabel | Grid`. Switching to Kanban ignores the search/status filter (301 cards shown with a query active) and returning to List clears it.
- **Recommended:** one view switcher (Table · Grid · Kanban) next to the search/filter, with filter state lifted above the views (URL params). Capability unchanged.

### SALES-UX-008 · P2 · Visual hierarchy
- *Google Sheet Sync* is the most prominent button in the header of both Opportunity Tracker and PQ Tracker, although Sheet sync is disabled in the pilot (ERP is sole write-owner) — the daily actions (Add Opportunity, Extension) are right-aligned below the KPI row.
- The floating *Celerates Agent* button (227×56) covers the bottom-right of every page, including table cells and pagination.
- Action buttons float right on their own row, detached from the view controls.
- **Recommended:** demote Sheet Sync to a secondary/overflow action while integration is disabled; put Add buttons in the header; give the FAB bottom padding or collapse it on tables.

### SALES-UX-009 · P2 · PQ Tracker labelling
- PQ Tracker's create button reads *Tambah Opportunity Baru* (same label as on Opportunity Tracker). Rename to what it creates.

### SALES-UX-010 · P2 · Dashboard / CRM clarity
- Dashboard card **Win = 1** is PQ-level; the Opportunity Tracker card **Sudah Win = 45**. Same word, different populations — label the source.
- **Account (CRM) shows 0 accounts** while 301 trackers and 15 seeded `SEED-` clients exist. Check whether CRM is expected to list tracker clients; if so this is a data-contract gap (not changed).

### SALES-UX-011 · P2 · Sidebar
- Under *Sales* three bordered, colour-coded items (*Client Active*, *Overtime & Business Trip*, *Profitability Tracker*) read as promos and sit beside Sales pages although *Overtime & Business Trip* is not a Sales page. Needs an owner decision on grouping.

### SALES-UX-012 · P2 · Naming/language consistency
- Same field is *Requirement Summary* in the add form and *Nama Project* on the edit page; mixed languages in one screen (*Tambah Opportunity Baru* / *Add Extension Request*, *Hapus* / *Edit*). 

## Viewport matrix (measured, before fixes)

| Viewport | Table scroller top–bottom | Table h-scrollbar on screen | Sticky px / scroll area | Kanban h-scrollbar y | Dropped visible w/o scroll |
| --- | --- | --- | --- | --- | --- |
| 1920×1080 | 589–1,069 | yes | 668 / 546 | 11,665 | no |
| 1440×900 | 589–1,069 | no | 668 / 450 | 11,665 | no |
| 1366×768 | 589–1,069 | no | 668 / 376 | 11,665 | no |
| 390×844 | 949–1,429 | no | 668 / −344 | 11,889 | no |

Page-level horizontal overflow: none at any size.

## Verification status of the fixes

`850e77a` was deployed to the pilot on 2026-10-07 (image `celerates-erp:wave1-850e77a`, no migration, health live/ready 200; rollback tag `celerates-erp:rollback-20261007T030551Z` = previous `f9abeb8`). Re-measured live with the same probes, signed in as `sales.test.ierp`:

| Check | Before | After |
| --- | --- | --- |
| Kanban height, 1366×768 | 11,234 px | 608 px |
| Kanban height, 390×844 | 11,234 px | 684 px |
| Kanban board bottom (h-scrollbar), 1366×768, board scrolled into view | y = 11,665 | y = 768 = inside the viewport |
| Column body (1366×768) | no inner scroll | scrolls on its own: 11,150 px content in a 524 px box |
| Column header after scrolling a column 1,500 px | y = −2,541 (after page scroll) | stays at y = 188 (board top 160) |
| Back after card click (board offset 300, column 800, Kanban view) | List tab, `scrollY` 389, offsets lost | `?view=kanban`, Kanban shown, offset 300, column 800 restored |
| Direct link `?view=kanban` | n/a | opens Kanban |
| Table row height | 149 px (127–157) | 119 px |
| Table first-cell position at 390 px | `sticky` (668 px pinned in 324 px) | `static` — all columns scroll |
| Modal, Escape | stayed open | closes; focus returns to the trigger button |
| Modal, focus on open | trigger button behind the overlay | first field (`lead_id`) |
| Modal, Save/Cancel at 1366×768 | y = 843 (off-screen) | bottom 693 (inside the 768 viewport, sticky footer) |
| Body scroll lock | none | `body.style.overflow = hidden` while open, restored on close |

Caveats, not hidden:
- The Kanban board's own top is still y = 431 at load, so its bottom (1,039) needs one page scroll (~270 px) before the scrollbar is on screen. After that scroll it is reachable; the horizontal scroller no longer sits 11,000 px away. Win and Dropped still need a horizontal scroll (board `scrollWidth` 1,648 vs 1,044).
- The table's own scrollbar is still below the fold at 1366×768 and 1440×900 (table top 589, bottom 1,069); only the row height and the mobile sticky issue changed. This stays open under SALES-UX-004.
- Body scroll lock was confirmed by the style value only; agent-browser's `scroll` command scrolls programmatically, so a real wheel/touch test is still needed.
- The 390 px table was verified by computed style (`static`), not by a fresh screenshot.
- Source guards: `tests/sales-ux.test.ts` (5 tests) pass; `tsc --noEmit` clean. They pin intent only.

### Batch 2 (`6586eb9`, deployed 2026-10-07, rollback tag `celerates-erp:rollback-20261007T044840Z` = batch 1)

Live checks at 1366×768 as `sales.test.ierp`:

| Check | Before | After |
| --- | --- | --- |
| SALES-UX-013 page header | `sticky`, 130 px pinned, covered buttons | `relative`, scrolls away |
| Add Extension / Add Opportunity | own row below KPI cards | in the page header; Sheet Sync is a quiet outlined button next to them |
| KPI cards top | y = 195 | y = 207 (header grew by the buttons) but the separate button row (~64 px) is gone |
| Table scroller | fixed 480 px, bottom y = 1,069 (off-screen) | `max(360px, 100dvh−12rem)` = 576 px; after one page scroll its bottom is y = 768 = scrollbar on screen, 4 rows visible |
| Convert to Requisition | inline form grew the row to 303 px in a 190 px cell | dialog (fields 5, top 221 / bottom 547 in a 768 viewport, focus on *Positions*, Escape closes); row stays 127 px |
| PQ Tracker | button *Tambah Opportunity Baru*, Sheet Sync primary | *Tambah PQ Baru* in the header, Sheet Sync secondary |
| FAB | covered the bottom-right content | content gets `md:pb-24` (96 px) so the last rows/pagination clear it |

Not done in batch 2: the table sticky block is still 668 px at 1366 (needs a column-order decision); other tables that share the `max-h-[480px]` pattern (TM, PMO, TA, Marketing, HR) were not changed; the Convert dialog's submit was not re-run after the move (the form body and action are unchanged; the earlier double-click test was on the inline form).

### SALES-UX-013 · P2 · Sticky page header takes vertical space (found while re-testing)
The page header is `position: sticky; top: 0` (about 130 px with the Sheet Sync button at 1366×768). It covers elements scrolled beneath it — agent-browser reported the Add and full-screen buttons as "covered by h1" after a page scroll. It is part of why content gets so little room at 768 px height. Recommended: make the header non-sticky on pages with data tables, or compact it.

## Recommended Execution Order

1. **Batch 1 (done and live-checked, see Verification):** 001, 002 (context part), 003, 004 (duplicate badge), 005.
2. **Batch 2 — table/page chrome:** 004 remainder (Convert as popover/sheet, shorter header block), 008 (Sheet Sync demotion, FAB padding), narrower sticky set.
3. **Batch 3 — one coherent view system:** 007 + 002 detail drawer (product decision on inspect vs edit).
4. **Batch 4 — data-contract:** 006 Extension prefill, 010 CRM account listing.
5. **Batch 5 — polish:** 009, 011, 012, 013, modal translucency.
6. **Needs real users/devices:** viewer/editor accounts, touch drag, iOS/Android, PQ documents/signature.
