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
Opportunity Tracker
subtitle
Summary cards (StatCard × 5, one row, clickable: each applies its built-in view)
[Saved view ▾] [Tabel|Grid|Kanban] [search]  Sort  Filter  Kolom  · count     Versi lama · Sheet Sync · [+ New ▾]
┌ bounded workspace (fills the rest of the viewport; scrolls inside, never the document) ┐
```

- One primary action (New ▾), at the end of the toolbar after Sheet Sync (Attio: Import / Export · + New). Sheet
  Sync opens a dialog with V1's connect / mapping / sync parts (it states that integrations are off on the pilot).
  "Versi lama" links the V1 page. Read-only users see neither New nor Sheet Sync.
- On desktop the page does not scroll; the table, board and grid scroll inside the workspace, which reaches the
  bottom edge (no reserved strip). The Agent launcher floats over the corner; the scroll areas end with 64px of room
  so the last row or card can be scrolled clear of it. Kanban columns share the width (min 268px).

## 7. Views and state

- One selector: Tabel · Grid · Kanban. All three show the same filtered, searched, sorted records.
- URL is the state: `?view=table|grid|kanban&q=…&filter=<json>&sort=key:dir&record=<id>&sv=<saved view>`.
  View change and saved-view change push history (Back undoes them); typing, filter, sort and the open record replace
  the current entry, so Back leaves the page instead of replaying every keystroke.
  Leaving to the full edit page and coming back restores the same state.
- Every column is shown by default, as in V1 and Attio, with Client pinned on the left (`stickyFirst`). Visibility
  and order are a per-browser preference (localStorage `celerates.salesV2.columns.v2`) and part of a saved view.
- Saved views: built-in operational views (Semua, Pipeline aktif, Siap Convert, Win, Dropped) plus personal views
  kept in this browser. Server-side shared views are out of scope until a product decision.

## 8. Read first, mutate explicitly

- Click on a row, grid card or Kanban card opens the `RecordPanel` preview. It never means Edit.
- Mutations are explicit buttons in the panel: Change stage, Sales Qualified, Convert to Requisition, Edit (a dialog
  with the V1 edit page's 19 fields and action; "Halaman penuh" still opens the V1 page), Delete (full access only).
  Kanban drag still changes stage for editors (same action as V1); see §12 for Undo and the Win/Dropped confirm.
- The panel shows highlights, the record's progress, Requisition / TA fulfilment, PQ, signature status and document
  counts, with links to the pages that own them (documents stay behind their existing step-up checks).

## 9. Right rail (RecordPanel and Celerates Agent never overlap)

- `lib/right-rail.ts` is a tiny shared store: the width the record panel currently occupies, whether the Agent is
  open, and the selected record (kept for future Agent context).
- While a record panel is open it owns the right edge: the floating Agent launcher is hidden and the panel header
  offers "Tanya Agent", which opens the Agent with the record in the composer and in the context chip. Closing the
  panel brings the launcher back. No z-index escalation.
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

- Font: Inter (SIL OFL), self-hosted with `@fontsource-variable/inter`. Since 2026-10-07 it is the one ERP font
  (`globals.css --font-sans`, replacing the system stack and Plus Jakarta Sans); Crisp reads it via `--crisp-font-sans`.
- Brand: Crisp's cyan brand tokens map to the ERP's: navy `#194667` for primary actions, checkboxes and selection,
  accent `#2356e8` for links, soft brand text and focus rings. Attio's own
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
- Kanban moves: an ordinary move saves at once with a Snackbar "Batalkan" (7s). Win and Dropped ask first and the
  card stays put until confirmed: Dropped takes the optional Dropped Reason (saved with the move through V1's edit
  action, every other field unchanged); Win offers "Pindahkan & Convert" when the record is Sales Qualified and not yet
  converted. (The panel's Stage select stays immediate.)
- Edit is a dialog (same close rules and drafts as Create, kept per record for the session).
- Celerates Agent (all modules): Perlu perhatian starts folded; an empty conversation leads with "Ada masukan atau
  kebutuhan fitur?" and a voice button; chips above the composer (Laporkan kendala, Usulkan fitur, Apa yang perlu
  aku perhatikan hari ini?) fill the composer rather than send; placeholder "Bisa ceritakan masukan Anda?". The
  context chip resolves `/sales/v2/<page>` as `/sales/<page>`.
- Celerates Agent "/" commands (assistant-ui slash commands, unstable API, version pinned): /masukan, /fitur,
  /kendala (fill the composer with the page as context), /formulir, /perhatian, /jelaskan (record or entity),
  /bicara, /lampirkan, /baru (new conversation).
- Sidebar (all modules): sub-pages are icon rows; optional group headings (Sales: Pipeline); pages owned by another
  division are listed last under "Bersama divisi lain" with a small shared icon instead of coloured boxes. Sales ›
  Opportunity Tracker opens V2; the V1 page resolves to the same entry.
