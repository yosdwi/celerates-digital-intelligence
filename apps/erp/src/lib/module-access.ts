// One canonical answer to "which modules does this user see, and with what access?" (doc 18 §14).
// Pure over the session claims, so the desktop sidebar, desktop Home, the mobile shell and tests share it.
// It decides VISIBILITY only. Authority stays in the server actions (requireDivisionAccess and the
// module-specific guards) and, for the pilot, in middleware.ts.
import { MODULES, type ModuleConfig, type SubPage } from "./modules-config";

export type AccessClaims = {
  isOwner?: boolean;
  accountType?: string;
  access?: { divisionKey: string; level: string }[];
  canUseTimesheetConverter?: boolean;
};

/** full/editor/viewer: division level (Owner = full). self: self-service only. open: open to every backoffice user. */
export type ModuleAccess = "full" | "editor" | "viewer" | "self" | "open" | "none";
export type ModuleGroup = "bisnis" | "operasional";

type Gate =
  | { kind: "division"; division: string }
  | { kind: "timesheet" }
  | { kind: "everyone" }
  | { kind: "backoffice" }
  | { kind: "owner" };

type Rule = { group: ModuleGroup; gate: Gate; nav?: false; desktopOnly?: string[] };

// The seven core business modules are divisions; the rest are shared/operational (doc 18 §11).
// desktopOnly: routes kept on desktop in the mobile IA (admin and power tools, doc 18 §11.5).
const RULES: Record<string, Rule> = {
  marketing: { group: "bisnis", gate: { kind: "division", division: "marketing" } },
  sales: { group: "bisnis", gate: { kind: "division", division: "sales" } },
  ta: { group: "bisnis", gate: { kind: "division", division: "ta" } },
  hr: { group: "bisnis", gate: { kind: "division", division: "hr" }, desktopOnly: ["/hr/attendance-settings"] },
  tm: { group: "bisnis", gate: { kind: "division", division: "tm" }, desktopOnly: ["/tm/cogs-calculator", "/tm/database-salary"] },
  pmo: { group: "bisnis", gate: { kind: "division", division: "pmo" } },
  finance: { group: "bisnis", gate: { kind: "division", division: "finance" } },
  timesheet: { group: "operasional", gate: { kind: "timesheet" }, desktopOnly: ["/timesheet/converter"] },
  attendance: { group: "operasional", gate: { kind: "everyone" } },
  executive: { group: "operasional", gate: { kind: "owner" } },
  tasks: { group: "operasional", gate: { kind: "backoffice" } },
  files: { group: "operasional", gate: { kind: "backoffice" } },
  ttd: { group: "operasional", gate: { kind: "backoffice" } },
  // Reached through Masukan in the Agent (ADR-017), not through navigation.
  "feature-requests": { group: "operasional", gate: { kind: "backoffice" }, nav: false },
  school: { group: "operasional", gate: { kind: "division", division: "school" } },
  automation: { group: "operasional", gate: { kind: "division", division: "automation" }, desktopOnly: ["/automation/reminders", "/automation/documents"] },
};

export type ResolvedModule = {
  key: string;
  config: ModuleConfig;
  group: ModuleGroup;
  /** Shown in navigation (sidebar, Modul directory). A division module the user lacks stays listed on desktop, locked. */
  inNav: boolean;
  access: ModuleAccess;
  /** Submodules this user may be routed to (the Timesheet converter is flag-gated). */
  subPages: SubPage[];
  /** First route to open. */
  href: string;
  desktopOnly: string[];
};

const LEVELS = new Set(["viewer", "editor", "full"]);

export function divisionLevel(claims: AccessClaims, division: string): "full" | "editor" | "viewer" | null {
  if (claims.isOwner) return "full";
  if ((claims.accountType ?? "backoffice") === "talent") return null;
  const level = claims.access?.find((a) => a.divisionKey === division)?.level;
  return level && LEVELS.has(level) ? (level as "full" | "editor" | "viewer") : null;
}

