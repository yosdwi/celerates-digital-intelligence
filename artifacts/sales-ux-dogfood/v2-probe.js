// Sales V2 layout probe: run with `agent-browser eval "$(cat v2-probe.js)"` on /sales/v2/opportunity-tracker.
// Prints sizes only (no record content beyond counts).
(() => {
  const q = (s) => document.querySelector(s);
  const box = (e) => {
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
  };
  const ws = q("[data-sales-v2-workspace]");
  const scroll = ws?.querySelector(".crisp-table-scroll");
  const rows = [...(ws?.querySelectorAll("tbody tr") ?? [])].filter((r) => r.getBoundingClientRect().height > 0);
  const boardRow = ws?.querySelector(".crisp-board-row");
  const cols = [...(ws?.querySelectorAll(".crisp-board-col-body") ?? [])];
  const panel = q(".crisp-recordpanel");
  const fab = q("button[aria-controls=celerates-agent]");
  const overlap = (a, b) => a && b && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  const dialog = q("[data-crisp-dialog]");
  return JSON.stringify({
    viewport: [innerWidth, innerHeight],
    doc: { scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight },
    header: box(q("[data-sales-v2] header")),
    kpi: box(q("[data-sales-v2-kpi]")),
    toolbar: box(q("[data-sales-v2-toolbar]")),
    workspace: box(ws),
    view: ws?.dataset.salesV2Workspace,
    count: q("[data-sales-v2-count]")?.textContent,
    table: scroll ? { box: box(scroll), scrollH: scroll.scrollHeight, scrollW: scroll.scrollWidth, renderedRows: rows.length, rowH: rows[2] ? box(rows[2]).h : null } : null,
    board: boardRow ? { box: box(boardRow), scrollW: boardRow.scrollWidth, cols: cols.length, colScrollable: cols.filter((c) => c.scrollHeight > c.clientHeight).length, cards: ws.querySelectorAll(".crisp-board-card").length } : null,
    grid: q("[data-sales-v2-grid]") ? { box: box(q("[data-sales-v2-grid]")), cards: ws.querySelectorAll("[data-sales-v2-grid] button").length } : null,
    panel: box(panel),
    fab: box(fab),
    panelFabOverlap: overlap(box(panel), box(fab)),
    dialog: dialog ? { box: box(dialog), scrollH: dialog.scrollHeight } : null,
    newButton: box(q("[data-testid=sales-v2-new]")),
    url: location.pathname + location.search,
  });
})()
