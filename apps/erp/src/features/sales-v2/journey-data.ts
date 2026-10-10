import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  applications, candidates, crmClientContacts, crmClients, employees, onboardingRequests, opportunities, overtimeBusinessTripClaims,
  profitabilityEntries, requisitions, salesOpportunityTrackers, talentAssignments,
} from "@/db/schema";
import { buildJourney, type JourneyInput } from "./journey-model";

const iso = (d: Date | string | null) => (d ? new Date(d).toISOString() : null);

/** One Opportunity and everything downstream of it (Deal 360), read from the tables each division already writes. */
export async function loadDealPage(id: string) {
  const [t] = await db.select().from(salesOpportunityTrackers).where(eq(salesOpportunityTrackers.id, id));
  if (!t) return null;

  const [[req], [pq], [account], others] = await Promise.all([
    db.select({ id: requisitions.id, no: requisitions.requisition_no, createdAt: requisitions.created_at }).from(requisitions).where(eq(requisitions.opportunity_id, id)).limit(1),
    db.select({ id: opportunities.id, no: opportunities.pq_no }).from(opportunities).where(eq(opportunities.opportunity_tracker_id, id)).limit(1),
    db.select().from(crmClients).where(eq(crmClients.name, t.client_name)).limit(1),
    db.select({ id: salesOpportunityTrackers.id }).from(salesOpportunityTrackers).where(and(eq(salesOpportunityTrackers.client_name, t.client_name), ne(salesOpportunityTrackers.id, id))),
  ]);

  const [apps, talents, assignments, claims, contacts] = await Promise.all([
    req
      ? db.select({ candidate: candidates.candidate_name, candidateId: applications.candidate_id, hiring: applications.hiring_status_code, submission: applications.client_submission_status_code })
        .from(applications).leftJoin(candidates, eq(applications.candidate_id, candidates.id)).where(eq(applications.requisition_id, req.id))
      : [],
    req
      ? db.select({ onboardingId: onboardingRequests.id, candidateId: onboardingRequests.candidate_id, name: candidates.candidate_name, employeeId: employees.id })
        .from(onboardingRequests).leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
        .leftJoin(employees, eq(employees.onboarding_request_id, onboardingRequests.id)).where(eq(onboardingRequests.requisition_id, req.id))
      : [],
    req || pq
      ? db.select({ id: talentAssignments.id, employeeId: talentAssignments.employee_id, status: talentAssignments.status_code, price: talentAssignments.price_amount })
        .from(talentAssignments)
        .where(or(req ? eq(talentAssignments.requisition_id, req.id) : undefined, pq ? eq(talentAssignments.pq_tracker_id, pq.id) : undefined))
      : [],
    pq
      ? db.select({ id: overtimeBusinessTripClaims.id, no: overtimeBusinessTripClaims.claim_no, title: overtimeBusinessTripClaims.claim_title, status: overtimeBusinessTripClaims.status_code,
          createdAt: overtimeBusinessTripClaims.created_at, toClient: overtimeBusinessTripClaims.amount_claim_to_client_total })
        .from(overtimeBusinessTripClaims).where(eq(overtimeBusinessTripClaims.opportunity_id, pq.id)).orderBy(desc(overtimeBusinessTripClaims.created_at))
      : [],
    account
      ? db.select().from(crmClientContacts).where(eq(crmClientContacts.client_id, account.id)).orderBy(desc(crmClientContacts.is_primary))
      : [],
  ]);

  // The latest period's margin per assignment.
  const margins = assignments.length
    ? await db.select({ assignmentId: profitabilityEntries.talent_assignment_id, percent: profitabilityEntries.margin_percent })
      .from(profitabilityEntries).where(inArray(profitabilityEntries.talent_assignment_id, assignments.map((a) => a.id)))
      .orderBy(desc(profitabilityEntries.period_year), desc(profitabilityEntries.period_month))
    : [];
  const marginOf = new Map<string, number>();
  for (const m of margins) if (!marginOf.has(m.assignmentId)) marginOf.set(m.assignmentId, m.percent);
  const assignmentOf = new Map(assignments.map((a) => [a.employeeId, { status: a.status, price: a.price, marginPercent: marginOf.get(a.id) ?? null }]));

  const input: JourneyInput = {
    tracker: { status: t.opty_status_code, createdAt: iso(t.created_at), closingPrice: t.estimated_deal_amount },
    requisition: req ? { id: req.id, no: req.no, createdAt: iso(req.createdAt) } : null,
    pq: pq ? { id: pq.id, no: pq.no } : null,
    applications: apps,
    talents: talents.map((x) => ({ ...x, position: t.position_name, assignment: x.employeeId ? assignmentOf.get(x.employeeId) ?? null : null })),
    claims: claims.map((c) => ({ ...c, createdAt: iso(c.createdAt), invoiced: c.status === "invoiced" })),
  };

  return {
    tracker: {
      id: t.id, optyNo: t.opty_no, client: t.client_name, status: t.opty_status_code, salesPic: t.sales_pic_name, position: t.position_name,
      level: t.level_code, headcount: t.headcount_target, price: t.price_amount, pricePeriod: t.price_period_code, closingPrice: t.estimated_deal_amount,
      serviceType: t.service_type_code, lastCommunication: t.last_communication_date, salesQualified: t.sales_qualified,
      requirement: t.requirement_summary, progressNotes: t.progress_notes, createdAt: iso(t.created_at),
    },
    input,
    journey: buildJourney(input),
    requisition: req ? { id: req.id, no: req.no } : null,
    pq: pq ? { id: pq.id, no: pq.no } : null,
    account: account ? { id: account.id, name: account.name, status: account.status_code, industry: account.industry } : null,
    contacts: contacts.map((c) => ({ id: c.id, name: c.name, role: c.role_title, email: c.email, primary: c.is_primary })),
    otherDeals: others.length,
  };
}

export type DealPageData = NonNullable<Awaited<ReturnType<typeof loadDealPage>>>;
