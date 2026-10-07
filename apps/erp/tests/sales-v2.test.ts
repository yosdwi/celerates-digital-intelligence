// Sales V2 (docs/design/SALES-V2-CRISP-UX-CONTRACT.md): the URL state every view shares, the return path a
// redirecting action may use, and source guards for the locked decisions. Browser behaviour is checked live
// (artifacts/sales-ux-dogfood/), not here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyFilters } from "@crisp-ui-kit/crisp";
import {
  BUILT_IN_VIEWS, DEFAULT_SHOWN, canConvert, checkedValues, daysSince, matchesSearch, parseState, serializeState, setCheckedValues, setRange,
  type Opportunity,
} from "../src/features/sales-v2/model";
import { safeSalesReturnPath } from "../src/lib/safe-return";

const read = (p: string) => readFileSync(new URL(`../src/${p}`, import.meta.url), "utf8");
const q = (s: string) => new URLSearchParams(s);

test("URL state round-trips view, search, filters, sort, saved view and record", () => {
  const state = {
    view: "kanban" as const, q: "bank", record: "r1", savedView: "active",
    filters: [{ id: "f1", key: "status", op: "isanyof" as const, value: "", values: ["Win", "Dropped"] }],
    sorts: [{ key: "price", dir: "desc" as const }],
  };
  const back = parseState(q(serializeState(state).slice(1)));
  assert.deepEqual(back, { ...state, filters: [{ ...state.filters[0] }] });
  assert.equal(serializeState({ view: "table", q: " ", filters: [], sorts: [], record: null, savedView: null }), "");
});

test("URL state drops anything it does not know instead of trusting it", () => {
  const s = parseState(q("view=evil&sort=password:asc,price:sideways&filter=" + encodeURIComponent(JSON.stringify([{ key: "users", value: "x" }, { key: "client", op: "contains", value: "A" }]))));
  assert.equal(s.view, "table");
  assert.deepEqual(s.sorts, []);
  assert.deepEqual(s.filters.map((f) => f.key), ["client"]);
  assert.deepEqual(parseState(q("filter=%7Bnot-json")).filters, []);
});

test("return_to accepts only Sales paths", () => {
  assert.equal(safeSalesReturnPath("/sales/v2/opportunity-tracker?view=kanban&record=abc"), "/sales/v2/opportunity-tracker?view=kanban&record=abc");
  for (const bad of ["https://evil.example/sales/x", "//evil.example", "/admin", "/sales\\..\\x", "javascript:alert(1)", 42, null])
    assert.equal(safeSalesReturnPath(bad), "/sales/opportunity-tracker", String(bad));
});

test("Convert is offered only for a Sales Qualified opportunity without a PQ (V1 rule)", () => {
  const base = { salesQualified: true, pq: null } as unknown as Opportunity;
  assert.equal(canConvert(base), true);
  assert.equal(canConvert({ ...base, salesQualified: false }), false);
  assert.equal(canConvert({ ...base, pq: { id: "p", no: null, stage: "on_going", signature: "not_sent", documents: 0 } }), false);
});

test("search covers Celerates identifiers and downstream numbers", () => {
  const o = { optyNo: "OPTY2026-001", client: "PT Maju", salesPic: "Rina", requisition: { no: "REQ-2026-9" }, pq: null, status: "win" } as unknown as Opportunity;
  for (const needle of ["opty2026", "maju", "rina", "req-2026-9", "win"]) assert.equal(matchesSearch(o, needle), true, needle);
  assert.equal(matchesSearch(o, "zzz"), false);
});

test("built-in views and default columns use Celerates fields", () => {
  assert.deepEqual(BUILT_IN_VIEWS.map((v) => v.id), ["all", "active", "ready", "win", "dropped"]);
  for (const k of ["client", "optyNo", "status", "salesPic", "salesQualified"]) assert.ok(DEFAULT_SHOWN.includes(k), k);
});

test("V2 renders with Crisp components, not look-alikes", () => {
  const ws = read("features/sales-v2/workspace.tsx");
  for (const c of ["DataTable", "TableToolbar", "ViewToggle", "SavedViews", "Board", "StatCard", "EntityCard"]) assert.match(ws, new RegExp(`<${c}\\b`), c);
  assert.match(read("features/sales-v2/record-preview.tsx"), /<RecordPanel\b/);
  const forms = read("features/sales-v2/forms.tsx");
  for (const c of ["Dialog", "DialogBody", "DialogFooter", "Select", "Input", "Textarea", "Menu"]) assert.match(forms, new RegExp(`<${c}\\b`), c);
  // One view selector; the nested List|Kanban + Tabel|Grid pair must not come back.
  assert.doesNotMatch(ws, /TrackerViewTabs|@\/components\/view-toggle/);
});

