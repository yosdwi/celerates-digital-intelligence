import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { candidates, employees, onboardingRequests, opportunities, overtimeBusinessTripClaims } from "@/db/schema";
import type { OtClaim } from "./ot-claims-model";

const talentName = { id: employees.id, employee_no: employees.employee_no, candidate_name: candidates.candidate_name };

/** Every claim with its opportunity and talent, newest first, exactly as V1's page reads them; plus the pickers'
 *  options (V1's create form lists every opportunity and every employee). */
export async function loadOtClaims() {
  const t = overtimeBusinessTripClaims;
  const [rows, opportunityOptions, employeeOptions] = await Promise.all([
    db.select({ c: t, opty_no: opportunities.opty_no, client_name: opportunities.client_name, project_name: opportunities.project_name, employee_no: employees.employee_no, candidate_name: candidates.candidate_name })
      .from(t)
      .leftJoin(opportunities, eq(t.opportunity_id, opportunities.id))
      .leftJoin(employees, eq(t.employee_id, employees.id))
      .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
      .orderBy(desc(t.created_at)),
    db.select({ id: opportunities.id, opty_no: opportunities.opty_no, client_name: opportunities.client_name, project_name: opportunities.project_name }).from(opportunities),
    db.select(talentName).from(employees)
      .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
      .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id)),
  ]);
  const claims: OtClaim[] = rows.map(({ c, ...joined }) => {
    const { created_at, updated_at: _u, created_by_name: _b, given_to_talent_initial_date: _g, ...rest } = c;
    return { ...rest, ...joined, created_at: created_at.toISOString() };
  });
  return {
    claims,
    opportunities: opportunityOptions.map((o) => ({ value: o.id, label: `${o.client_name ?? "-"} - ${o.project_name ?? "-"} (${o.opty_no ?? "-"})` })),
    employees: employeeOptions.map((e) => ({ value: e.id, label: `${e.candidate_name ?? "-"} (${e.employee_no ?? "-"})` })),
  };
}
