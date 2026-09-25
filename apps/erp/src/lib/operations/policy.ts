export const MODULES = {
  marketing: "Marketing",
  sales: "Sales",
  ta: "Talent Acquisition",
  hr: "Human Resources",
  tm: "Talent Management",
  pmo: "PMO",
  finance: "Finance",
  timesheet: "Timesheet",
  attendance: "Attendance",
  school: "School",
  automation: "Automation",
  general: "Lintas Modul",
} as const;
export type Module = keyof typeof MODULES;
export type OperationalActor = {
  id?: string;
  status?: string;
  isOwner?: boolean;
  accountType?: string;
  access?: { divisionKey: string; level: string }[];
};
export type Context = { path: string; module: Module; label: string };
// Only paths observed in the ERP. No search/hash, free text, email or encoded path persists. Known record UUIDs are retained.
export function operationalContext(input: unknown): Context {
  const raw = typeof input === "string" ? input.split(/[?#]/)[0] : "/";
  if (!/^\/[a-z0-9/-]*$/.test(raw) || raw.includes("//") || raw.length > 300)
    return { path: "/", module: "general", label: MODULES.general };
  const segment = raw.split("/")[1];
  const module: Module = Object.hasOwn(MODULES, segment)
    ? (segment as Module)
    : "general";
  const known =
    /^(dashboard|opportunity-tracker|accounts|contracts|invoices|candidates|client-active|special-notes|overtime-business-trip|profitability-tracker|edit|new|converter|requests|approvals|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
  const path = raw
    .split("/")
    .slice(2)
    .filter(Boolean)
    .every((s) => known.test(s))
    ? raw
    : "/" + segment;
  return {
    path:
      module === "general"
        ? ["feature-requests", "tasks", "executive-dashboard"].includes(segment)
          ? "/" + segment
          : "/"
        : path,
    module,
    label: MODULES[module],
  };
}
export function canReadModule(
  actor: OperationalActor,
  module: Module,
): boolean {
  if (!actor.id || actor.status !== "active") return false;
  if (actor.isOwner === true) return true;
  return (
    actor.accountType === "backoffice" &&
    (actor.access ?? []).some(
      (a) =>
        a.divisionKey === module &&
        ["viewer", "editor", "full"].includes(a.level),
    )
  );
}
export function selectedModules(
  actor: OperationalActor,
  context: Context,
): Module[] {
  if (context.module !== "general" && !canReadModule(actor, context.module))
    return [];
  const related: Partial<Record<Module, Module[]>> = {
    marketing: ["sales"],
    sales: ["ta"],
    pmo: ["finance"],
    finance: ["pmo"],
  };
  const requested =
    context.module === "general"
      ? (Object.keys(MODULES) as Module[])
      : [context.module, ...(related[context.module] ?? [])];
  return requested.filter((m) => canReadModule(actor, m));
}
export type OperationalGroup = {
  key: string;
  module: Module;
  title: string;
  rule: string;
  source: string;
  unit: string;
  count: number;
  href: string;
  action: string;
  items: { id: string; label: string; href: string }[];
};
export type OperationalContextResponse = {
  version: 1;
  context: Context;
  asOf: string;
  groups: OperationalGroup[];
  coverage: string;
};