- Celerates Agent (all modules): first visit shows a short invitation above the launcher (Bicara sekarang, ask or
  feedback, formulir masukan), once per browser. Explanatory boilerplate is removed from the drawer.

## 13. Backlog

- Inline field editing, Attio-style (decided 2026-10-07, after the Edit dialog). In Attio the record panel / page
  lists every attribute, not only the table's columns, and each value is edited in place (click, change, saved).
  So a field hidden from the table (e.g. Dropped Reason) is still edited inline from the panel; table cells are
  inline-editable only for visible columns. Needs a per-field V1-compatible save (today only stage and Sales
  Qualified have one; the rest go through the whole-form update) and per-field validation for required fields.


## 14. PQ Tracker V2 (2026-10-07)

- Route `/sales/v2/pq-tracker`; Sales › PQ Tracker opens it, V1 stays at `/sales` (and `/sales/[id]/edit`), linked as
  "Versi lama" beside the title. Sidebar entries carry their V1 path (`SubPage.v1`) so V1 pages keep the same entry.
- One shared workspace for every V2 page (`features/sales-v2/record-workspace.tsx`): URL state, summary cards,
  saved views, Excel-style headers, Tabel · Grid · Kanban, Undo / confirm on board moves, the record-panel rail
  wiring and "Tanya Agent". A page is a `WorkspaceConfig` plus its panel, dialogs and toolbar actions. Opportunity
  Tracker now runs on it too; Account (CRM) and Dashboard follow on the same kit.
- Data and actions are V1's: the page reads what `app/sales/page.tsx` reads (PO / PQ documents with signed URLs,
  PQ signature, Lead Source) plus the PMO Document Tracker row; mutations are `createOpportunity`,
  `updateOpportunity` (now with the optional `return_to`), `updatePipelineStage` + `updateOptyStatus` (V1's
  StageSelector rule: Win → Project Won, Drop → Closed Lost, Hold → Project on Hold), `sendPqForSignature`,
  `deleteOpportunity` (Full access only), `deleteOpportunityAttachment`. V1 constants moved, unchanged, to
  `app/sales/pq-constants.ts` so V1 and V2 read the same lists.
- Summary cards: Total PQ, On Going, Perlu Generate PQ, Win, Drop. All 26 V1 columns by default, Client pinned.
- Kanban by Pipeline Stage (On Going, Hold, Win, Drop). Hold / On Going save with Undo (stage and Opty Status put
  back); Win and Drop ask first and say what follows (Opty Status; Win notifies TM).
- Panel: highlights, Notes, Dokumen PQ, Tanda tangan PQ, PO Doc, Dokumen Legal Project (PMO), source Opportunity;
  footer: Pipeline Stage and Opty Status selects, Kirim untuk TTD (dialog: PQ document + signer), Edit, Halaman
  penuh, Hapus. Edit is V1's full form in a dialog, the PMO document fields included (V1's update writes them all).

## 15. Density on laptops (QA 2026-10-07)

A 1366 or 1920 laptop at 125–150 % OS scaling gives the browser about 1280 × 650 CSS px. Like Attio, V2 keeps fixed
compact sizes and never uses zoom or scaling: sidebar 240px with 28–32px rows and a 28px logo; page title 16px and a
12px subtitle (hidden below 760px of height); summary cards 18px numbers; toolbar on one line at 1280 (Sheet Sync
shows its label from `xl`); Agent launcher 40px. The page fills the height and the table scrolls inside it.

Laptop tier (all modules): between 768 and 1599 CSS px wide the root font size is 14px (`globals.css`), so every
rem-based size steps down 12.5 %, and Crisp's px tokens step down with it (`sales-v2.css`: text 10.5–15px, table
rows 32px, header 36px, spacing × 0.875). Font sizes are written in rem (`text-[0.8125rem]`, not `text-[13px]`) so
they follow. 1600px and wider (the 1920 monitor reference) and phones are unchanged. Still no zoom or transform.

## 16. Account (CRM) V2 (2026-10-08)

- Route `/sales/v2/accounts`; Sales › Account (CRM) and Marketing › Account (CRM) open it, V1 stays at
  `/sales/accounts` and `/sales/accounts/[id]` ("Versi lama", "Halaman penuh"). Same route gate as V1: Sales or
  Marketing may open it; V1's CRM actions need Sales Editor (delete: Sales Full), so only those see the controls.
- Data is V1's: `crm_clients` with contacts and activities, V1's stats (`getAccountStatsMap`) and Account 360 history
  (`getAccountHistoryMap`, the many-accounts form of `getAccountHistory`, same matching by client name).
