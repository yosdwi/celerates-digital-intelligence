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
  const ws = read("features/sales-v2/record-workspace.tsx");
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
  assert.match(agent, /setRightRail\(\{ agentOpen: open \}\)/);
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
  for (const f of v1Fields) assert.match(edit, f === "position_name" ? /<PositionInput\b/ : new RegExp(`name="${f}"`), f);
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
  assert.match(read("app/sales/v2/sales-v2.css"), /--crisp-bg-brand-solid: #194667/);
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
  leads: 0, opportunities: 2, activeOpportunities: 1, contracts: 0, monthlyValue: 0, invoices: 3, overdueInvoices: 0,
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
