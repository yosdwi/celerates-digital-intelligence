# Crisp upstream issues (draft, to file with the Crisp maintainers)

Found while building Sales V2 on `@crisp-ui-kit/crisp` 0.61.0 (unchanged in 0.61.2). Our local workarounds live in
`apps/erp/src/app/sales/v2/sales-v2.css`; remove each once Crisp ships the fix.

## 1. TableToolbar menus have no height limit

`.crisp-tabletoolbar-menu` (View settings / Kolom, and the field picker under Sort and Filter) has no `max-height`
and no scroll, unlike `Menu` (`.crisp-menu-content`, 360px). With ~20 columns on a 1366 × 768 laptop the View
settings list was 683px tall from y=162 (bottom 845) and the sort field picker 763px from y=208 (bottom 971): the
last items are off-screen and unreachable. If the page can scroll, scrolling moves the page while the fixed menu
stays, so the menu ends up over unrelated rows.

Expected: a leaf menu is capped to the space available below (or above) its trigger and scrolls inside; nested
pickers are not clipped by their parent.

Workaround: `.crisp-tabletoolbar-menu:not(:has(.crisp-tabletoolbar-menu)) { max-height: min(70dvh, 520px);
overflow-y: auto; overscroll-behavior: contain; }`.

## 2. Floating placement is computed once

`placeFloating` (Popover, Menu, TableToolbar's portaled menus) positions on open only: no update on scroll or
resize, no size constraint against the viewport, a fixed 280px flip threshold. Expected (as Floating UI's
`autoUpdate` + `flip` + `shift` + `size`, or Zag's popper, which Crisp already uses for Dialog): follow the
trigger, flip or shift to stay on-screen, cap the height to the available space.

Workaround: Sales V2 pages never scroll at the page level (only their table, grid or board), so a trigger cannot
move while its menu is open.

## 3. Popover elevation on dense surfaces

`--crisp-ring-popover` is transparent and the popover shadow faint; over a white, dense table a menu reads as part
of the table. Not a bug (tokens are the theming path): we set a visible ring and a stronger shadow in our tokens.

## 4. Board scrolls each column on its own; no whole-board scroll

`Board` gives each `.crisp-board-col-body` its own `overflow-y: auto` (and the column `max-height: 100%`). Jira-style
boards scroll the whole board as one, with column headers pinned. There is no prop for it. **Ask:** a
`scroll="column" | "board"` option (board: the row scrolls both ways, columns grow and share the tallest one's
height, headers `position: sticky`). **Our workaround:** `apps/erp/src/app/sales/v2/sales-v2.css` (search
"Kanban scrolls as one board").

## 5. `onPreviewCard` makes most of a card undraggable

With `onPreviewCard`, the card's content is wrapped in `.crisp-board-card-titlerow` with
`onPointerDown={(e) => e.stopPropagation()}`, so a drag can only start on the card's padding. **Expected:** only the
action buttons stop propagation; the content still drags past the 4px threshold. **Our workaround:** we don't pass
`onPreviewCard`; the card's own content opens the record on click.

## 6. TableToolbar: no way to hide or take over the Filter trigger

`showSort` and `showViewSettings` exist, but not `showFilter` (or an `onFilterTriggerClick`). Our table filters from
each column header, as in Google Sheets, and the toolbar's Filter only shows or hides those header icons. **Ask:**
`showFilter?: boolean` and/or `onFilterTriggerClick?: () => void` plus `filterTriggerPressed?: boolean`. **Our
workaround:** a capturing click handler around the toolbar in `record-workspace.tsx` (search "Table filter as in
Google Sheets").
