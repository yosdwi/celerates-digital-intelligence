# Sales V2: Crisp UX contract

**Status:** locked for implementation, 2026-10-07. This file records the decisions later work must not reinterpret.
It is a product/UX contract, not an architecture redesign. Background: `docs/audit/SALES-UX-INTERACTION-AUDIT.md`.

## 1. Formula

Existing Celerates Sales (business baseline) + `@crisp-ui-kit/crisp` (component foundation) = Sales V2.
Attio is the interaction reference only. Celerates owns the domain model and its words.

## 2. Isolation

- V2 lives at `/sales/v2/...` (route `apps/erp/src/app/sales/v2/`) with feature code in `apps/erp/src/features/sales-v2/`.
  It sits under `/sales` on purpose: the existing route gate (`lib/route-access.ts`, division `sales`) and the
  division path map cover it with no new rule, so a new route cannot be opened by someone without Sales access.
- V1 pages stay as they are and remain the capability reference until V2 parity is approved.
- No new tables, no `opportunity_v2`, no copy of a business rule. V2 calls the existing server actions:
  `createOpportunityTracker`, `createExtensionRequestFromSales`, `updateOptyStatus`, `updateSalesQualified`,
  `convertToRequisition`, `deleteOpportunityTracker`, and the existing full edit page.
- The only V1 changes allowed for V2: an optional, validated `return_to` (Sales paths only) on actions that redirect,
  and the shared right-rail offset for the Celerates Agent (section 8).

## 3. Components (use Crisp; do not imitate it)

| Need | Crisp component |
| --- | --- |
| Table | `DataTable` (column menu, resize, reorder, sort, sticky first column, internal scroll) |
| Search / filter / sort / column visibility | `TableToolbar` (+ `applyFilters` / `applySorts`) and a Crisp `Input` for search |
| View selector | one `ViewToggle`: Tabel · Grid · Kanban |
| Saved operational views | `SavedViews` |
| Kanban | `Board` |
| Grid cards | `EntityCard` |
| Record inspection | `RecordPanel` |
| Create / Extension / Convert / confirm | `Dialog`, `DialogBody`, `DialogFooter` |
| Form controls | `Input`, `Select`, `Textarea`, `Checkbox`, `FormField`; Celerates `MoneyInput` stays (Rupiah grouping is domain behaviour) |
| Metrics | `StatCard` |
| Create menu | `Menu` + `MenuItem` |

Crisp styles load only from the V2 layout (`styles.layered.css`, namespaced `crisp-*` classes and `--crisp-*` tokens).
Crisp `base.css` is not imported (it would restyle every V1 page).

## 4. Terminology (kept exactly)

Opty No, Leads No, Client, Client Type, Service Type, Positions, Level, Headcount, Sales Qualified, Requirement,
Detail Requirement, Closing Price Deal, Price / Price Period, Sales PIC, Last Communication, BANTE, Progress Notes,
Dropped Reason, Requisition, PQ, Extension Request, Talent Acquisition. Stages: CV Submission, Solutioning,
Proposal Sent, Need Action, Win, Dropped. No generic CRM renames ("Deal", "Company", "Owner").

## 5. Density (1366 × 768 at 100% zoom is the acceptance viewport)

Gutters 20–24 px; primary gaps 16–20 px; controls 32–36 px; table rows about 40–44 px; body text 13–14 px;
labels 11–12 px; radii 6–10 px; shadow only where hierarchy needs it. No browser zoom assumptions, no CSS `zoom`,
no `transform: scale`, no global shrinking, no tiny fonts. No `px-8 py-8`/`space-y-8` habits, no gradient cards.

## 6. Page structure

```
Opportunity Tracker                                   [+ New ▾]   ← New Opportunity / Extension Request
subtitle
Summary cards (StatCard × 5, one row, clickable: each applies its built-in view)
[Saved view ▾] [Tabel|Grid|Kanban] [search]  Sort  Filter  View settings   ·  count  · Google Sheet Sync
┌ bounded workspace (fills the rest of the viewport; scrolls inside, never the document) ┐
```

- One primary action (New ▾). Sheet Sync, view settings and other dataset utilities live in the toolbar, never in
  the headline. Read-only users see no New control.
- On desktop the page does not scroll; the table, board and grid scroll inside the workspace. The Agent launcher
  keeps its reserved strip below the workspace (AppShell `md:pb-24`).

## 7. Views and state

