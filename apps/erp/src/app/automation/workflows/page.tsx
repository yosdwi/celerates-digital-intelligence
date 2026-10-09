import { getServerSession } from "next-auth";
import { desc, eq, sql } from "drizzle-orm";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, workflowRuns, workflows } from "@/db/schema";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { TEMPLATES } from "@/lib/workflows/templates";
import { WorkflowList, type WorkflowRow } from "@/features/workflows/workflow-ui";

export const metadata = { title: "Workflows" };
export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const session = await getServerSession(authOptions);
  const canEdit = divisionLevel(claimsOf(session?.user), "automation") === "full";
  const rows = await db.select({ w: workflows, owner: users.full_name }).from(workflows).leftJoin(users, eq(users.id, workflows.owner_user_id)).orderBy(desc(workflows.created_at));
  const lastRuns = rows.length
    ? await db.execute<{ workflow_id: string; status: string; started_at: string }>(sql`SELECT DISTINCT ON (workflow_id) workflow_id, status, started_at FROM ${workflowRuns} ORDER BY workflow_id, number DESC`)
    : [];
  const last = new Map([...(lastRuns as Iterable<{ workflow_id: string; status: string; started_at: string }>)].map((r) => [r.workflow_id, r]));
  const data: WorkflowRow[] = rows.map(({ w, owner }) => ({
    id: w.id, name: w.name, template: w.template, enabled: w.enabled, config: w.config, owner,
    nextRunAt: w.next_run_at?.toISOString() ?? null,
    lastRun: last.get(w.id) ? { status: last.get(w.id)!.status, startedAt: new Date(last.get(w.id)!.started_at).toISOString() } : null,
  }));
  return <WorkflowList rows={data} templates={TEMPLATES} canEdit={canEdit} />;
}
