// Sales V2 (docs/design/SALES-V2-CRISP-UX-CONTRACT.md): the URL state every view shares, the return path a
// redirecting action may use, and source guards for the locked decisions. Browser behaviour is checked live
// (artifacts/sales-ux-dogfood/), not here.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { applyFilters } from "@crisp-ui-kit/crisp";
import {
  BUILT_IN_VIEWS, DEFAULT_SHOWN, canConvert, checkedValues, daysSince, editValues, matchesSearch, parseState, serializeState, setCheckedValues, setRange,
  type Opportunity,
} from "../src/features/sales-v2/model";
import { PQ_DEFAULT_SHOWN, needsPqNo, pqEditValues, pqFieldValue, withPqStage, type Pq } from "../src/features/sales-v2/pq-model";
import { ACCOUNT_BUILT_IN_VIEWS, accountFieldValue, accountFormData, accountMatchesSearch, type Account } from "../src/features/sales-v2/account-model";
import { safeSalesReturnPath } from "../src/lib/safe-return";
import { submoduleFor } from "../src/lib/module-access";
import { navModuleFor } from "../src/lib/nav-module";
import { buildJourney, type JourneyInput } from "../src/features/sales-v2/journey-model";
import { fillTemplate, matchAccount, parseAddressList, snippet, threadKey } from "../src/lib/mail/model";
import { extensionPrefill, mergeFill, normalizeAiFill, normalizeAiResult, pqCreateFields, updateSuggestions } from "../src/features/sales-v2/ai-fill";

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
  // Kanban is every page's default (QA page 7), so a plain URL opens the board and the table names itself.
  assert.equal(serializeState({ view: "kanban", q: " ", filters: [], sorts: [], record: null, savedView: null }), "");
  assert.equal(serializeState({ view: "table", q: "", filters: [], sorts: [], record: null, savedView: null }), "?view=table");
  assert.equal(parseState(q("")).view, "kanban");
});

test("URL state drops anything it does not know instead of trusting it", () => {
  const s = parseState(q("view=evil&sort=password:asc,price:sideways&filter=" + encodeURIComponent(JSON.stringify([{ key: "users", value: "x" }, { key: "client", op: "contains", value: "A" }]))));
  assert.equal(s.view, "kanban");
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
  const ws = read("features/sales-v2/record-workspace.tsx") + read("features/sales-v2/board-menu.tsx");
  for (const c of ["DataTable", "TableToolbar", "ViewToggle", "SavedViews", "Board", "StatCard", "EntityCard", "Popover"]) assert.match(ws, new RegExp(`<${c}\\b`), c);
  assert.match(read("features/sales-v2/record-preview.tsx"), /<RecordPanel\b/);
  const forms = read("features/sales-v2/forms.tsx");
  for (const c of ["Dialog", "DialogBody", "DialogFooter", "Select", "Input", "Textarea", "Menu"]) assert.match(forms, new RegExp(`<${c}\\b`), c);
  // One view selector; the nested List|Kanban + Tabel|Grid pair must not come back.
  assert.doesNotMatch(ws, /TrackerViewTabs|@\/components\/view-toggle/);
});

test("Crisp styles are layered (the app's own styles win) and base.css is never loaded; the app shell uses them too (QA 2026-10-09)", () => {
  assert.match(read("app/sales/v2/layout.tsx"), /@crisp-ui-kit\/crisp\/styles\.layered\.css/);
  assert.match(read("app/layout.tsx"), /import "@crisp-ui-kit\/crisp\/styles\.layered\.css";/);
  for (const f of ["app/layout.tsx", "app/sales/v2/layout.tsx"]) assert.doesNotMatch(read(f), /base\.css"|crisp\/styles\.css"/, f);
});

