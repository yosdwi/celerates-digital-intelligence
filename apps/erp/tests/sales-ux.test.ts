// Sales UX interaction audit (docs/audit/SALES-UX-INTERACTION-AUDIT.md): cheap source-level guards for the layout
// decisions that fixed measured defects. They pin intent, they do not replace a browser check
// (artifacts/sales-ux-dogfood/ has the probe scripts used for the real measurements).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");

test("SALES-UX-001: Kanban board has a bounded height; columns scroll on their own with a pinned header", () => {
  const src = read("app/sales/opportunity-tracker/opportunity-kanban.tsx");
  assert.match(src, /data-kanban-board[^"]*"[^"]*overflow-x-auto[^"]*overflow-y-hidden[^"]*h-\[calc\(100dvh-/);
  assert.match(src, /data-kanban-list[^>]*overflow-y-auto/);
  assert.match(src, /h-full flex flex-col/);
});

test("SALES-UX-002: the view is kept in the URL and Kanban scroll is restored after opening a card", () => {
  assert.match(read("app/sales/opportunity-tracker/tracker-view-tabs.tsx"), /useSearchParams\(\)\.get\("view"\)/);
  assert.match(read("app/sales/opportunity-tracker/tracker-view-tabs.tsx"), /replaceState/);
  const k = read("app/sales/opportunity-tracker/opportunity-kanban.tsx");
  assert.match(k, /sessionStorage\.setItem\(SCROLL_KEY/);
  assert.match(k, /sessionStorage\.getItem\(SCROLL_KEY/);
});

test("SALES-UX-003: sticky table columns only apply from the md breakpoint (they filled a phone screen)", () => {
  for (const f of ["app/sales/opportunity-tracker/opportunity-trackers-table.tsx", "app/sales/opportunities-table.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /(^|[^:\w-])sticky left-/m, `${f}: unconditional sticky left-*`);
    assert.match(src, /md:sticky md:left-0/);
  }
});

test("SALES-UX-004: editors do not get the status twice in the row action cell", () => {
  assert.match(read("app/sales/opportunity-tracker/opportunity-trackers-table.tsx"), /\{!canEdit && <OptyStatusBadge/);
});

test("SALES-UX-005: shared modal closes on Escape, locks page scroll, returns focus and keeps Save/Cancel in view", () => {
  const src = read("components/add-record-modal.tsx");
  assert.match(src, /e\.key === "Escape"/);
  assert.match(src, /document\.body\.style\.overflow = "hidden"/);
  assert.match(src, /trigger\?\.focus\(\)/);
  assert.match(src, /sticky bottom-0[^"]*border-t/);
  assert.match(src, /role="dialog"/);
});

test("SALES-UX-013: the page header scrolls away instead of covering content", () => {
  assert.doesNotMatch(read("components/page-header.tsx"), /sticky/);
});

test("SALES-UX-004/008 batch 2: Convert is a dialog, primary actions live in the header, Sheet Sync is secondary, FAB has room", () => {
  const convert = read("app/sales/opportunity-tracker/convert-to-requisition-button.tsx");
  assert.match(convert, /role="dialog"/);
  assert.match(convert, /e\.key === "Escape"/);
  const page = read("app/sales/opportunity-tracker/page.tsx");
  const header = page.slice(page.indexOf("<PageHeader"), page.indexOf("</PageHeader>"));
  assert.match(header, /Add Extension Request/);
  assert.match(header, /createOpportunityTracker/);
  assert.doesNotMatch(header, /bg-brand-600[^"]*text-white[^"]*"\s*>\s*<RefreshCw/);
  assert.match(read("components/app-shell.tsx"), /md:pb-24/);
  assert.match(read("app/sales/opportunity-tracker/opportunity-trackers-table.tsx"), /max-h-\[max\(360px,calc\(100dvh-12rem\)\)\]/);
});
