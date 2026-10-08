"use server";
// Sales V2 form fill (roadmap #3): the Extension prefill (the talent's current contract, no AI) and saving the contacts
// AI found when an Account is created. Same access as the V1 forms they serve: Sales editor.
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { candidates, crmClientContacts, crmClients, employees, onboardingRequests, opportunities, requisitions, talentAssignments } from "@/db/schema";
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";
import { extensionPrefill, type AiContact, type Draft } from "@/features/sales-v2/ai-fill";

const UUID = /^[0-9a-f-]{36}$/i;

export async function getExtensionPrefill(employeeId: string): Promise<Draft> {
  await requireActor();
  await requireDivisionAccess("sales");
  if (!UUID.test(employeeId)) return {};
  const [emp] = await db
    .select({ name: candidates.candidate_name, position: employees.position_name })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .where(eq(employees.id, employeeId));
  if (!emp) return {};
  // The contract being extended: the running one first, else the latest.
  const [a] = await db.select().from(talentAssignments).where(eq(talentAssignments.employee_id, employeeId))
    .orderBy(sql`CASE WHEN ${talentAssignments.status_code} IN ('on_project', 'extended') THEN 0 ELSE 1 END`, desc(talentAssignments.end_date), desc(talentAssignments.created_at))
    .limit(1);
  const [req] = a?.requisition_id ? await db.select().from(requisitions).where(eq(requisitions.id, a.requisition_id)) : [];
  const [pq] = a?.pq_tracker_id
    ? await db.select().from(opportunities).where(eq(opportunities.id, a.pq_tracker_id))
    : req?.opportunity_id
      ? await db.select().from(opportunities).where(eq(opportunities.opportunity_tracker_id, req.opportunity_id)).orderBy(desc(opportunities.created_at)).limit(1)
      : [];
  return extensionPrefill({
    employeeName: emp.name,
    employeePosition: emp.position,
    assignment: a ? { start: a.start_date, end: a.end_date, price: a.price_amount } : null,
    pq: pq ? {
      client: pq.client_name, project: pq.project_name, position: pq.position_name, service: pq.service_type_code, businessUnit: pq.business_unit_code,
      level: pq.level_code, pricePeriod: pq.price_period_code, price: pq.price_amount, duration: pq.estimated_duration_months, priority: pq.priority_code,
      salesPic: pq.sales_pic_name,
    } : null,
    requisition: req ? { client: req.client_name, position: req.position_name, service: req.service_type_code, level: req.level_code, salesPic: req.sales_pic_name } : null,
  });
}

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/;
const clip = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Contacts the person kept from the AI's reading, added to the Account just created. The first becomes primary. */
export async function createAccountContacts(accountName: string, list: AiContact[]): Promise<{ added: number }> {
  await requireActor();
  await requireDivisionAccess("sales");
  const [acc] = await db.select({ id: crmClients.id }).from(crmClients).where(eq(crmClients.name, String(accountName ?? "").trim()));
  if (!acc || !Array.isArray(list)) return { added: 0 };
  const rows = list.slice(0, 10).map((c) => {
    const email = clip(c?.email, 200)?.toLowerCase() ?? null;
    return { name: clip(c?.name, 120), role_title: clip(c?.role_title, 120), email: email && EMAIL.test(email) ? email : null, phone: clip(c?.phone, 40) };
  }).filter((c): c is typeof c & { name: string } => !!c.name);
  if (!rows.length) return { added: 0 };
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(crmClientContacts).where(eq(crmClientContacts.client_id, acc.id));
  await db.insert(crmClientContacts).values(rows.map((r, i) => ({ client_id: acc.id, ...r, is_primary: n === 0 && i === 0 })));
  await logActivity("sales", "create", `${rows.length} kontak untuk Account ${accountName} (dari AI)`, "CRM Account");
  return { added: rows.length };
}