test("density: no oversized page chrome in V2", () => {
  for (const f of readdirSync(new URL("../src/features/sales-v2/", import.meta.url)).map((n) => `features/sales-v2/${n}`)) {
    const src = read(f);
    assert.doesNotMatch(src, /\b(px-8|py-8|p-8|space-y-8|gap-8|text-2xl|text-3xl|rounded-2xl|shadow-2xl|zoom:|scale\()/, f);
  }
});

test("right rail: the Agent docks and narrows the page; an open record panel replaces the launcher (no z-index contest)", () => {
  const agent = read("components/agent/agent-panel.tsx");
  assert.match(agent, /useRightRail\(\)/);
  assert.match(agent, /const panelOpen = rail\.panelWidth > 0/);
  assert.match(agent, /open \|\| panelOpen \? "hidden"/);
  const kit = read("features/sales-v2/record-workspace.tsx");
  assert.match(kit, /openAgent\(\{ prefill \}\)/);
  assert.match(agent, /setRightRail\(\{ agentOpen: open && !full \}\)/);
  assert.match(agent, /setProperty\("--agent-rail"/);
  assert.match(read("components/app-shell.tsx"), /lg:mr-\[var\(--agent-rail,0px\)\]/);
  for (const f of ["user-menu", "notification-bell", "activity-log-link", "language-switcher"])
    assert.match(read(`components/${f}.tsx`), /right-\[calc\(var\(--agent-rail,0px\)\+/, f);
  assert.match(kit, /setRightRail\(\{ panelWidth:/);
  // Every V2 record panel goes through the shared rail wiring.
  for (const f of ["record-preview.tsx", "pq-preview.tsx"]) assert.match(read(`features/sales-v2/${f}`), /useRecordPanelRail\(/, f);
});

test("Agent: no explanatory boilerplate; first-visit invitation offers voice, ask and the feedback form", () => {
  const agent = read("components/agent/agent-panel.tsx") + read("components/agent/agent-thread.tsx");
  assert.doesNotMatch(agent, /Satu tempat untuk bertanya|data\.coverage|ringkasan modul|Kenapa perlu perhatian: \$\{/);
  assert.match(agent, /useState\(false\);\s*$/m); // Perlu perhatian starts folded
  assert.match(agent, /placeholder="Bisa ceritakan masukan Anda\? Ketik \/ untuk perintah"/);
  for (const c of ["masukan", "fitur", "kendala", "formulir", "perhatian", "jelaskan", "baru", "bicara", "lampirkan"]) assert.match(agent, new RegExp(`id: "${c}"`), c);
  assert.match(agent, /unstable_useSlashCommandAdapter/);
  assert.match(agent, /Usulkan fitur baru/);
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
  assert.match(forms, /drafts\.current\[kind\] = readDraft/);
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

test("Agent context: /sales/v2/<page> is the same submodule as /sales/<page>, not PQ Tracker", () => {
  assert.equal(submoduleFor("/sales/v2/opportunity-tracker")?.label, "Opportunity Tracker");
  assert.equal(submoduleFor("/sales/opportunity-tracker")?.label, "Opportunity Tracker");
  assert.equal(submoduleFor("/sales/abc/edit")?.label, "PQ Tracker");
});

test("edit values carry every V1 edit field and post blanks for unset values", () => {
  const v1 = read("app/sales/opportunity-tracker/[id]/edit/page.tsx");
  const v1Fields = new Set([...v1.matchAll(/name="([a-z_]+)"/g)].map((m) => m[1]).filter((n) => n !== "return_to"));
  const o = { client: "PT A", salesPic: "Rina", status: "dropped", salesQualified: false, price: 5000000, lastCommunication: "2026-09-01", clientType: null } as unknown as Opportunity;
  const v = editValues(o);
  assert.deepEqual(new Set(Object.keys(v)), v1Fields);
  assert.equal(v.price_amount, "5000000");
  assert.equal(v.client_type_code, "");
  assert.equal(v.sales_qualified, "");
  // The edit dialog renders the same fields.
  const forms = read("features/sales-v2/forms.tsx");
  const edit = forms.slice(forms.indexOf("function EditForm"));
  for (const f of v1Fields) assert.match(edit, f === "position_name" ? /<PositionInput\b/ : f === "sales_pic_name" ? /<SalesPicSelect\b/ : new RegExp(`name="${f}"`), f);
});

test("Kanban: Win and Dropped ask first; other moves save with Undo", () => {
  const ws = read("features/sales-v2/record-workspace.tsx");
  assert.match(read("features/sales-v2/stage-move.tsx"), /CONFIRM_STAGES = new Set\(\["win", "dropped"\]\)/);
  assert.match(read("features/sales-v2/workspace.tsx"), /confirm: CONFIRM_STAGES/);
  assert.match(ws, /label: "Batalkan"/);
  assert.match(ws, /board\.confirm\.has\(moved\.columnId\)/);
});

test("navigation: Opportunity Tracker opens V2; the V1 page still resolves to the same entry and stays linked from V2", () => {
  assert.equal(submoduleFor("/sales/v2/opportunity-tracker")?.href, "/sales/v2/opportunity-tracker");
  assert.equal(submoduleFor("/sales/opportunity-tracker/abc/edit")?.href, "/sales/v2/opportunity-tracker");
  assert.equal(submoduleFor("/sales")?.label, "PQ Tracker");
  assert.match(read("features/sales-v2/workspace.tsx"), /href="\/sales\/opportunity-tracker"/);
  // Shared pages: one heading and a small icon, no coloured boxes.
  const sidebar = read("components/sidebar.tsx");
  assert.match(sidebar, /t\("sharedPages"\)/);
  assert.doesNotMatch(sidebar, /border-teal-500|border-orange-500/);
});

test("one ERP font: Inter, self-hosted, set once in globals.css", () => {
  assert.match(read("app/layout.tsx"), /@fontsource-variable\/inter/);
  assert.match(read("app/globals.css"), /--font-sans: "Inter Variable"/);
  assert.doesNotMatch(read("app/globals.css"), /Plus Jakarta/);
});

test("V2 toolbar: every column by default, New and Sheet Sync (a dialog) at the end, ERP brand colours", () => {
  assert.equal(DEFAULT_SHOWN.length, 21);
  const ws = read("features/sales-v2/workspace.tsx");
  assert.match(ws, /<SheetSyncButton\b/);
  assert.doesNotMatch(ws, /href="\/sales\/opportunity-tracker\/sheet-sync"/);
  assert.match(read("app/crisp-theme.css"), /--crisp-bg-brand-solid: #194667/);
});

// ── PQ Tracker V2 (contract §14) ────────────────────────────────────────────────────────────────────────────
const pq = (p: Partial<Pq> = {}): Pq => ({
  id: "p1", optyNo: "OPTY2026-001", pqNo: null, fromOnboarding: false, trackerId: null, client: "PT A", clientType: null, project: "Proj",
  position: null, serviceType: "outsourcing", businessUnit: null, level: null, headcount: null, durationMonths: null, priority: null, bant: null,
  price: null, pricePeriod: null, requestDate: null, approvalDate: null, startDate: null, endDate: null, salesPic: "Rina", stage: "on_going",
  optyStatus: null, notes: null, leadSource: null, createdAt: null, poDocUrl: null, poDocs: [], pqDocs: [],
  signature: { status: "not_sent", signerName: null }, projectDoc: null, ...p,
});

test("PQ: stage moves carry V1's Opty Status rule; Perlu Generate PQ is V1's rule", () => {
  assert.deepEqual(withPqStage(pq(), "win"), { stage: "win", optyStatus: "won" });
  assert.deepEqual(withPqStage(pq(), "drop"), { stage: "drop", optyStatus: "closed_lost" });
  assert.deepEqual(withPqStage(pq({ optyStatus: "waiting_feedback" }), "on_going"), { stage: "on_going", optyStatus: "waiting_feedback" });
  assert.equal(needsPqNo(pq({ fromOnboarding: true })), true);
  assert.equal(needsPqNo(pq({ fromOnboarding: true, pqNo: "PQ-1" })), false);
  assert.equal(needsPqNo(pq()), false);
  assert.equal(pqFieldValue(pq({ stage: "hold" }), "stage"), "Hold");
  assert.equal(pqFieldValue(pq({ optyStatus: "won" }), "optyStatus"), "Project Won");
});

test("PQ edit posts every field V1's update writes, PMO documents included (nothing gets blanked)", () => {
  const src = read("app/sales/actions.ts");
  const update = src.slice(src.indexOf("export async function updateOpportunity("), src.indexOf("export type UpdateStageResult"));
  const posted = new Set([...update.matchAll(/formData\.get\("(\w+)"\)/g)].map((m) => m[1]));
  // Files, and the two codes V1 sets from its list (guarded: blank never overwrites), are not part of the form values.
  for (const k of ["po_doc_file", "pipeline_stage_code", "opty_status_code", "return_to"]) posted.delete(k);
  assert.deepEqual([...posted].sort(), Object.keys(pqEditValues(pq())).sort());
  assert.match(update, /redirect\(safeSalesReturnPath\(formData\.get\("return_to"\), "\/sales"\)\)/);
});

test("PQ V2 reuses V1 PQ actions, shows every V1 column and is the sidebar entry", () => {
  const all = ["pq-workspace.tsx", "pq-preview.tsx", "pq-forms.tsx"].map((f) => read(`features/sales-v2/${f}`)).join("\n");
  for (const a of ["createOpportunity", "updateOpportunity", "updatePipelineStage", "updateOptyStatus", "sendPqForSignature", "deleteOpportunity", "deleteOpportunityAttachment"])
    assert.match(all, new RegExp(`\\b${a}\\b`), a);
  assert.doesNotMatch(all, /from "@\/db"/);
  assert.equal(PQ_DEFAULT_SHOWN.length, 26);
  assert.equal(submoduleFor("/sales/v2/pq-tracker")?.label, "PQ Tracker");
  assert.equal(submoduleFor("/sales")?.href, "/sales/v2/pq-tracker");
  assert.equal(submoduleFor("/sales/3f1c/edit")?.label, "PQ Tracker");
  assert.equal(submoduleFor("/sales/opportunity-tracker/x/edit")?.label, "Opportunity Tracker");
  assert.match(read("features/sales-v2/pq-workspace.tsx"), /href="\/sales"/);
});

test("density on laptops: compact sidebar and V2 chrome, no zoom (contract §15)", () => {
  const sidebar = read("components/sidebar.tsx");
  assert.match(sidebar, /"w-60"/);
  assert.match(read("components/app-shell.tsx"), /md:ml-60/);
  assert.doesNotMatch(sidebar, /py-2\.5|py-6|width=\{36\}/);
  const kit = read("features/sales-v2/record-workspace.tsx");
  assert.match(kit, /text-\[1\.125rem\]/);
  const v2css = read("app/sales/v2/sales-v2.css");
  assert.match(v2css, /@media \(max-height: 760px\)/);
  // Laptop tier: one rem step for the whole app plus Crisp's px tokens; never zoom or scale.
  const globals = read("app/globals.css");
  assert.match(globals, /@media \(min-width: 768px\) and \(max-width: 1599px\) \{\s*html \{ font-size: 14px; \}/);
  assert.match(v2css, /--crisp-size-tableRow: 32px/);
  assert.doesNotMatch(globals + v2css, /\bzoom:|html \{[^}]*transform/);
  // Font sizes are rem so they follow that step (px would stay large on laptops).
  for (const f of readdirSync(new URL("../src/features/sales-v2/", import.meta.url))) assert.doesNotMatch(read(`features/sales-v2/${f}`), /text-\[\d+px\]/, f);
});

const account = (p: Partial<Account> = {}): Account => ({
  id: "a1", name: "PT Maju", industry: "Banking", status: "prospect", notes: null, createdBy: null, createdAt: null,
  leads: 0, opportunities: 2, activeOpportunities: 1, contracts: 0, monthlyValue: 0, invoices: 3, overdueInvoices: 0, emails: 0,
  contacts: [{ id: "c1", name: "Rina", role: "HR", email: "rina@maju.co", phone: null, primary: true }], activities: [],
  history: { leads: [], opportunities: [], contracts: [], invoices: [] }, ...p,
});

test("Account: filters read labels and flags; search covers contacts; built-in views filter what their card counts", () => {
  const a = account();
  assert.equal(accountFieldValue(a, "status"), "Prospect");
  assert.equal(accountFieldValue(a, "pic"), "Rina");
  assert.equal(accountFieldValue(a, "hasActiveOpty"), true);
  assert.equal(accountFieldValue(a, "hasOverdue"), false);
  assert.ok(accountMatchesSearch(a, "rina@"));
  assert.ok(!accountMatchesSearch(a, "telkom"));
  const rows = [a, account({ id: "a2", status: "active", activeOpportunities: 0, overdueInvoices: 2 })];
  const count = (id: string) => applyFilters(rows, ACCOUNT_BUILT_IN_VIEWS.find((v) => v.id === id)!.state.filters, accountFieldValue).length;
  assert.deepEqual(["all", "prospect", "active", "dormant", "active_opty", "overdue"].map(count), [2, 1, 1, 0, 1, 1]);
});

test("Account: a status change posts every field V1's updateClient writes, the others unchanged", () => {
  const actions = read("app/sales/accounts/actions.ts");
  const update = actions.slice(actions.indexOf("export async function updateClient"), actions.indexOf("export type DeleteResult"));
  const fields = new Set([...update.matchAll(/formData\.get\("([a-z_]+)"\)/g)].map((m) => m[1]));
  const fd = accountFormData(account({ notes: "VIP" }), "active");
  assert.deepEqual(new Set(fd.keys()), fields);
  assert.equal(fd.get("status_code"), "active");
  assert.equal(fd.get("notes"), "VIP");
  assert.equal(fd.get("industry"), "Banking");
});

test("Account V2 reuses V1 CRM actions, keeps Marketing's access and is the sidebar entry for both divisions", async () => {
  const all = ["account-workspace.tsx", "account-preview.tsx"].map((f) => read(`features/sales-v2/${f}`)).join("\n");
  for (const a of ["createClient", "updateClient", "deleteClient", "createContact", "deleteContact", "createActivity", "deleteActivity"])
    assert.match(all, new RegExp(`\\b${a}\\b`), a);
  assert.doesNotMatch(all, /"use server"|from "@\/db"/);
  const { canOpenRoute } = await import("../src/lib/route-access");
  assert.equal(canOpenRoute({ access: [{ divisionKey: "marketing", level: "viewer" }] }, "/sales/v2/accounts"), true);
  assert.equal(canOpenRoute({ access: [{ divisionKey: "marketing", level: "viewer" }] }, "/sales/v2/pq-tracker"), false);
  assert.equal(canOpenRoute({ access: [{ divisionKey: "ta", level: "full" }] }, "/sales/v2/accounts"), false);
  assert.equal(submoduleFor("/sales/v2/accounts")?.label, "Account (CRM)");
  assert.equal(submoduleFor("/sales/accounts/x")?.href, "/sales/v2/accounts");
  // A contact with logged activities can be deleted: the activities keep their history without it.
  const actions = read("app/sales/accounts/actions.ts");
  const del = actions.slice(actions.indexOf("export async function deleteContact"));
  assert.ok(del.indexOf("contact_id: null") < del.indexOf("db.delete(crmClientContacts)"));
});

test("QA 2026-10-08: slim sidebar scroll, Agent width follows the screen and can be dragged, V1 colours in V2", () => {
  const sidebar = read("components/sidebar.tsx");
  assert.match(sidebar, /sidebar-scroll/);
  assert.match(read("app/globals.css"), /\.sidebar-scroll::-webkit-scrollbar \{ width: 6px; \}/);
  const agent = read("components/agent/agent-panel.tsx");
  assert.doesNotMatch(agent, /w-\[400px\]|RAIL_WIDTH = "400px"/);
  assert.match(agent, /role="separator"/);
  assert.match(read("features/sales-v2/record-workspace.tsx"), /GRADIENTS\[k\.color\]/);
  for (const f of ["workspace.tsx", "pq-workspace.tsx", "account-workspace.tsx"]) assert.doesNotMatch(read(`features/sales-v2/${f}`), /soft: "#/, f);
  assert.match(read("app/sales/v2/sales-v2.css"), /background: #f5f3ff; color: #6d28d9/);
});

test("QA 2026-10-08: Attio-style table: V1's frozen columns slim, fields edited in their cell, the name opens the panel", () => {
  const ot = read("features/sales-v2/workspace.tsx");
  const pq = read("features/sales-v2/pq-workspace.tsx");
  const acc = read("features/sales-v2/account-workspace.tsx");
  assert.match(ot, /frozen: \["optyNo", "leadNo", "client"\]/);
  assert.match(pq, /frozen: \["optyNo", "pqNo", "pqDocs"\]/);
  for (const src of [ot, pq, acc]) {
    assert.doesNotMatch(src, /ActionsCell|key: "actions"/);
    assert.match(src, /\n  rowMenu,\n  edits: EDITS,/);
    assert.match(src, /<RecordLink id=/);
    assert.match(src, /editor: "select"/);
  }
  // One field saved through the V1 edit action without its redirect; stage-like fields through their own V1 actions.
  assert.match(ot, /saveOpportunityTracker\(o\.id, fieldFormData\(editValues\(o\)/);
  assert.match(pq, /saveOpportunity\(p\.id, fieldFormData\(pqEditValues\(p\)/);
  assert.match(pq, /save: \(p, v\) => savePqStage\(p\.id, v\)/);
  const kit = read("features/sales-v2/record-workspace.tsx");
  assert.match(kit, /onEdit=\{edit\}/);
  assert.match(kit, /rowContextMenu=\{c\.rowMenu/);
  assert.doesNotMatch(kit, /onRowClick=/);
  assert.match(kit, /className={`min-w-0 truncate pr-3 \$\{i === parts\.length - 1 \? "flex-1" : "shrink-0"\}`} style=\{\{ width \}\} title=/);
  // The V1 update actions are split, not duplicated: update = save + redirect.
  assert.match(read("app/sales/opportunity-tracker/actions.ts"), /await saveOpportunityTracker\(id, formData\);\n[^]*?await markSaved\(\);\n  redirect\(/);
  assert.match(read("app/sales/actions.ts"), /await saveOpportunity\(id, formData\);\n[^]*?await markSaved\(\);\n[^]*?redirect\(/);
});

test("in-cell edits write V1 form fields and keep every other field as it is", async () => {
  const { OT_FIELD_EDITS, fieldFormData } = await import("../src/features/sales-v2/model");
  const { PQ_FIELD_EDITS } = await import("../src/features/sales-v2/pq-model");
  const o = { client: "PT A", salesPic: "Rina", status: "solutioning", salesQualified: true, price: 5000000, clientType: "new" } as unknown as Opportunity;
  const values = editValues(o);
  for (const f of Object.values(OT_FIELD_EDITS)) assert.ok(f.form in values, f.form);
  const p = { client: "PT B", project: "X", serviceType: "rpo", salesPic: "Rina", stage: "on_going", signature: { status: "not_sent" } } as unknown as Pq;
  const pqValues = pqEditValues(p);
  for (const f of Object.values(PQ_FIELD_EDITS)) assert.ok(f.form in pqValues, f.form);
  const fd = fieldFormData(values, "price_amount", "Rp 7.000.000");
  assert.equal(fd.get("price_amount"), "7000000");
  assert.equal(fd.get("client_name"), "PT A");
  assert.equal(fd.get("sales_qualified"), "true");
  assert.deepEqual(new Set(fd.keys()), new Set(Object.keys(values)));
  assert.deepEqual(OT_FIELD_EDITS.price.patch("Rp 7.000.000"), { price: 7000000 });
  assert.deepEqual(OT_FIELD_EDITS.clientType.patch(""), { clientType: null });
  assert.equal(OT_FIELD_EDITS.client.required, true);
  assert.equal(PQ_FIELD_EDITS.project.required, true);
});

test("QA 2026-10-08: form dialogs keep Batal / Simpan in view (no clipped footer on short laptop screens)", () => {
  const dir = new URL("../src/features/sales-v2/", import.meta.url);
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx"))) assert.doesNotMatch(read(`features/sales-v2/${f}`), /85dvh/, f);
  assert.match(read("app/sales/v2/sales-v2.css"), /\.crisp-dialog-card > form \{ display: flex; flex-direction: column; flex: 1; min-height: 0; \}/);
});

test("QA 2026-10-08: Kanban has no per-column +; a column header opens sort, filter and hide for that column", () => {
  const kit = read("features/sales-v2/record-workspace.tsx");
  assert.doesNotMatch(kit, /onNewCard|newCardLabel/);
  for (const f of ["workspace.tsx", "pq-workspace.tsx", "account-workspace.tsx"]) assert.doesNotMatch(read(`features/sales-v2/${f}`), /onNewCard|newCardLabel/, f);
  const menu = read("features/sales-v2/board-menu.tsx");
  assert.match(menu, /crisp-board-col-header/);
  for (const part of ["Urutkan kartu", "Filter kartu di kolom ini", "Sembunyikan", "applyFilters", "applySorts"]) assert.match(menu, new RegExp(part), part);
});

test("QA 2026-10-08: Sales Sheet Sync runs on the service account, Sales editors only", async () => {
  for (const f of ["app/sales/sheet-sync/actions.ts", "app/sales/opportunity-tracker/sheet-sync/actions.ts"]) {
    const src = read(f);
    const actions = src.split(/export async function /).slice(1);
    assert.equal(actions.length, 6, f);
    for (const a of actions) assert.match(a, /^\w+\([^)]*\)[^{]*\{\n  await requireActor\(\);\n  await requireSalesSheetSync\(\);/, `${f} ${a.slice(0, 20)}`);
    assert.doesNotMatch(src, /getValidAccessToken|integrationDisabled/, f);
  }
  assert.match(read("lib/integration-policy.ts"), /requireDivisionAccess\("sales"\)/);

  // The JWT bearer grant: RS256 over the service account's claims, verifiable with its public key.
  const { generateKeyPairSync, createVerify } = await import("node:crypto");
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = { client_email: "sync@celerates-test.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) };
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify(key)).toString("base64");
  const realFetch = globalThis.fetch;
  let body: URLSearchParams | null = null;
  globalThis.fetch = (async (_url: string, init: RequestInit) => { body = init.body as URLSearchParams; return new Response(JSON.stringify({ access_token: "t1", expires_in: 3600 })); }) as typeof fetch;
  try {
    const { getSheetsToken, sheetsAccountEmail, forgetSheetsToken } = await import("../src/lib/google-sheets");
    forgetSheetsToken();
    assert.equal(await sheetsAccountEmail(), key.client_email);
    assert.equal(await getSheetsToken(), "t1");
    assert.equal(body!.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
    const [h, p, sig] = body!.get("assertion")!.split(".");
    assert.ok(createVerify("RSA-SHA256").update(`${h}.${p}`).verify(publicKey, sig, "base64url"));
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    assert.equal(claims.iss, key.client_email);
    assert.equal(claims.scope, "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.metadata.readonly");
    forgetSheetsToken();
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  }
});

test("QA 2026-10-09: the company Google account is connected by an Owner only, checked, and stored encrypted", async () => {
  const connect = read("app/api/google/sheets/connect/route.ts");
  const callback = read("app/api/google/sheets/callback/route.ts");
  for (const src of [connect, callback]) assert.match(src, /await requireOwner\(\)/);
  assert.match(connect, /access_type: "offline"/);
  assert.match(connect, /httpOnly: true, secure: true, sameSite: "lax"/);
  assert.match(callback, /q\.get\("state"\) !== saved\.state/);
  assert.match(callback, /email !== oauth\.account/);
  assert.match(callback, /sealToken\(data\.refresh_token, SHEETS_PURPOSE\)/);
  assert.doesNotMatch(callback, /refresh_token: data|console\.(log|info)\(.*token/);
  assert.match(read("lib/google-sheets.ts"), /openToken\(row\.refresh_token_enc, SHEETS_PURPOSE\)/);
  process.env.NEXTAUTH_SECRET ??= "test-secret";
  const { sealToken, openToken } = await import("../src/lib/google-sheets");
  const sealed = sealToken("1//refresh", "sales_sheets");
  assert.ok(!sealed.includes("refresh"));
  assert.equal(openToken(sealed, "sales_sheets"), "1//refresh");
  assert.equal(openToken(sealed, "other_purpose"), null);
  const actions = read("features/sales-v2/sheet-actions.ts");
  assert.match(actions, /disconnectGoogleAccount\(\): Promise<void> \{\n  await requireActor\(\);\n  const owner = await requireOwner\(\);/);
  for (const fn of ["availableSheets", "sheetTabs"]) assert.match(actions, new RegExp(`function ${fn}\\([^)]*\\): Promise<.*> \\{\\n  await requireActor\\(\\);\\n  await requireSalesSheetSync\\(\\);`));
});

test("edit history: changed fields only; blank equals null; unwritten (undefined) fields are not changes", async () => {
  const { fieldDiffs } = await import("../src/lib/field-history");
  const before = { client_name: "PT A", price_amount: 5000000, notes: null, level_code: "", price_period_code: "monthly", approval_date: "2026-10-01" };
  assert.deepEqual(fieldDiffs(before, { client_name: "PT A", price_amount: 7000000, notes: "", level_code: null, price_period_code: undefined, approval_date: "2026-10-02" }), [
    { field: "price_amount", old: "5000000", new: "7000000" },
    { field: "approval_date", old: "2026-10-01", new: "2026-10-02" },
  ]);
  assert.deepEqual(fieldDiffs({}, { pks_no: "PKS/1", po_no: null }), [{ field: "pks_no", old: null, new: "PKS/1" }]);
});

test("edit history: every Sales update path records its changes; the read is guarded per record type", () => {
  const ot = read("app/sales/opportunity-tracker/actions.ts");
  const pq = read("app/sales/actions.ts");
  const acc = read("app/sales/accounts/actions.ts");
  assert.equal((ot.match(/updateWithHistory\("opportunity_tracker", salesOpportunityTrackers, id,/g) ?? []).length, 3);
  assert.equal((pq.match(/updateWithHistory\("commercial_pq", opportunities, id,/g) ?? []).length, 4);
  assert.match(pq, /recordChanges\("commercial_pq", id, fieldDiffs\(existingDoc \?\? \{\}, docFields\)\)/);
  assert.equal((acc.match(/updateWithHistory\("crm_client", crmClients, id,/g) ?? []).length, 1);
  for (const [src, table] of [[ot, "salesOpportunityTrackers"], [pq, "opportunities"], [acc, "crmClients"]] as const)
    assert.doesNotMatch(src, new RegExp(`db\\.update\\(${table}\\)`), table);
  assert.match(readFileSync(new URL("../drizzle/0014_record_field_changes.sql", import.meta.url), "utf8"), /CREATE TABLE IF NOT EXISTS "record_field_changes"/);
  const action = read("app/sales/history-actions.ts");
  assert.match(action, /requireDivisionAccess\("sales", "viewer"\)/);
  assert.match(action, /if \(recordType !== "crm_client"\) throw err;\n    await requireDivisionAccess\("marketing", "viewer"\)/);
  for (const f of ["workspace.tsx", "pq-workspace.tsx", "account-workspace.tsx"]) assert.match(read(`features/sales-v2/${f}`), /recordType: "/, f);
  assert.match(read("features/sales-v2/record-workspace.tsx"), /onViewEditHistory=\{\(id, key\) => setHistoryOf/);
});

test("edit history: the panel's Aktivitas is the record timeline; the page's Riwayat drawer reads the whole module, guarded", () => {
  const action = read("app/sales/history-actions.ts");
  for (const fn of ["getFieldHistory", "getModuleHistory"])
    assert.match(action, new RegExp(`export async function ${fn}\\([^)]*\\) \\{\\n  await requireActor\\(\\);[\\s\\S]*?await canRead\\(recordType\\);`), fn);
  for (const f of ["record-preview.tsx", "pq-preview.tsx", "account-preview.tsx"]) {
    const src = read(`features/sales-v2/${f}`);
    assert.match(src, /activityLabel="Aktivitas"/, f);
    assert.match(src, /<RecordTimeline recordId=\{record\.id\} version=\{record\}/, f);
    assert.match(src, /onViewAllActivity=\{\(\) => showHistory\(record\.id\)\}/, f);
  }
  const ws = read("features/sales-v2/record-workspace.tsx");
  assert.match(ws, /<ModuleHistoryDrawer/);
  assert.match(ws, /showHistory: \(recordId\) => setFeedOf/);
});

test("QA page 6: toolbar menus scroll inside, float clearly, the page never scrolls under them; toolbar tools are icons", () => {
  const css = read("app/sales/v2/sales-v2.css");
  // Crisp's TableToolbar menus (not its Popover / Menu) were the ones running off the screen (seen at 1366 × 768).
  assert.match(css, /\.crisp-tabletoolbar-menu:not\(:has\(\.crisp-tabletoolbar-menu\)\) \{ max-height: min\(70dvh, 520px\); overflow-y: auto;/);
  assert.match(read("app/crisp-theme.css"), /--crisp-ring-popover: rgb\(15 23 42 \/ 0\.12\);/);
  assert.match(read("components/agent/agent-panel.tsx"), /intro && !open && !panelOpen && !pathname\.startsWith\("\/sales\/v2\/"\)/);
  const ws = read("features/sales-v2/record-workspace.tsx");
  assert.match(ws, /md:h-dvh md:overflow-hidden" data-sales-v2>/);
  assert.match(ws, /<Tooltip content="Riwayat perubahan"><Button size="sm" intent="ghost" aria-label="Riwayat perubahan"/);
  assert.match(read("features/sales-v2/sheet-sync-dialog.tsx"), /<Tooltip content="Google Sheet Sync">/);
});

test("Crisp's own text reads in Indonesian on Sales V2 (CrispMessagesProvider at the V2 layout)", async () => {
  assert.match(read("app/sales/v2/layout.tsx"), /<SalesCrispMessages>\{children\}<\/SalesCrispMessages>/);
  const src = read("features/sales-v2/crisp-messages.tsx");
  for (const en of ["Add sort", "Ascending", "Sorted by", "Search attributes…", "Add filter", "is not", "View edit history", "Clear value"])
    assert.match(src, new RegExp(`"${en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}": "`), en);
});

test("QA pages 7–10: Kanban scrolls as one board, whole cards drag, Client fills the frozen block", () => {
  const css = read("app/sales/v2/sales-v2.css");
  assert.match(css, /\[data-sales-v2-board\] \.crisp-board-row \{[^}]*overflow: auto/);
  assert.match(css, /\[data-sales-v2-board\] \.crisp-board-col-body \{ overflow: visible;/);
  assert.match(css, /\[data-sales-v2-board\] \.crisp-board-col-header \{ position: sticky; top: 0;/);
  // onPreviewCard makes Crisp stop pointerdown over the card's content: only its edges dragged.
  assert.doesNotMatch(read("features/sales-v2/board-menu.tsx"), /onPreviewCard=/);
  // QA page 11: a sticky header pins below its scroll box's padding, so the row has none on top (cards showed above
  // the pinned headers) and nothing transparent sits between header and cards.
  assert.match(css, /\.crisp-board-row \{[^}]*padding-top: 0;/);
  assert.match(css, /\.crisp-board-col-header \{ position: sticky; top: 0;[^}]*margin-bottom: 0; \}/);
  assert.doesNotMatch(css, /margin-bottom: 6px/);
  // Double-click on a card closes the record panel, on every board (OT, PQ, Account share KanbanBoard).
  assert.match(read("features/sales-v2/board-menu.tsx"), /onDoubleClick=\{[^\n]*\.crisp-board-card[^\n]*onClose\(\)/);
  assert.match(read("features/sales-v2/record-workspace.tsx"), /onClose=\{closePreview\}/);
  const ws = read("features/sales-v2/record-workspace.tsx");
  assert.match(ws, /i === parts\.length - 1 \? "flex-1" : "shrink-0"/);
  assert.match(ws, /i === parts\.length - 1 \? "min-w-0 flex-1" : "shrink-0"/);
});

test("QA page 8: in the table the toolbar's Filter toggles the header ▼ instead of Crisp's builder", () => {
  const ws = read("features/sales-v2/record-workspace.tsx");
  assert.match(ws, /onClickCapture=\{onToolbarClickCapture\}/);
  assert.match(ws, /if \(!tableFilter\) return;[\s\S]*lucide-list-filter[\s\S]*e\.stopPropagation\(\);[\s\S]*setFilterIcons\(!filterIcons\)/);
  assert.match(ws, /showIcon=\{filterIcons\}/);
  assert.match(read("features/sales-v2/header-filter.tsx"), /\(showIcon \|\| active\) &&/);
});

test("QA page 10: a page shared with your module keeps you in it; a direct visit shows its owner", () => {
  assert.equal(navModuleFor("/ta/client-active", "sales")?.key, "sales");
  assert.equal(navModuleFor("/ta/client-active", null)?.key, "ta");
  assert.equal(navModuleFor("/ta/client-active", undefined)?.key, "ta");
  assert.equal(navModuleFor("/pmo/overtime-business-trip", "sales")?.key, "sales");
  assert.equal(navModuleFor("/sales/v2/accounts?record=x", "marketing")?.key, "marketing");
  // Not shared there: the owner, whatever the tab remembers.
  assert.equal(navModuleFor("/ta/pipeline", "sales")?.key, "ta");
  assert.equal(navModuleFor("/sales/v2/opportunity-tracker", "ta")?.key, "sales");
  for (const f of ["components/sidebar.tsx", "components/mobile/tab-bar.tsx"]) assert.match(read(f), /useNavModule\(pathname\)/);
});

test("Deal 360: steps follow the deal downstream and name the stuck hand-offs with their owner", () => {
  const now = Date.parse("2026-10-08T00:00:00Z");
  const base: JourneyInput = {
    now,
    tracker: { status: "win", createdAt: null, closingPrice: 50_000_000 },
    requisition: null, pq: null, applications: [], talents: [], claims: [],
  };
  // A won deal not yet converted: REQ is the current step, Sales owns the action.
  const j0 = buildJourney(base);
  assert.deepEqual(j0.steps.map((s) => s.state), ["done", "current", "todo", "todo", "todo", "todo"]);
  assert.equal(j0.steps[0].detail, "Win");
  assert.deepEqual(j0.actions.map((a) => a.owner), ["Sales"]);
  assert.equal(j0.summary, "Opty · 1 perlu tindakan");

  const full: JourneyInput = {
    ...base,
    requisition: { id: "r", no: "REQ-1", createdAt: null },
    pq: { id: "p", no: "PQ-1" },
    applications: [
      { candidate: "Ayu", candidateId: "c1", hiring: "onboarding", submission: "client_accepted" },
      { candidate: "Bima", candidateId: "c2", hiring: "offering", submission: "client_accepted" },
      { candidate: "Citra", candidateId: "c3", hiring: "cv_sent", submission: null },
    ],
    talents: [
      { onboardingId: "o1", candidateId: "c1", name: "Ayu", position: "QA", employeeId: "e1", assignment: { status: "on_project", price: 20_000_000, marginPercent: 12 } },
      { onboardingId: "o4", candidateId: "c4", name: "Dewi", position: "QA", employeeId: null, assignment: null },
      { onboardingId: "o5", candidateId: "c5", name: "Eka", position: "QA", employeeId: "e5", assignment: null },
    ],
    claims: [
      { id: "k1", no: "OT-1", title: "", status: "forwarded_to_sales", createdAt: "2026-10-06T00:00:00Z", toClient: 1_000_000, invoiced: false },
      { id: "k2", no: "OT-2", title: "", status: "draft", createdAt: "2026-09-20T00:00:00Z", toClient: 500_000, invoiced: false },
      { id: "k3", no: "OT-3", title: "", status: "invoiced", createdAt: "2026-09-01T00:00:00Z", toClient: 2_000_000, invoiced: true },
    ],
  };
  const j = buildJourney(full);
  assert.ok(j.steps.every((s) => s.state === "done"));
  assert.equal(j.steps[2].detail, "3 kandidat · 2 diterima");
  assert.equal(j.steps[5].detail, "rata-rata 12,0%");
  // Bima accepted without onboarding (TA), Dewi not promoted (TA), Eka without assignment (TM), OT-1 waits on Sales,
  // OT-2 Draft 18 days (PMO). The invoiced claim needs nothing.
  assert.deepEqual(j.actions.map((a) => `${a.owner}:${a.key}`), ["TA:ob:c2", "TA:promote:o4", "TM:setup:e5", "Sales:claim:k1", "PMO:claim:k2"]);
  assert.deepEqual(j.money, { deal: 50_000_000, claimed: 3_500_000, invoiced: 1, claims: 3 });

  // Placed but never synced: margin is the current step and Sales is asked to sync.
  const unsynced = buildJourney({ ...full, talents: [{ ...full.talents[0], assignment: { status: "on_project", price: 1, marginPercent: null } }] });
  assert.equal(unsynced.steps[5].state, "current");
  assert.ok(unsynced.actions.some((a) => a.key === "sync" && a.href === "/sales/profitability-tracker"));

  // The panel's ↗ opens this page; Edit stays in the footer.
  const preview = read("features/sales-v2/record-preview.tsx");
  assert.match(preview, /onOpenRecord=\{\(\) => router\.push\(`\/sales\/v2\/opportunity-tracker\/\$\{record\.id\}/);
  assert.match(preview, /<PanelJourney record=\{record\}/);
});

test("Sales email: mail matches its Account by contact, then company domain; threads, templates, addresses", () => {
  const contacts = [
    { id: "c1", clientId: "acme", email: "Budi@Acme.co.id" },
    { id: "c2", clientId: "solo", email: "rina@gmail.com" },
  ];
  const own = new Set(["celerates.co.id"]);
  // A known contact wins; our own side never decides.
  assert.deepEqual(matchAccount(["sales@celerates.co.id", "budi@acme.co.id"], contacts, own), { clientId: "acme", contactId: "c1" });
  // Someone else at the same company: matched by domain, no contact.
  assert.deepEqual(matchAccount(["ceo@acme.co.id"], contacts, own), { clientId: "acme", contactId: null });
  // A free-mail contact matches only by full address; another gmail user is nobody's.
  assert.deepEqual(matchAccount(["rina@gmail.com"], contacts, own), { clientId: "solo", contactId: "c2" });
  assert.equal(matchAccount(["someone@gmail.com", "sales@celerates.co.id"], contacts, own), null);

  assert.equal(threadKey("<c>", "<b>", "<a> <b>"), "<a>");
  assert.equal(threadKey("<c>", "<b>", null), "<b>");
  assert.equal(threadKey("<c>"), "<c>");

  assert.equal(fillTemplate("Halo {{kontak.nama}} dari {{ account.nama }}, {{opty.no}}", { "kontak.nama": "Budi", "account.nama": "PT Acme" }),
    "Halo Budi dari PT Acme, {{opty.no}}");
  assert.deepEqual(parseAddressList("a@x.com, B@Y.co.id; a@x.com bad"), { valid: ["a@x.com", "b@y.co.id"], invalid: ["bad"] });
  assert.equal(snippet("> quoted\nHello   there"), "Hello there");

  // The panel loads mail only when its Email section opens; the Opportunity page has an Email tab.
  assert.match(read("features/sales-v2/account-preview.tsx"), /key: "email", label: "Email", count: record\.emails/);
  assert.match(read("features/sales-v2/deal-page.tsx"), /id: "email", label: "Email"/);
  assert.match(read("instrumentation.ts"), /startMailSync\(\)/);
});

test("AI form fill: only known fields, V1 codes and sane numbers reach the form", () => {
  assert.deepEqual(normalizeAiFill({
    client_name: "  PT Maju Jaya ", service_type_code: "Managed Service", level_code: "senior", headcount_target: "3 orang",
    estimated_duration_months: 6, price_amount: "Rp 15.000.000", price_period_code: "monthly", client_type_code: "partner",
    sales_pic_name: "Injected", headcount_target_extra: 9, requirement_summary: "Butuh 3 backend engineer",
  }), {
    client_name: "PT Maju Jaya", service_type_code: "managed_service", level_code: "senior", headcount_target: "3",
    estimated_duration_months: "6", price_amount: "15000000", price_period_code: "monthly", requirement_summary: "Butuh 3 backend engineer",
  });
  // Out of range or not a code: dropped, never guessed.
  assert.deepEqual(normalizeAiFill({ headcount_target: 0, estimated_duration_months: 999, level_code: "principal" }), {});
  assert.deepEqual(normalizeAiFill("not an object"), {});
  assert.deepEqual(normalizeAiFill(null), {});
  const forms = read("features/sales-v2/forms.tsx");
  assert.match(forms, /fetch\("\/api\/agent\/extract"/);
  assert.match(forms, /onAiFill: aiFill/);
  assert.match(read("app/api/agent/extract/route.ts"), /normalizeAiResult\(out\?\.fields, form\)/);
});

test("AI form fill per form: PQ dates and numbers, account contacts, nothing outside the form", () => {
  assert.deepEqual(normalizeAiResult({
    po_no: " PO/2026/0042 ", start_date: "2026-11-01", end_date: "2026-02-30", approval_date: "1 Nov 2026", business_unit_code: "TM",
    price_amount: "Rp 18.500.000", opty_status_code: "win",
  }, "pq").fields, { po_no: "PO/2026/0042", start_date: "2026-11-01", business_unit_code: "tm", price_amount: "18500000" });
  const acc = normalizeAiResult({
    name: "PT Maju Jaya", industry: "Fintech", contacts: [
      { name: "Budi", role_title: "HR Manager", email: "Budi@MajuJaya.co.id", phone: "0812" }, { name: "", email: "x@y.z" }, { name: "Sari", email: "not-an-email" },
    ],
  }, "account");
  assert.deepEqual(acc.fields, { name: "PT Maju Jaya", industry: "Fintech" });
  assert.deepEqual(acc.contacts, [
    { name: "Budi", role_title: "HR Manager", email: "budi@majujaya.co.id", phone: "0812" },
    { name: "Sari", role_title: undefined, email: undefined, phone: undefined },
  ]);
  assert.deepEqual(normalizeAiResult({ opty_status_code: "Need Action", progress_note: "Klien minta CV minggu depan" }, "opportunity_update").fields,
    { opty_status_code: "need_action", progress_note: "Klien minta CV minggu depan" });
});

test("AI never overwrites what was typed: only empty, default or machine-filled fields take a proposal", () => {
  const current = { client_name: "PT Ketik Sendiri", price_period_code: "monthly", headcount_target: "", level_code: "junior" };
  const r = mergeFill(current, { client_name: "PT AI", price_period_code: "project", headcount_target: "3", level_code: "senior" }, { price_period_code: "monthly" }, ["level_code"]);
  assert.deepEqual(r.draft, { client_name: "PT Ketik Sendiri", price_period_code: "project", headcount_target: "3", level_code: "senior" });
  assert.deepEqual(r.filled.sort(), ["headcount_target", "level_code", "price_period_code"]);
  assert.deepEqual(mergeFill({ a: "x" }, { a: "x" }).filled, [], "an unchanged value is not marked");
});

test("Extension prefill copies the running contract and starts the day after it ends", () => {
  const pq = { client: "PT Maju Jaya", project: "Core Banking", position: "QA Engineer", service: "outsourcing", businessUnit: "tm", level: "middle",
    pricePeriod: "monthly", price: 20_000_000, duration: 6, priority: "p1", salesPic: "Rina" };
  assert.deepEqual(extensionPrefill({ employeeName: "Andi", employeePosition: null, assignment: { start: "2026-05-01", end: "2026-10-31", price: 22_000_000 }, pq, requisition: null }), {
    client_name: "PT Maju Jaya", client_type_code: "existing", project_name: "Core Banking", position_name: "QA Engineer", service_type_code: "outsourcing",
    business_unit_code: "tm", level_code: "middle", headcount_target: "1", priority_code: "p1", price_amount: "22000000", price_period_code: "monthly",
    sales_pic_name: "Rina", estimated_duration_months: "6", start_date: "2026-11-01", end_date: "2027-04-30",
    notes: "Perpanjangan Andi, kontrak sebelumnya 2026-05-01 s/d 2026-10-31.",
  });
  // No PQ: the requisition still names client and role; no contract end, no dates.
  assert.deepEqual(extensionPrefill({ employeeName: null, employeePosition: "Dev", assignment: null, pq: null,
    requisition: { client: "PT B", position: "Backend", service: null, level: "senior", salesPic: null } }),
  { client_name: "PT B", client_type_code: "existing", position_name: "Backend", level_code: "senior", headcount_target: "1" });
});

test("New PQ keeps PO / PKS numbers in Notes; Edit Opportunity proposals list only real changes", () => {
  assert.deepEqual(pqCreateFields({ client_name: "PT A", po_no: "PO-1", pks_no: "PKS-9", project_details: "QA 2 orang", sales_type_code: "farming" }),
    { client_name: "PT A", notes: "No PO: PO-1 · No PKS: PKS-9\nQA 2 orang" });
  const rows = updateSuggestions(
    { opty_status_code: "proposal_sent", headcount_target: "3", progress_notes: "2026-10-01: kirim proposal", last_communication_date: "2026-10-01" },
    { opty_status_code: "need_action", headcount_target: "3", progress_note: "Klien minta revisi harga", dropped_reason: "x" },
    "2026-10-07", "2026-10-08",
  );
  assert.deepEqual(rows.map((r) => [r.key, r.proposed]), [
    ["opty_status_code", "need_action"],
    ["progress_notes", "2026-10-08: Klien minta revisi harga\n2026-10-01: kirim proposal"],
    ["last_communication_date", "2026-10-07"],
  ]);
  const forms = read("features/sales-v2/forms.tsx");
  assert.match(forms, /<UpdateFromEmail record=\{record\}/);
  assert.match(forms, /onValueChange=\{onPick\}/);
  assert.match(read("features/sales-v2/pq-forms.tsx"), /<AiFill form="pq" file/);
  assert.match(read("features/sales-v2/account-preview.tsx"), /createAccountContacts\(name, keep\)/);
  assert.match(read("features/sales-v2/email-panel.tsx"), /Jadikan kontak/);
});

test("QA 2026-10-09: Sales PIC is picked from Sales accounts in every Sales form, with a 'Deal saya' view", async () => {
  const forms = read("features/sales-v2/forms.tsx");
  const pq = read("features/sales-v2/pq-forms.tsx");
  assert.equal((forms.match(/<SalesPicSelect options=\{options\.salesPics\}/g) ?? []).length, 3);
  assert.equal((pq.match(/<SalesPicSelect options=\{options\.picNames\}/g) ?? []).length, 2);
  assert.doesNotMatch(forms + pq, /<Input name="sales_pic_name"|PicSelect name="sales_pic_name"/);
  assert.match(read("features/sales-v2/data.ts"), /d\.key = 'sales' AND ua\.level IN \('editor', 'full'\)/);
  assert.match(read("features/sales-v2/pq-data.ts"), /loadSalesPics\(\)/);
  const { withMyDeals, BUILT_IN_VIEWS } = await import("../src/features/sales-v2/model");
  assert.equal(withMyDeals(BUILT_IN_VIEWS, null), BUILT_IN_VIEWS);
  const views = withMyDeals(BUILT_IN_VIEWS, "Tyas");
  assert.deepEqual(views.map((v) => v.id).slice(0, 3), ["all", "mine", "active"]);
  assert.deepEqual(views[1].state.filters[0], { id: "bm", key: "salesPic", op: "is", value: "Tyas" });
});

test("QA 2026-10-09 sheet import: columns match themselves, values parse the Indonesian way, rows get a status", async () => {
  const m = await import("../src/features/sales-v2/sheet-import");
  const headers = ["No. Opty", "Qualified?", "Nama Klien ", "Jenis Layanan", "Status", "Est. Nilai Deal", "Tipe Klien", "PIC Sales", "Tgl Komunikasi Terakhir", "BANT", "Posisi", "Level", "Jumlah Orang", "Rate / bulan", "Region"];
  const match = m.matchColumns(headers, m.SHEET_FIELDS.ot);
  assert.equal(match["Nama Klien "]?.field, "client_name");
  assert.equal(match["Rate / bulan"]?.field, "price_amount");
  assert.equal(match["Region"], null);
  assert.equal(Object.values(match).filter(Boolean).length, 14);
  assert.equal(m.matchColumns(["Client Name"], m.SHEET_FIELDS.ot, { "Client Name": "" })["Client Name"], null, "a saved 'ignore' wins");
  assert.deepEqual(m.uniqueHeaders(["Status", "Status", ""]), ["Status", "Status (B)", "Kolom C"]);

  for (const [v, want] of [["Rp 15.000.000", 15000000], ["15jt", 15000000], ["15,5 juta", 15500000], ["4.500.000", 4500000], [12500000.5, 12500001], ["", null]] as const)
    assert.deepEqual(m.parseMoney(v), { ok: true, value: want }, String(v));
  assert.equal(m.parseMoney("USD 2,000").ok, false);
  assert.equal(m.parseMoney("TBD").ok, false);
  assert.deepEqual(m.parseDate("01/10/2026"), { ok: true, value: "2026-10-01" });
  assert.deepEqual(m.parseDate("01/10/2026", "mdy"), { ok: true, value: "2026-01-10" });
  assert.deepEqual(m.parseDate("1 Okt 2026"), { ok: true, value: "2026-10-01" });
  assert.deepEqual(m.parseDate("Oct 1, 2026"), { ok: true, value: "2026-10-01" });
  assert.deepEqual(m.parseDate(46296), { ok: true, value: "2026-10-01" });
  assert.equal(m.parseDate("kemarin").ok, false);
  assert.equal(m.parseDate("31/02/2026").ok, false);
  assert.deepEqual(m.parseCount("3 orang"), { ok: true, value: 3 });
  assert.equal(m.parseCount("2-3").ok, false);
  assert.deepEqual(m.parseScore("4/5"), { ok: true, value: 4 });

  const cols = Object.fromEntries(headers.map((h) => [h, match[h]?.field ?? ""]));
  const rows: unknown[][] = [
    ["", "Ya", "UJI A", "Managed Services", "Won", "Rp 540.000.000", "Lama", "Tyas", "1 Okt 2026", "4", "Dev", "Sr.", "3 orang", "15jt"],
    ["", "x", "UJI B", "RPO", "Closed Lost", "", "Baru", "Budi S.", "kemarin", "High", "SPG", "C-Level", "2-3", "USD 2,000"],
    ["Q4 2026 ▼"],
    ["OPTY-1", "Yes", "UJI C", "Outsourcing", "Win", "", "Existing", "Tyas", "", "", "", "", "", "20000000"],
    ["OPTY-2", "", "UJI D", "", "", "", "", "Tyas", "", "", "", "", "", ""],
    ["OPTY-2", "", "UJI E", "", "", "", "", "Tyas", "", "", "", "", "", ""],
    ["", "Ya", "UJI F", "Outsourcing", "Win", "", "", "Tyas", "", "", "Dev", "", "", ""],
  ];
  const plan = m.planImport({ kind: "ot", headers, rows, columns: cols, values: {}, dateOrder: "dmy", pics: ["Tyas"], existing: [
    { id: "1", key: "OPTY-1", values: { client_name: "UJI C", price_amount: 15000000, opty_status_code: "win", sales_pic_name: "Tyas", service_type_code: "outsourcing", client_type_code: "existing", sales_qualified: true } },
    { id: "9", key: "OPTY-9", values: { client_name: "UJI F", position_name: "Dev", sales_pic_name: "Tyas" } },
  ] });
  const st = (n: number) => plan.rows.find((r) => r.row === n)!;
  assert.equal(st(2).status, "create");
  assert.deepEqual(st(2).values, { sales_qualified: true, client_name: "UJI A", service_type_code: "managed_service", opty_status_code: "win", estimated_deal_amount: 540000000,
    client_type_code: "existing", sales_pic_name: "Tyas", last_communication_date: "2026-10-01", bante_score: 4, position_name: "Dev", level_code: "senior", headcount_target: 3, price_amount: 15000000 });
  assert.equal(st(3).status, "error");
  for (const x of ["x", "Budi S.", "kemarin", "High", "C-Level", "2-3", "Rupiah"]) assert.ok(st(3).issues.some((i) => i.includes(x)), x);
  assert.equal(st(4).status, "skip");
  assert.equal(st(5).status, "update");
  assert.deepEqual(st(5).changes, [{ field: "price_amount", old: "15000000", new: "20000000" }], "only stated, different values; blanks don't clear");
  assert.equal(st(6).status, "error");
  assert.match(st(6).issues.join(), /lebih dari sekali/);
  assert.equal(st(8).status, "skip", "no Opty No but the same client, position and PIC: not created twice");
  assert.ok(plan.distinct.some((d) => d.raw === "x" && d.code === null));
  const mapped = m.planImport({ kind: "ot", headers, rows: [rows[1]], columns: cols, dateOrder: "dmy", pics: ["Tyas"], existing: [],
    values: { sales_qualified: { x: "true" }, sales_pic_name: { [m.valueKey("Budi S.")]: m.KEEP }, level_code: { [m.valueKey("C-Level")]: "vp" } } });
  assert.deepEqual(mapped.rows[0].issues.filter((i) => /belum dipetakan/.test(i)), [], "the person's value choices resolve the rest");

  // A saved V1 mapping still reads; column choices belong to one tab.
  assert.deepEqual(m.readConfig('{"Nama Klien ":"client_name"}', "Pipeline").columns, { "Nama Klien ": "client_name" });
  const v2 = JSON.stringify({ v: 2, tab: "Pipeline", columns: { A: "client_name" }, values: { level_code: { sr: "senior" } }, dateOrder: "mdy" });
  assert.deepEqual(m.readConfig(v2, "Lebar"), { v: 2, tab: "Lebar", columns: {}, values: { level_code: { sr: "senior" } }, dateOrder: "mdy" });
});

test("QA 2026-10-09 sheet push: only mapped cells of rows found by key, the sheet's own spelling, nothing cleared", async () => {
  const m = await import("../src/features/sales-v2/sheet-import");
  const headers = ["Opty No", "Client Name", "Status", "Price", "Catatan tim"];
  const columns = { "Opty No": "opty_no", "Client Name": "client_name", Status: "opty_status_code", Price: "price_amount", "Catatan tim": "" };
  const rows = [["OPTY-1", "PT A", "WIN", 15000000, "jangan diubah"], ["OPTY-2", "PT B", "Closed Lost", "", "x"]];
  const push = m.planPush({ kind: "ot", headers, rows, columns, values: {}, dateOrder: "dmy", pics: [], records: [
    { id: "1", key: "OPTY-1", values: { client_name: "PT A", opty_status_code: "win", price_amount: 15000000 } },
    { id: "2", key: "OPTY-2", values: { client_name: "=HYPERLINK(1)", opty_status_code: "win", price_amount: null } },
    { id: "3", key: "OPTY-3", values: { client_name: "PT C", opty_status_code: "dropped" } },
  ] });
  assert.deepEqual(push.cells, [
    { row: 3, col: 1, old: "PT B", value: "'=HYPERLINK(1)" },
    { row: 3, col: 2, old: "Closed Lost", value: "WIN" },
  ]);
  assert.deepEqual(push.append, [["OPTY-3", "PT C", "Closed Lost", ""]], "only up to the last mapped column");
  assert.equal(m.planPush({ kind: "ot", headers, rows, columns: { "Client Name": "client_name" }, values: {}, dateOrder: "dmy", pics: [], records: [] }).keyMissing, true);
  const actions = read("features/sales-v2/sheet-import-actions.ts");
  for (const fn of ["importPreview", "importCommit", "pushPreview", "pushCommit", "aiMapColumns"])
    assert.match(actions, new RegExp(`export async function ${fn}\\([^\\n]*\\{\\n  await requireActor\\(\\);\\n  await requireSalesSheetSync\\(\\);`), fn);
  assert.equal((actions.match(/await requireDivisionAccess\("sales", "full"\)/g) ?? []).length, 2, "push needs Sales Full");
  const core = read("features/sales-v2/sheet-import-core.ts");
  assert.match(core, /db\.transaction/);
  assert.match(core, /tx\.insert\(recordFieldChanges\)/);
  for (const f of ["app/sales/sheet-sync/actions.ts", "app/sales/opportunity-tracker/sheet-sync/actions.ts"]) assert.doesNotMatch(read(f), /clearSheetRange\(/, `${f}: V1's clearing push is gone`);
});

test("QA 2026-10-09 app shell: view preferences parse safely; layout renders the chosen shell; loading skeletons exist", async () => {
  const { parseUiPrefs, serializeUiPrefs, DEFAULT_UI_PREFS } = await import("../src/lib/ui-preferences");
  assert.deepEqual(parseUiPrefs(undefined), DEFAULT_UI_PREFS);
  assert.deepEqual(parseUiPrefs("shell=classic;sidebar=dark;look=hybrid"), { shell: "classic", sidebar: "dark", look: "hybrid" });
  assert.deepEqual(parseUiPrefs("shell=<script>;sidebar=purple;x=1"), DEFAULT_UI_PREFS, "unknown values fall back");
  assert.equal(serializeUiPrefs({ shell: "crisp", sidebar: "light", look: "v1" }), "shell=crisp;sidebar=light;look=v1");
  const layout = read("app/layout.tsx");
  assert.match(layout, /prefs\.shell === "crisp" \? \(/);
  assert.match(layout, /<ErpShell prefs=\{prefs\}>\{children\}<\/ErpShell>/);
  assert.match(read("app/ui-preferences-actions.ts"), /export async function setUiPreference[^\n]*\{\n  await requireActor\(\);\n  if \(!isUiPref\(key, value\)\) return;/);
  for (const f of ["app/loading.tsx", "app/sales/v2/loading.tsx", "app/sales/v2/opportunity-tracker/[id]/loading.tsx"]) assert.match(read(f), /Skeleton/, f);
  const shell = read("components/erp-shell.tsx");
  assert.match(shell, /<Command open=\{commandOpen\}[^>]*items=\{commandItems\}/);
  assert.match(shell, /\{pathname !== "\/" && <Button size="sm" intent="ghost" onClick=\{\(\) => openAgent\(\)\}>/, "header: Tanya Agent, except on Beranda (QA page 22)");
  assert.doesNotMatch(shell, /AI Assistant/, "sidebar: no AI Assistant card (QA page 22)");
  // No hook after the signed-out early return (React #310 took the whole shell down in qa23).
  const afterReturn = shell.slice(shell.indexOf('if (status !== "authenticated") return <main'), shell.indexOf("  return (\n    <ShellContext.Provider"));
  assert.doesNotMatch(afterReturn, /\buse[A-Z]\w*\(/, "ErpShell: hooks before the early return");
  assert.match(read("features/home/home-ask.tsx"), /openAgent\(\{ ask: q\.trim\(\), full: true \}\)/, "Beranda asks full page");
  assert.match(read("app/crisp-theme.css"), /\[data-erp-shell-main\]:has\(> \[data-agent-slot\] > \*\)/);
  assert.match(read("app/api/presence/route.ts"), /if \(!user\?\.id\) return NextResponse\.json\(\{ error: "unauthorized" \}, \{ status: 401 \}\)/, "presence: signed-in only");
  assert.match(shell, /<ProfileMenu prefs=\{prefs\} \/>/);
});

test("QA 2026-10-09 workflows: schedules in WIB, settings cleaned per template, mutations need Automation Full", async () => {
  const { nextRun, cleanConfig, templateOf, describeSchedule, TEMPLATES } = await import("../src/lib/workflows/templates");
  // Friday 2026-10-09 10:00 WIB = 03:00 UTC.
  const fri10 = new Date("2026-10-09T03:00:00Z");
  assert.equal(nextRun({ every: "day", at: "09:30", weekdaysOnly: true }, fri10).toISOString(), "2026-10-12T02:30:00.000Z", "after Friday's 09:30 comes Monday's");
  assert.equal(nextRun({ every: "day", at: "11:00" }, fri10).toISOString(), "2026-10-09T04:00:00.000Z", "later the same day");
  assert.equal(nextRun({ every: "day", at: "09:30" }, fri10).toISOString(), "2026-10-10T02:30:00.000Z", "Saturday when weekends count");
  assert.equal(nextRun({ every: "week", weekday: 1, at: "08:00" }, fri10).toISOString(), "2026-10-12T01:00:00.000Z");
  assert.equal(nextRun({ every: "hours", hours: 6 }, fri10).toISOString(), "2026-10-09T09:00:00.000Z");
  assert.equal(describeSchedule({ every: "day", at: "09:30", weekdaysOnly: true }), "Setiap hari kerja 09:30");
  assert.equal(TEMPLATES.length, 4);
  const t = templateOf("stale_deals")!;
  assert.deepEqual(cleanConfig(t, { schedule: { every: "day", at: "25:99" }, days: 500, evil: "x" }),
    { schedule: { every: "day", at: "08:00", weekdaysOnly: true }, days: 14 }, "bad values fall back to the template's, unknown keys dropped");
  assert.equal(cleanConfig(templateOf("sheet_sync")!, { tracker: "pq", schedule: { every: "hours", hours: 99 } }).schedule.hours, 24);
  const actions = read("app/automation/workflows/actions.ts");
  for (const fn of ["createWorkflow", "updateWorkflow", "setWorkflowEnabled", "runWorkflowNow", "deleteWorkflow"])
    assert.match(actions, new RegExp(`export async function ${fn}\\([^\\n]*\\{\\n  await requireActor\\(\\);\\n  try \\{\\n    (const actor = )?await requireDivisionAccess\\("automation", "full"\\);`), fn);
  const engine = read("lib/workflows/engine.ts");
  assert.match(engine, /lte\(workflows\.next_run_at, sql`now\(\)`\)\)\)\.returning/, "a scheduled run is claimed once, atomically");
  assert.doesNotMatch(engine, /sendMail|systemTransport|inviteMail/, "workflows send no email during the pilot");
  assert.match(read("instrumentation.ts"), /startWorkflowScheduler\(\)/);
});

test("QA doc page 14: a used account is deactivated, not deleted; the audit follows the outcome", () => {
  const src = read("app/access-management/actions.ts");
  const del = src.slice(src.indexOf("export async function deleteUser"), src.indexOf("export async function updateUserInfo"));
  assert.match(del, /db\.transaction/);
  assert.match(del, /code === "23503"/);
  assert.ok(del.indexOf('auditAccess("user_delete"') > del.indexOf("db.transaction"), "audit only after the delete succeeded");
});
