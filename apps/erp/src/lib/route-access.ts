// Route-level module gate for backoffice pages (doc 22 §2.1, R1.1). Pure and edge-safe (middleware imports it).
// It mirrors module-access.ts RULES per route: a page of a division module needs any level of one of the
// divisions that list the route (collab submodules are shared), Owner-only pages need the Owner, and shared
// pages need only an active backoffice session. It is coarse: record pages and every server action still
// check their own authority. tests/route-access.test.ts keeps this table in step with MODULES.
export type RouteClaims = {
  isOwner?: boolean;
  accountType?: string;
  access?: { divisionKey: string; level: string }[];
};

export type RouteGate =
  | { kind: "division"; divisions: string[] }
  | { kind: "owner" }
  /** Owner or PMO full (Access Management, Timesheet administration). */
  | { kind: "pmo-full" }
  | { kind: "backoffice" };

// Longest prefix wins. Routes not listed are shared backoffice surfaces (Beranda, Tinjau, Task Board, Files, …).
const ROUTES: [string, RouteGate][] = [
  ["/marketing", { kind: "division", divisions: ["marketing"] }],
  ["/sales", { kind: "division", divisions: ["sales"] }],
  ["/sales/accounts", { kind: "division", divisions: ["sales", "marketing"] }],
  ["/sales/v2/accounts", { kind: "division", divisions: ["sales", "marketing"] }],
  ["/sales/v2/client-active", { kind: "division", divisions: ["ta", "sales"] }],
  ["/sales/v2/profitability-tracker", { kind: "division", divisions: ["sales", "tm", "pmo"] }],
  ["/sales/profitability-tracker", { kind: "division", divisions: ["sales", "tm", "pmo"] }],
  ["/ta", { kind: "division", divisions: ["ta"] }],
  ["/ta/client-active", { kind: "division", divisions: ["ta", "sales"] }],
  ["/hr", { kind: "division", divisions: ["hr"] }],
  ["/tm", { kind: "division", divisions: ["tm"] }],
  ["/tm/special-notes", { kind: "division", divisions: ["tm", "hr"] }],
  ["/pmo", { kind: "division", divisions: ["pmo"] }],
  ["/pmo/overtime-business-trip", { kind: "division", divisions: ["pmo", "sales", "hr", "finance"] }],
  ["/finance", { kind: "division", divisions: ["finance", "pmo"] }],
  ["/school", { kind: "division", divisions: ["school"] }],
  ["/automation", { kind: "division", divisions: ["automation"] }],
  ["/executive-dashboard", { kind: "owner" }],
  ["/intelligence", { kind: "owner" }],
  ["/access-management", { kind: "pmo-full" }],
  ["/timesheet", { kind: "pmo-full" }],
];

export function routeGate(pathname: string): RouteGate {
  const clean = pathname.split(/[?#]/)[0];
  let best: [string, RouteGate] | null = null;
  for (const entry of ROUTES)
    if ((clean === entry[0] || clean.startsWith(entry[0] + "/")) && (!best || entry[0].length > best[0].length)) best = entry;
  return best ? best[1] : { kind: "backoffice" };
}

const LEVELS = new Set(["viewer", "editor", "full"]);

/** May this backoffice session open the route? (The caller has already checked it is an active backoffice user.) */
export function canOpenRoute(claims: RouteClaims, pathname: string): boolean {
  if ((claims.accountType ?? "backoffice") === "talent" && !claims.isOwner) return false;
  const gate = routeGate(pathname);
  if (gate.kind === "backoffice" || claims.isOwner) return true;
  if (gate.kind === "owner") return false;
  const access = claims.access ?? [];
  if (gate.kind === "pmo-full") return access.some((a) => a.divisionKey === "pmo" && a.level === "full");
  return access.some((a) => gate.divisions.includes(a.divisionKey) && LEVELS.has(a.level));
}
