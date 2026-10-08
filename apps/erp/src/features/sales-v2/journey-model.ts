// Deal 360 (QA 2026-10-08): one Opportunity followed through every division, from the tracker to the margin, plus the
// hand-offs that are stuck and whose move it is. Pure: the page's loader (journey-data.ts) reads the rows, this turns
// them into steps; tested directly (tests/sales-v2.test.ts).
import { STAGE_LABEL } from "./model";

export type JourneyInput = {
  now?: number;
  tracker: { status: string; createdAt: string | null; closingPrice: number | null };
  requisition: { id: string; no: string; createdAt: string | null } | null;
  pq: { id: string; no: string | null } | null;
  applications: { candidate: string | null; candidateId: string | null; hiring: string; submission: string | null }[];
  /** Each onboarding request with the employee it became and that employee's assignment, if any. */
  talents: {
    onboardingId: string;
    candidateId: string | null;
    name: string | null;
    position: string | null;
    employeeId: string | null;
    assignment: { status: string | null; price: number | null; marginPercent: number | null } | null;
  }[];
  claims: { id: string; no: string; title: string; status: string; createdAt: string | null; toClient: number | null; invoiced: boolean }[];
};

export type StepState = "done" | "current" | "todo";
export type JourneyStep = { key: string; label: string; state: StepState; detail: string };
export type JourneyAction = { key: string; text: string; owner: "Sales" | "TA" | "TM" | "PMO" | "Finance"; href?: string };

export type Journey = {
  steps: JourneyStep[];
  actions: JourneyAction[];
  money: { deal: number | null; claimed: number; invoiced: number; claims: number };
  /** "Placed · 1 perlu tindakan": the panel's one-line summary. */
  summary: string;
};

const DAY = 86_400_000;
const ACCEPTED = new Set(["client_accepted"]);
const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;

export function buildJourney(i: JourneyInput): Journey {
  const now = i.now ?? Date.now();
  const placed = i.talents.filter((t) => t.assignment?.status === "on_project");
  const margins = i.talents.map((t) => t.assignment?.marginPercent).filter((m): m is number => m != null);
  const accepted = i.applications.filter((a) => a.submission && ACCEPTED.has(a.submission)).length;
  const openClaims = i.claims.filter((c) => !c.invoiced).length;

  const raw: Omit<JourneyStep, "state">[] = [
    { key: "opty", label: "Opty", detail: STAGE_LABEL[i.tracker.status] ?? i.tracker.status },
    { key: "req", label: "REQ", detail: i.requisition?.no ?? "Belum convert" },
    { key: "candidates", label: "Kandidat", detail: i.applications.length ? `${i.applications.length} kandidat · ${accepted} diterima` : "Belum ada" },
    { key: "placed", label: "Placed", detail: placed.length ? `${placed.length} talent on project` : i.talents.length ? `${i.talents.length} onboarding` : "Belum ada" },
    { key: "claims", label: "Klaim", detail: i.claims.length ? `${i.claims.length} klaim · ${openClaims} belum invoice` : "Belum ada" },
    { key: "margin", label: "Margin", detail: margins.length ? `rata-rata ${pct(margins.reduce((s, m) => s + m, 0) / margins.length)}` : "Belum di-sync" },
  ];
  const done: Record<string, boolean> = {
    opty: true,
    req: !!i.requisition,
    candidates: i.applications.length > 0,
    placed: placed.length > 0,
    claims: i.claims.length > 0,
    margin: margins.length > 0,
  };
  let current = false;
  const steps = raw.map((s) => {
    if (done[s.key]) return { ...s, state: "done" as const };
    const state: StepState = current ? "todo" : "current";
    current = true;
    return { ...s, state };
  });

  const actions: JourneyAction[] = [];
  if (i.tracker.status === "win" && !i.requisition) actions.push({ key: "convert", text: "Deal sudah Win tapi belum di-Convert ke Requisition", owner: "Sales" });
  const withOnboarding = new Set(i.talents.map((t) => t.candidateId).filter(Boolean));
  for (const a of i.applications) {
    if (a.submission && ACCEPTED.has(a.submission) && a.candidateId && !withOnboarding.has(a.candidateId)) {
      actions.push({ key: `ob:${a.candidateId}`, text: `${a.candidate ?? "Kandidat"} diterima klien, belum dibuat Onboarding`, owner: "TA", href: "/ta/onboarding" });
    }
  }
  for (const t of i.talents) {
    if (!t.employeeId) actions.push({ key: `promote:${t.onboardingId}`, text: `${t.name ?? "Talent"} belum di-Promote jadi Employee`, owner: "TA", href: `/ta/onboarding/${t.onboardingId}/edit` });
    else if (!t.assignment) actions.push({ key: `setup:${t.employeeId}`, text: `${t.name ?? "Talent"} belum di-setup Talent Assignment`, owner: "TM", href: "/tm" });
  }
  for (const c of i.claims) {
    const age = c.createdAt ? Math.floor((now - new Date(c.createdAt).getTime()) / DAY) : 0;
    const href = `/pmo/overtime-business-trip/${c.id}`;
    if (c.status === "forwarded_to_sales") actions.push({ key: `claim:${c.id}`, text: `Klaim ${c.no} menunggu diteruskan Sales ke Finance`, owner: "Sales", href });
    else if (c.status === "draft" && age >= 7) actions.push({ key: `claim:${c.id}`, text: `Klaim ${c.no} masih Draft ${age} hari`, owner: "PMO", href });
    else if (c.status === "submitted_to_finance" && age >= 14) actions.push({ key: `claim:${c.id}`, text: `Klaim ${c.no} belum di-invoice (${age} hari)`, owner: "Finance", href });
  }
  if (placed.length > 0 && margins.length === 0) actions.push({ key: "sync", text: "Margin belum dihitung: Sync dari Talents Book di Profitability Tracker", owner: "Sales", href: "/sales/profitability-tracker" });

  const last = [...steps].reverse().find((s) => s.state === "done")!;
  return {
    steps,
    actions,
    money: {
      deal: i.tracker.closingPrice,
      claimed: i.claims.reduce((s, c) => s + (c.toClient ?? 0), 0),
      invoiced: i.claims.filter((c) => c.invoiced).length,
      claims: i.claims.length,
    },
    summary: `${last.label}${actions.length ? ` · ${actions.length} perlu tindakan` : ""}`,
  };
}
