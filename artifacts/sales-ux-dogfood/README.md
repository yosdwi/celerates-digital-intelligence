# Sales UX dogfood evidence

- `screenshots/` — local only (not committed): `01`–`15` taken on 2026-10-07 against the pilot, before the fixes.
- `measure.js` — lists every scroll container on the page (page vs board vs table) with client/scroll sizes.
- `viewport-probe.js` — table/Kanban geometry: container top/bottom vs viewport, sticky width, Kanban column offsets.

Run with agent-browser, e.g. `agent-browser set viewport 1366 768 && agent-browser eval "$(cat viewport-probe.js)"`.
Login used the shared pilot test account through the agent-browser auth vault (password piped from the root-only file, never printed).
