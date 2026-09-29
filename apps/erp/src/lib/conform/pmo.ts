// PMO ↔ ConForm, server side (doc 21 §4, §7). Division-level authority is checked here before any ConForm call;
// ConForm then re-validates its own business state. Nothing ConForm owns is computed or copied in Celerates.
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { requireActor } from "@/lib/actor";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { conform, conformConfigured, ConformError, qs, type Campaign, type CampaignSummary, type Correction, type Readiness, type TalentLookup, type TalentRequirements } from "./client";

export type PmoLevel = "viewer" | "editor" | "full";
const RANK: Record<PmoLevel, number> = { viewer: 0, editor: 1, full: 2 };

export class PmoAccessError extends Error {}

export async function pmoActor(min: PmoLevel = "viewer") {
  const actor = await requireActor();
  const session = await getServerSession(authOptions);
  const claims = claimsOf(session?.user);
  const level = divisionLevel(claims, "pmo");
  if (!level || RANK[level] < RANK[min]) throw new PmoAccessError(min === "full" ? "Aksi ini butuh akses PMO Full." : "Aksi ini butuh akses PMO.");
  const user = session?.user as { fullName?: string; name?: string; email?: string } | undefined;
  const name = user?.fullName ?? user?.name ?? "PMO";
  return {
    userId: actor.id,
    level,
    isOwner: claims.isOwner === true,
    name,
    /** Recorded by ConForm as reviewer / exporter / approver. */
    tag: `celerates:${name} <${user?.email ?? actor.id}>`,
  };
}

export const canPmo = (level: PmoLevel | null, min: PmoLevel) => Boolean(level && RANK[level] >= RANK[min]);

export const conformReadiness = (year?: number, month?: number) => conform.get<Readiness>(`/readiness${qs({ year, month })}`);
export const conformRequirements = (employeeId: string, year?: number, month?: number) =>
  conform.get<TalentRequirements>(`/talents/requirements${qs({ employee_id: employeeId, year, month })}`);
export const conformLookup = (employeeId: string) => conform.get<TalentLookup>(`/talents/lookup${qs({ employee_id: employeeId })}`);
export const conformCorrections = () => conform.get<{ items: Correction[]; total: number }>("/attendance-corrections");
export const conformCorrection = (id: string) => conform.get<Correction>(`/attendance-corrections/${encodeURIComponent(id)}`);
export const conformCampaign = (id: string) => conform.get<Campaign>(`/campaigns/${encodeURIComponent(id)}`);
export const conformCampaigns = (limit = 20) => conform.get<{ items: CampaignSummary[] }>(`/campaigns${qs({ limit })}`);
export const conformControl = () => conform.get<{ kill_switch: boolean; updated_by: string | null; updated_at: string | null }>("/control");

/** Payroll cycle label containing a Jakarta business date (closing day 20), mirroring ConForm's cycle naming. */
export function cycleLabelFor(isoDate: string, closingDay = 20): { year: number; month: number } {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (d <= closingDay) return { year: y, month: m };
  return m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
}

export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function previousCycle(year: number, month: number) {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function describeConformError(error: unknown): string {
  if (error instanceof ConformError) return error.message;
  if (error instanceof PmoAccessError) return error.message;
  return "ConForm belum dapat dihubungi.";
}

export { conformConfigured, ConformError };
