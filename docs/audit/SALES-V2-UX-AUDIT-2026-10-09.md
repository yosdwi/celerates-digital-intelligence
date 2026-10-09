# Sales V2 UX audit against Attio and Frappe CRM (2026-10-09)

Method:
- Pilot at https://ierp.celeratesapps.com, signed in as the Sales test account.
- 1440×900 laptop viewport, captured with agent-browser.
- 11 screenshots, kept locally and not committed.
- Attio and Frappe CRM come from their public documentation. Attio's marketing pages show animations, not the product,
  so no Attio screenshot is used here.

Status: findings and proposals; nothing changed yet.

## 1. What the references do

| | Attio | Frappe CRM | Celerates Sales V2 today |
|---|---|---|---|
| List views | Table and board, neutral surfaces; colour only on status tags | List and Kanban | Table, grid and Kanban, plus five saturated gradient KPI cards above every list |
| Record preview | Side panel with "Highlights" (the record's key attributes) **plus recent activity and tasks**; arrow keys move to the next record | — | Side panel with Ringkasan, Aktivitas and collapsible sections; **no email** |
| Record page | Default tab **Overview**: "a summary of recent activity, including emails, tasks, meetings, notes, and files in one place". Then Activity, Emails, Files, Notes. Attributes in a left sidebar. | Tabs **Activity** (everything, emails included) and **Emails**; Reply at the bottom of the thread | Default tab **Perjalanan** (Deal 360); email is the second tab; details in a wide left column |
| Email | On the record (Overview, Activity, Emails). No team inbox. | On the record. No global inbox. | Deal 360 → Email tab, or Account panel → Email section. No inbox. |
| Speed | Built for a native-app feel: local data, background sync, virtualized lists | Server pages | Every navigation waits for the server; no loading state (0 `loading.tsx`) |
| Keyboard | `Ctrl/Cmd+K` command menu; arrows in preview | — | Up/down buttons in the panel; no command menu |

Sources:
- attio.com/help: "Create and view records", "Understanding records", "Configure record pages".
- docs.frappe.io/crm: "Email Communication", "Deal".

Neither reference has a full email inbox. Both make email **visible without searching for it**: on the record's
first screen, or in the activity timeline.

## 2. Findings

### A. Clicks to the information that matters

| Task | Clicks today | Attio-like target |
|---|---|---|
| Read the client's latest email on an opportunity | Row → panel (no email) → ↗ full page → Email tab: **3 clicks and a page load** | **1**: the panel shows the latest emails |
| Reply to it | The 3 clicks above, then thread → Reply: **5** | **2**: panel → Reply |
| See every client email that arrived today | **Not possible**: email only exists per account or per opportunity | 1: a Sales inbox list |
| Know what to do next on a deal | Full page → Perjalanan → "Perlu tindakan" | Panel header: next action |

### B. Layout and spacing

1. **Five gradient KPI cards on every list:**
   - They take about 70 px. With the title and the toolbar, about **165 px (18 %) of a laptop screen comes before the
     first row**.
   - Their saturated colours compete with the status tags, which are the colour that carries meaning. Attio puts no
     stat cards on lists.
2. **Floating elements cover content:**
   - The "Celerates Agent" pill sits over the last table row (the Sales PIC column).
   - The pilot feedback popover covers half a dashboard card.
3. **Deal 360 page:** the left detail column takes about 45 % of the width and is mostly empty below the details.
   The right side starts with the journey, not with what happened recently.
4. **Kanban at 1440 px:** six columns of about 275 px, so Win and Dropped are off-screen. This is fine as a board,
   but the board needs horizontal scrolling for the outcome columns.
5. **Two visual languages:**
   - The Sales Dashboard is still V1: a large "SALES / Dashboard" header, big gradient cards and decorative charts.
   - The V2 workspaces are dense Crisp tables.
6. **Table:** density and stage tags are good. Long client names are cut at about 24 characters, and the header row
   is tinted and carries an icon on every column, which adds visual noise.

### C. Enterprise polish

1. **Loading:**
   - Moving between Sales pages took **about 0.3–0.7 s** (measured with the browser tool, including its own
     overhead). During that time the old page stays frozen with no feedback.
   - There is no skeleton for the panel, Deal 360 or the tables, and no `loading.tsx` anywhere.
   - The rules are already written in `docs/design/FRONTEND-LOADING-ARCHITECTURE.md` (phases 1–2), but not built.
2. **Motion:** the panel and dialogs open without a consistent transition, and nothing shows that a page is changing.
3. **Keyboard:** there is no command menu, and the panel can't be navigated with the keyboard.

## 3. Proposals (for decision)

1. **Email in view:**
   - **Panel:** show the 3 latest emails (sender, subject, first line, time), each with Reply, and "Lihat semua".
   - **Deal 360 Overview tab, as the default:** next action, latest emails, latest activity, and the journey on one line.
   - **"Inbox Sales" page:** every matched client email, newest first, filters for Account, Sales PIC and unanswered,
     a preview panel with Reply, and a link to the account and opportunity. Neither Attio nor Frappe has this; it
     fits our single shared mailbox.
2. **Calmer lists:**
   - Replace the gradient KPI cards with one compact neutral summary bar (count, label and a coloured dot; still
     clickable as a filter).
   - Put the title and subtitle on one line.
   - Dock the Agent button in the header or the side rail instead of floating it over content.
3. **Loading and motion** (FRONTEND-LOADING-ARCHITECTURE phases 1–2):
   - A skeleton in the page's real shape for each Sales route.
   - A pending state on the clicked menu link.
   - Back is instant (`staleTimes`).
   - A skeleton inside the panel and the Deal 360 tabs.
   - One short slide or fade for panels and dialogs.
4. **Deal 360 layout:** a narrower details column (attributes as in Attio's sidebar) and a wider activity side.
5. **Sales Dashboard V2:**
   - In the same visual language as the workspaces.
   - Built around pipeline insight: deals to follow up, weighted forecast, Win and Drop.
6. **Keyboard:** `Ctrl/Cmd+K` to search records and run actions; ↑/↓ in the panel.

## 4. Design foundation: element by element (added after the Product Owner's Attio screenshots)

The Product Owner's question is about the foundation (surfaces, type, spacing, panels, how things appear), not one
feature.

Measured on the pilot (OT table with the panel open, 1440×900). The Attio values are estimated from the screenshots
the Product Owner shared. The Crisp defaults come from `@crisp-ui-kit/crisp` `tokens.css`; Crisp's source says its
components were "measured live on app.attio.com".

| Element | Attio (screenshot) | Crisp default | Celerates Sales V2 today | Where ours comes from |
|---|---|---|---|---|
| App shell | Light sidebar (same family as the page, hairline divider, ~260 px); Quick Actions ⌘K and search at its top; Favorites and Records groups | `AppShell` + `Sidebar`: light, 275 px, floats below 865 px | **Dark navy sidebar** (210 px) listing all 14 ERP modules, with Sales as a sub-tree | ERP's own `components/sidebar.tsx`, not Crisp |
| Page header | One 48 px bar: icon + page name, actions on the right (Share, Ask Attio) | `HeaderBar`, 48 px | Title + subtitle; language flags, bell and avatar float at the top right | ERP header widgets plus V2 workspace header |
| Above the list | View selector ("Top companies ▾"), then one line of sort and filter chips. **No stat cards.** | `ListPage`, `StatList` (quiet numbers) | **Five saturated gradient KPI cards** (63 px, ring and glow) | `sales-v2.css` "V1 gradients" (QA 2026-10-08) |
| Table header | Sentence case, about 14 px, dark grey, a small grey icon per column, white background | Sentence case, neutral, 40 px | **9.6 px UPPERCASE violet `#6d28d9` on lavender `#f5f3ff`**, 36 px | `sales-v2.css` "V1's violet header row" (QA 2026-10-08) |
| Rows | About 38 px, 14 px text, hairline column dividers, a checkbox column | 36 px, 13 px | 32 px, 13 px | Laptop density override (`sales-v2.css`: text 12/13 px, row 32 px below 1600 px) |
| Status | Dot + text ("● Strong"); tags as light outlined pills | Tag palette | Filled pastel chips (red, green, violet…) | Crisp tags, used for every status |
| Colour | Almost monochrome; colour only in logos, status dots and the primary button | Neutral, one brand accent | Navy primary, **violet** view toggle and header, **gradient** cards, tinted Kanban columns, **pink/violet** login | Mixed V1 palettes |
| Footer | Count + "Add calculation" per column | `ColumnCalc` | "307 dari 307" in the toolbar | — |
| Record preview | Peek panel over the list: toolbar (close, ↑ ↓, counter, open), identity, Highlights grid, Activity, sections | `RecordPanel` (the same, measured from Attio) | `RecordPanel`, matching Attio | Already Crisp |
| Assistant | "Ask Attio" button in the header bar opens a full page or panel | — | Floating "Celerates Agent" pill over the content | ERP `AgentPanel` |
| Dialogs | Plain white, light shadow | Crisp `Dialog` | Brand header band, blurred and darkened backdrop | `sales-v2.css` |
| Loading and motion | Instant feel (local data) | — | No skeletons, no route loading, about 0.3–0.7 s frozen per navigation | Section 2C |

**Cause:** the kit we already use *is* the Attio foundation. The difference comes from three layers on top of it:
1. **The ERP shell:** dark sidebar and floating header widgets, which are not Crisp.
2. **The V1 look restored in `sales-v2.css` at the QA of 2026-10-08:** violet header, gradient cards, violet toggle,
   tinted Kanban and branded dialogs. This was done because the Product Owner then asked for the Celerates theme and
   the V1 look.
3. **A laptop density override** that makes text and rows smaller than Attio.

**Options:**
- **A. Attio-clean with a Celerates accent (recommended).**
  - Drop the V1 visual layer and use Crisp's defaults.
  - Navy `#194667` becomes the only accent: primary buttons, active states and focus.
  - The status colours stay, as dot + text or soft tags.
  - Stat cards become one quiet `StatList` row.
  - Keep Crisp's default density (13/14 px, 36 px rows).
- **B. Hybrid.** Neutral table header and density as in A, but keep the KPI cards (smaller) and the coloured Kanban.
- **C. Keep the current look**; fix only the overlaps and the loading.

**Shell (all modules, since the sidebar is global):**
- Move to Crisp `AppShell` + `Sidebar` + `HeaderBar`: a light sidebar with ⌘K search on top, modules as groups, a
  48 px header bar, and the Agent as a header button.
- Or keep the dark sidebar and change only the page area.
