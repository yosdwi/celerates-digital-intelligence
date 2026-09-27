// MS1: the canonical module access function must reproduce what the desktop sidebar and Home did before
// (doc 18 §14), agree with the signal read policy for division modules, and give the mobile shell only
// modules the user can open.
import test from "node:test";
import assert from "node:assert/strict";
import { MODULES } from "../src/lib/modules-config";
import { navModules, openModules, resolveModules, type AccessClaims } from "../src/lib/module-access";
import { canReadModule, MODULES as SIGNAL_MODULES } from "../src/lib/operations/policy";

// Verbatim copies of the pre-MS1 rules (sidebar.tsx and app/page.tsx) to pin behaviour.
function legacySidebar(c: AccessClaims) {
  const isOwner = Boolean(c.isOwner);
  const isTalent = c.accountType === "talent";
  const access = c.access ?? [];
  const hasPmoFull = isOwner || access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  const visible = isTalent
    ? MODULES.filter((m) => m.key === "timesheet" || m.key === "attendance")
    : MODULES.filter((m) => m.key !== "feature-requests" && (m.key !== "executive" || isOwner) && (m.key !== "timesheet" || hasPmoFull));
  return visible.map((m) => ({
    key: m.key,
    subPages: (m.key === "timesheet" && !hasPmoFull && !c.canUseTimesheetConverter ? m.subPages.filter((s) => s.href !== "/timesheet/converter") : m.subPages).map((s) => s.href),
  }));
}
const GATED = new Set(["marketing", "sales", "ta", "hr", "tm", "pmo", "finance", "school"]);
function legacyHomeAccess(c: AccessClaims, key: string) {
  if (!GATED.has(key)) return true;
  return Boolean(c.isOwner) || (c.access ?? []).some((a) => a.divisionKey === key);
}

const actors: Record<string, AccessClaims> = {
  owner: { isOwner: true, accountType: "backoffice", access: [] },
  salesEditor: { accountType: "backoffice", access: [{ divisionKey: "sales", level: "editor" }, { divisionKey: "ta", level: "viewer" }] },
  pmoFull: { accountType: "backoffice", access: [{ divisionKey: "pmo", level: "full" }, { divisionKey: "finance", level: "viewer" }] },
  pmoEditorConverter: { accountType: "backoffice", access: [{ divisionKey: "pmo", level: "editor" }], canUseTimesheetConverter: true },
  noAccess: { accountType: "backoffice", access: [] },
  talent: { accountType: "talent", access: [] },
};

test("sidebar behaviour is preserved: same modules and submodules for every actor", () => {
  for (const [name, c] of Object.entries(actors)) {
    const now = navModules(c).map((m) => ({ key: m.key, subPages: m.subPages.map((s) => s.href) }));
    assert.deepEqual(now, legacySidebar(c), name);
  }
});

test("desktop Home locking is preserved, except automation now follows its division like its actions", () => {
  for (const [name, c] of Object.entries(actors)) {
    if (c.accountType === "talent") continue; // Home was never shown to talents
    for (const m of navModules(c)) {
      const legacy = legacyHomeAccess(c, m.key);
      if (m.key === "automation") assert.equal(m.access !== "none", Boolean(c.isOwner) || (c.access ?? []).some((a) => a.divisionKey === "automation"), name);
      else assert.equal(m.access !== "none", legacy, `${name}:${m.key}`);
    }
  }
});

test("division access agrees with the signal read policy", () => {
  const divisions = Object.keys(SIGNAL_MODULES).filter((k) => !["general", "timesheet", "attendance"].includes(k)) as (keyof typeof SIGNAL_MODULES)[];
  for (const [name, c] of Object.entries(actors)) {
    const resolved = resolveModules(c);
    for (const d of divisions) {
      const mod = resolved.find((m) => m.key === d);
      if (!mod) continue;
      const signal = canReadModule({ id: "u", status: "active", ...c }, d);
      assert.equal(mod.access !== "none", signal, `${name}:${d}`);
    }
  }
});

test("mobile shows only openable modules, with real levels and groups", () => {
  const sales = openModules(actors.salesEditor);
  assert.deepEqual(sales.filter((m) => m.group === "bisnis").map((m) => [m.key, m.access]), [["sales", "editor"], ["ta", "viewer"]]);
  assert.ok(sales.every((m) => m.access !== "none"));
  assert.deepEqual(openModules(actors.talent).map((m) => [m.key, m.access]), [["timesheet", "self"], ["attendance", "self"]]);
  const owner = openModules(actors.owner);
  assert.deepEqual(owner.filter((m) => m.group === "bisnis").map((m) => m.key), ["marketing", "sales", "ta", "hr", "tm", "pmo", "finance"]);
  assert.ok(!owner.some((m) => m.key === "feature-requests"), "Feature Request is reached through Masukan");
  assert.ok(!openModules(actors.noAccess).some((m) => m.group === "bisnis"));
});