export function resolveModules(claims: AccessClaims): ResolvedModule[] {
  const isOwner = Boolean(claims.isOwner);
  const isTalent = (claims.accountType ?? "backoffice") === "talent";
  const pmoFull = divisionLevel(claims, "pmo") === "full";
  return MODULES.filter((m) => RULES[m.key]).map((config) => {
    const rule = RULES[config.key];
    const gate = rule.gate;
    let access: ModuleAccess = "none";
    let inNav = rule.nav !== false;
    if (gate.kind === "division") {
      access = divisionLevel(claims, gate.division) ?? "none";
      inNav = inNav && !isTalent;
    } else if (gate.kind === "timesheet") {
      access = isTalent ? "self" : pmoFull ? "full" : "none";
      inNav = inNav && access !== "none";
    } else if (gate.kind === "everyone") {
      access = "self";
    } else if (gate.kind === "backoffice") {
      access = isTalent ? "none" : isOwner ? "full" : "open";
      inNav = inNav && !isTalent;
    } else if (gate.kind === "owner") {
      access = isOwner ? "full" : "none";
      inNav = inNav && isOwner;
    }
    const subPages =
      config.key === "timesheet" && !pmoFull && !claims.canUseTimesheetConverter
        ? config.subPages.filter((s) => s.href !== "/timesheet/converter")
        : config.subPages;
    return {
      key: config.key,
      config,
      group: rule.group,
      inNav,
      access,
      subPages,
      href: subPages[0]?.href ?? config.basePath,
      desktopOnly: rule.desktopOnly ?? [],
    };
  });
}

/** Modules listed in navigation (desktop sidebar and Home keep listing division modules without access, locked). */
export const navModules = (claims: AccessClaims) => resolveModules(claims).filter((m) => m.inNav);
/** Modules the user can actually open: the mobile launcher and directory show only these. */
export const openModules = (claims: AccessClaims) => navModules(claims).filter((m) => m.access !== "none");

/** Session → claims, tolerant of the untyped NextAuth session user. */
export function claimsOf(user: unknown): AccessClaims {
  const u = (user ?? {}) as Record<string, unknown>;
  return {
    isOwner: Boolean(u.isOwner),
    accountType: typeof u.accountType === "string" ? u.accountType : "backoffice",
    access: Array.isArray(u.access) ? (u.access as AccessClaims["access"]) : [],
    canUseTimesheetConverter: Boolean(u.canUseTimesheetConverter),
  };
}

export const ACCESS_LABEL: Record<ModuleAccess, string> = {
  full: "Penuh",
  editor: "Editor",
  viewer: "Lihat",
  self: "Mandiri",
  open: "Terbuka",
  none: "Tanpa akses",
};

/** Module owning a route (longest basePath match), for context labels. */
export function moduleForPath(pathname: string): ModuleConfig | undefined {
  return [...MODULES]
    .sort((a, b) => b.basePath.length - a.basePath.length)
    .find((m) => pathname === m.basePath || pathname.startsWith(m.basePath + "/"));
}

/** The registry submodule a route belongs to (longest matching submodule route), e.g. /pmo/contracts/<id> → A.Contract. */
export function submoduleFor(pathname: string): { module: string; href: string; label: string } | null {
  const clean = pathname.split(/[?#]/)[0];
  let best: { module: string; href: string; label: string } | null = null;
  for (const m of MODULES)
    for (const s of m.subPages)
      if ((clean === s.href || clean.startsWith(s.href + "/")) && (!best || s.href.length > best.href.length))
        best = { module: m.key, href: s.href, label: s.label };
  return best;
}

// Routes that render their own full-screen Jernih surface on a phone (MS1 shell pages, MS2 PMO). Other module
// routes still show their desktop page inside the shell, under the module context bar.
const UUID_PART = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const MOBILE_NATIVE = [/^\/$/, /^\/modules$/, /^\/notifications$/, /^\/search$/, /^\/finance$/, /^\/review(\/(signature|time-off|proposal)\/[0-9a-f-]{36})?$/i, new RegExp(`^/pmo/(contracts|invoices)(/${UUID_PART})?$`, "i")];
export const isMobileNative = (pathname: string) => MOBILE_NATIVE.some((r) => r.test(pathname.split(/[?#]/)[0]));