test("Crisp styles are scoped to the V2 route and layered; base.css is never loaded", () => {
  assert.match(read("app/sales/v2/layout.tsx"), /@crisp-ui-kit\/crisp\/styles\.layered\.css/);
  assert.doesNotMatch(read("app/layout.tsx"), /crisp/);
  assert.doesNotMatch(read("app/sales/v2/layout.tsx"), /base\.css"/);
});

test("density: no oversized page chrome in V2", () => {
  for (const f of ["features/sales-v2/workspace.tsx", "features/sales-v2/record-preview.tsx", "features/sales-v2/forms.tsx"]) {
    const src = read(f);
    assert.doesNotMatch(src, /\b(px-8|py-8|p-8|space-y-8|gap-8|text-2xl|text-3xl|rounded-2xl|shadow-2xl|zoom:|scale\()/, f);
  }
});

test("right rail: the Agent docks and narrows the page; the launcher follows the record panel (no z-index contest)", () => {
  const agent = read("components/agent/agent-panel.tsx");
  assert.match(agent, /useRightRail\(\)/);
  assert.match(agent, /rail\.panelWidth \? \{ right: rail\.panelWidth \+ 24 \}/);
  assert.match(agent, /setRightRail\(\{ agentOpen: open \}\)/);
  assert.match(agent, /setProperty\("--agent-rail"/);
  assert.match(read("components/app-shell.tsx"), /lg:mr-\[var\(--agent-rail,0px\)\]/);
  for (const f of ["user-menu", "notification-bell", "activity-log-link", "language-switcher"])
    assert.match(read(`components/${f}.tsx`), /right-\[calc\(var\(--agent-rail,0px\)\+/, f);
  const preview = read("features/sales-v2/record-preview.tsx");
  assert.match(preview, /const visible = !!record/);
  assert.match(preview, /setRightRail\(\{ panelWidth:/);
});

test("Agent: no explanatory boilerplate; first-visit invitation offers voice, ask and the feedback form", () => {
  const agent = read("components/agent/agent-panel.tsx") + read("components/agent/agent-thread.tsx");
  assert.doesNotMatch(agent, /Satu tempat untuk bertanya|data\.coverage|ringkasan modul/);
  assert.match(agent, /data-agent-intro-popup/);
  assert.match(agent, /Bicara sekarang/);
  assert.match(agent, /celerates\.agent\.intro\.v1/);
});

test("header checklist writes the shorter of ticked or unticked values, and round-trips through Crisp's filter", () => {
  const all = ["A", "B", "C", "D", "E", ""];
  const rows = all.map((client) => ({ client }));
  const get = (r: { client: string }) => r.client;
  // Two of six ticked: isanyof.
  let f = setCheckedValues([], "client", all, new Set(["A", "B"]));
  assert.deepEqual(f.map((x) => x.op), ["isanyof"]);
  assert.deepEqual(applyFilters(rows, f, get).map(get), ["A", "B"]);
  assert.deepEqual([...checkedValues(f, "client", all)], ["A", "B"]);
  // All but the blank and "C": two exclusions (blank becomes notempty).
  f = setCheckedValues([], "client", all, new Set(["A", "B", "D", "E"]));
  assert.deepEqual(f.map((x) => x.op).sort(), ["isnot", "notempty"]);
  assert.deepEqual(applyFilters(rows, f, get).map(get), ["A", "B", "D", "E"]);
  assert.deepEqual([...checkedValues(f, "client", all)], ["A", "B", "D", "E"]);
  // Everything ticked: no filter; other columns' filters are left alone.
  const other = { id: "x", key: "status", op: "is" as const, value: "Win" };
  assert.deepEqual(setCheckedValues([other, ...f], "client", all, new Set(all)), [other]);
  // Ranges: blank bounds are dropped.
  assert.deepEqual(setRange([], "price", "number", "100", " ").map((x) => [x.op, x.value]), [["greaterthan", "100"]]);
  assert.deepEqual(setRange([], "lastCommunication", "date", "", "2026-10-01").map((x) => x.op), ["before"]);
});

test("Last Communication age in days", () => {
  assert.equal(daysSince(null), null);
  assert.equal(daysSince("2026-10-01", Date.parse("2026-10-07T12:00:00+07:00")), 6);
});

test("create dialog closes only from its close button and keeps a draft (contract §12)", () => {
  const forms = read("features/sales-v2/forms.tsx");
  assert.match(forms, /closest\?\.\("\.crisp-dialog-close"\)/);
  assert.match(forms, /drafts\.current\[kind\] = d/);
  assert.match(forms, /name="opty_status_code"/);
});

test("V2 reuses the V1 server actions (no duplicate business logic)", () => {
  const all = ["workspace.tsx", "record-preview.tsx", "forms.tsx"].map((f) => read(`features/sales-v2/${f}`)).join("\n");
  for (const a of ["createOpportunityTracker", "createExtensionRequestFromSales", "updateOptyStatus", "updateSalesQualified", "convertToRequisition", "deleteOpportunityTracker"])
    assert.match(all, new RegExp(`\\b${a}\\b`), a);
  assert.doesNotMatch(all, /"use server"|from "@\/db"/);
});

test("V2 sits behind the Sales route gate (no new, unguarded route)", async () => {
  const { canOpenRoute, routeGate } = await import("../src/lib/route-access");
  assert.deepEqual(routeGate("/sales/v2/opportunity-tracker"), { kind: "division", divisions: ["sales"] });
  assert.equal(canOpenRoute({ access: [{ divisionKey: "ta", level: "full" }] }, "/sales/v2/opportunity-tracker"), false);
  assert.equal(canOpenRoute({ access: [{ divisionKey: "sales", level: "viewer" }] }, "/sales/v2/opportunity-tracker"), true);
});