- Summary cards: Total Account, Perlu Follow-up (Prospect, V1's card), Active, Dormant, Ada Opportunity Aktif,
  Invoice Overdue. V1's Total Nilai Kontrak is a sum, shown beside the title. Kanban by status (Prospect, Active,
  Dormant): moves save at once with Undo (`updateClient`, the other fields posted unchanged).
- Panel: V1 Account 360 (stats as highlights, activity timeline, contacts, Notes, Leads, Opportunity (PQ) linked to
  PQ Tracker V2, Kontrak, Invoice); footer: Status select, Catat aktivitas, Edit, Halaman penuh, Hapus. Contacts and
  activities are added and deleted from the panel with V1's fields (`createContact`, `createActivity`, …).
- New V2 controls for V1 actions V1 never showed: Edit account (`updateClient`) and Hapus (`deleteClient`).
- Fix in V1's `deleteContact`: activities logged with the contact keep their history without it (the foreign key
  refused the delete before).

## 17. QA round 2026-10-08 (laptop, V1 parity)

Decided with the Product Owner before any change (feedback doc "Feedback UI UX"):

- Sidebar keeps its scroll; the scrollbar is a 6px rounded thumb, no track, shown on hover, with a 16px fade at an edge
  that has items past it (`.sidebar-scroll`, globals.css).
- Agent drawer: about 26 % of the window (320–420px) instead of a fixed 400px; the left edge drags (and arrow keys)
  to 300–560px, at most 45 % of the window, kept per browser. The page beside it narrows with it.
- Colours as V1: summary cards in V1's gradients (components/stat-card.tsx `GRADIENTS`), table header V1's violet
  row, the active Tabel · Grid · Kanban tile V1's violet gradient. Primary actions stay ERP navy (V1 does too).
- Frozen columns as V1, slim (revised the same day after QA: a stacked Aksi column made every row ~90px): Opportunity
  Tracker Opty No, Leads No, Klien (~370px); PQ Tracker Opty No, PQ No, Dok. PQ as a file count (~300px). Crisp pins
  one column and windows the others, so they render as one pinned block, each part one line with its own header menu
  (a longer value ends in "…", whole on hover and in the panel). Rows stay 32px.
- Interaction model (decided 2026-10-08, option B "Attio + summary panel"): the table is where work happens. A click
  selects a cell; double-click or Enter edits it with Crisp's editors (select, date, number, text, checkbox), and
  Crisp's cell menu works (Copy, Paste, Clear value, View edit history) plus the record's actions (Buka, Edit form,
  Convert / Kirim untuk TTD / Catat aktivitas, Hapus). A cell saves one field through the V1 edit action without its
  redirect (`saveOpportunityTracker`, `saveOpportunity`; `update…` = save + redirect) or the field's own V1 action
  (stage, Sales Qualified, Opty Status, `updateClient`). Required fields refuse an empty value. The record's name,
  Buka and a Kanban / Grid card open the panel, now a summary: key fields edited in place, long text, downstream
  records, edit history, Tanya Agent; its footer has buttons only and a ⋯ menu (Halaman penuh, Hapus).
- Edit history: table `record_field_changes` (migration 0014; record type, id, field, old, new, who, when; no foreign
  keys). Every Sales update action writes through `updateWithHistory` (lib/field-history.ts), PMO document fields
  included, whichever screen made the edit; recorded from 2026-10-08 on. Read through `getFieldHistory` (Sales
  viewer; Account also Marketing viewer).
  Three ways in (Crisp ActivityFeed): a cell's "View edit history" (that field); the panel's Aktivitas, the record
  timeline as in Attio (OT Progress Notes / PQ Notes pinned on top, then each save grouped as one entry; Account mixes
  in its logged calls, emails, meetings and notes by date; the latest ten, then "Tampilkan … lainnya"); and the
  toolbar's Riwayat drawer, every change in the module filtered by person, field and time (7 days by default), one
  record when opened from the panel's "Riwayat lengkap", a record name opening that record (`getModuleHistory`, same
  guard). No changed-cell marker in the table: noise in a dense grid.
- Form dialogs: the <form> is the dialog card's flex column, so Crisp's body scrolls and Batal / Simpan stay in view;
  before, a long form clipped them on short laptop screens (Crisp caps a dialog at 74vh).
- Kanban: no per-column "+" (New is in the toolbar). A column header opens sort, a filter (the table's controls) for
  that column's cards, and Hide; this lasts for the visit.
- Google Sheet Sync (OT and PQ) is on, both ways like V1, through a Google service account
  (`GOOGLE_SERVICE_ACCOUNT_JSON`, JSON or base64, server env): share the sheet with its email as Editor. Every sync
  action needs Sales Editor (`requireSalesSheetSync`); before, they only checked for a session. Other modules' sheet
  sync stays off (`integrationDisabled`).