- One selector: Tabel · Grid · Kanban. All three show the same filtered, searched, sorted records.
- URL is the state: `?view=table|grid|kanban&q=…&filter=<json>&sort=key:dir&record=<id>&sv=<saved view>`.
  View change and saved-view change push history (Back undoes them); typing, filter, sort and the open record replace
  the current entry, so Back leaves the page instead of replaying every keystroke.
  Leaving to the full edit page and coming back restores the same state.
- Column visibility and order are a per-browser preference (localStorage) and part of a saved view.
- Saved views: built-in operational views (Semua, Pipeline aktif, Siap Convert, Win, Dropped) plus personal views
  kept in this browser. Server-side shared views are out of scope until a product decision.

## 8. Read first, mutate explicitly

- Click on a row, grid card or Kanban card opens the `RecordPanel` preview. It never means Edit.
- Mutations are explicit buttons in the panel: Change stage, Sales Qualified, Convert to Requisition, Edit (full
  page), Delete (full access only). Kanban drag still changes stage for editors (same action as V1).
- The panel shows highlights, the record's progress, Requisition / TA fulfilment, PQ, signature status and document
  counts, with links to the pages that own them (documents stay behind their existing step-up checks).

## 9. Right rail (RecordPanel and Celerates Agent never overlap)

- `lib/right-rail.ts` is a tiny shared store: the width the record panel currently occupies, whether the Agent is
  open, and the selected record (kept for future Agent context).
- While the panel is open the Agent launcher moves left of it by that width. No z-index escalation.
- The Agent is a docked right drawer, full height (Railway-style). On screens ≥ 1024px it sets `--agent-rail` and
  the app shell narrows by that width (`lg:mr-[var(--agent-rail)]`); the fixed top-right controls move left by the
  same amount. The page is never covered, so the record panel stays open beside the Agent. Below 1024px the drawer
  overlays (full screen on phones), as before.

## 10. Forms

Create Opportunity and Extension Request keep every current field, name, required flag and server action; only the
presentation moves to Crisp `Dialog`. Required-field semantics and business rules do not change in V2. Form
ergonomics are improved later, separately, after parity is proven.

## 11. Ready means

V2 is not "complete" until the V1 capability list (search, filters, sort, table, grid, kanban, drag status, create,
Marketing Lead source, edit, Sales Qualified, Convert, Extension Request, PQ visibility, documents, signature,
RBAC viewer/editor/full, Sheet Sync access, traceability) is verified and the 1366 × 768 journey has been run live.

## 12. Visual layer (QA round 1, 2026-10-07)

Attio is the reference; Crisp already carries its measured geometry and tokens. What V2 adds on top is in
`app/sales/v2/sales-v2.css` (scoped to V2 markup and Crisp classes) and nowhere else.

- Font: Inter (SIL OFL), self-hosted with `@fontsource-variable/inter` and set as `--crisp-font-sans`. Attio's own
  Tiempos (commercial) and its icon set (proprietary) are not used; icons are lucide (ISC), 14–16px.
- Colour is reserved for meaning: the summary cards (ERP palette: navy total, blue active pipeline, ember ready to
  convert, green win, red dropped; soft ground, bold number, 3px edge, no gradients) and stage colour. The rest stays
  neutral like Attio.
- Table header: brand tint `#eef3f7`, 12px semibold, an icon per field. Header alignment follows its values (centre
  for short codes, counts and dates; right for money; left for text). Widths start from the longest value
  (80–320px) and stay resizable.
- Excel-style header menu (header-filter.tsx): sort, the column's own filter (value checklist with search and counts,
  Qualified/Belum, number or date range, or "contains") and Hide. Header filters are ordinary toolbar filters with ids
  `h:<key>`: they show as toolbar chips, live in the URL and apply to Grid and Kanban.
- Kanban: columns tinted with the stage colour, cards with a visible edge and the stage on the left. Card: Client
  (bold), Opty No · Leads No, Positions · Level · HC, Price (bold), Sales PIC initials, REQ/PQ badge and Last
  Communication age (red after 14 days). Each column has "+ Opportunity baru" with that stage preset (V1's create
  action already accepts `opty_status_code`).
- Create dialogs: backdrop dimmed and blurred, brand header. They close only from ×, Batal or Simpan; Escape and a
  click outside are ignored. What was typed is kept as a draft until Simpan succeeds or "Kosongkan form".
- Celerates Agent (all modules): first visit shows a short invitation above the launcher (Bicara sekarang, ask or
  feedback, formulir masukan), once per browser. Explanatory boilerplate is removed from the drawer.
