import { db } from "@/db";
import { opportunities, requisitions, candidates, salesOpportunityTrackers } from "@/db/schema";
import { eq } from "drizzle-orm";

const ROMAN_MONTHS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** Format: OPTY{tahun}-{3digit}. Dipakai Opportunity Tracker, termasuk yang dibuat otomatis saat TA input Requisition langsung (tanpa lewat Sales). */
export async function generateOptyNo(): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    const rand = Math.floor(100 + Math.random() * 900);
    const candidate = `OPTY${year}-${rand}`;
    const existing = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.opty_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `OPTY${year}-${Date.now()}`;
}

/** Format: {CLIENT}-{POSISI}-{BU}-{4digit}-{bulan romawi}-{tahun}. Dipakai Sales saat create Opportunity manual maupun sheet sync. */
export async function generateOptyNoWithPosition(clientName: string, positionName: string, businessUnit: string): Promise<string> {
  const clientSlug = clientName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "CLIENT";
  const posSlug = (positionName || "POS").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
  const buSlug = (businessUnit || "GEN").toUpperCase();
  const now = new Date();
  const roman = ROMAN_MONTHS[now.getMonth()];
  for (let i = 0; i < 5; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `${clientSlug}-${posSlug}-${buSlug}-${rand}-${roman}-${now.getFullYear()}`;
    const existing = await db.select().from(opportunities).where(eq(opportunities.opty_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `${clientSlug}-${posSlug}-${buSlug}-${Date.now()}-${roman}-${now.getFullYear()}`;
}

/** Format: PQ-#{3digit}-QUO/{CLIENT}-{POSISI}-{BU}/{bulan romawi}-{tahun}. */
export async function generatePqNo(clientName: string, positionName: string, businessUnit: string): Promise<string> {
  const clientSlug = clientName.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10) || "CLIENT";
  const posSlug = (positionName || "POS").toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8);
  const buSlug = (businessUnit || "GEN").toUpperCase();
  const now = new Date();
  const roman = ROMAN_MONTHS[now.getMonth()];
  for (let i = 0; i < 5; i++) {
    const rand = Math.floor(100 + Math.random() * 900);
    const candidate = `PQ-#${rand}-QUO/${clientSlug}-${posSlug}-${buSlug}/${roman}-${now.getFullYear()}`;
    const existing = await db.select().from(opportunities).where(eq(opportunities.pq_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `PQ-#${Date.now()}-QUO/${clientSlug}-${posSlug}-${buSlug}/${roman}-${now.getFullYear()}`;
}

/** Format: REQ-{tahun}-{4digit}. Dipakai TA & Sales (convert-to-requisition) supaya formatnya konsisten. */
export async function generateRequisitionNo(): Promise<string> {
  const year = new Date().getFullYear();
  for (let i = 0; i < 5; i++) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    const candidate = `REQ-${year}-${rand}`;
    const existing = await db.select().from(requisitions).where(eq(requisitions.requisition_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `REQ-${year}-${Date.now()}`;
}

/** Format: {inisial nama}-{7digit}. */
export async function generateCandidateNo(candidateName: string): Promise<string> {
  const initials = candidateName.trim().split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("").slice(0, 3) || "CND";
  for (let i = 0; i < 5; i++) {
    const seq = String(Math.floor(1 + Math.random() * 9999999)).padStart(7, "0");
    const candidate = `${initials}-${seq}`;
    const existing = await db.select().from(candidates).where(eq(candidates.candidate_no, candidate));
    if (existing.length === 0) return candidate;
  }
  return `${initials}-${Date.now()}`;
}
