import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { desc, eq } from "drizzle-orm";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { users, workflowRuns, workflows } from "@/db/schema";
import { claimsOf, divisionLevel } from "@/lib/module-access";
import { templateOf } from "@/lib/workflows/templates";
import { WorkflowDetail, type RunRow } from "@/features/workflows/workflow-ui";

export const dynamic = "force-dynamic";

export default async function WorkflowPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const session = await getServerSession(authOptions);
  const canEdit = divisionLevel(claimsOf(session?.user), "automation") === "full";
  const [row] = await db.select({ w: workflows, owner: users.full_name }).from(workflows).leftJoin(users, eq(users.id, workflows.owner_user_id)).where(eq(workflows.id, id));
  const template = row ? templateOf(row.w.template) : null;
  if (!row || !template) notFound();
  const runs = await db.select().from(workflowRuns).where(eq(workflowRuns.workflow_id, id)).orderBy(desc(workflowRuns.number)).limit(50);
  const data: RunRow[] = runs.map((r) => ({
    id: r.id, number: r.number, trigger: r.trigger, status: r.status, startedAt: r.started_at.toISOString(), finishedAt: r.finished_at?.toISOString() ?? null,
    steps: (r.steps as RunRow["steps"]) ?? [], summary: r.summary,
  }));
  return (
    <WorkflowDetail
      wf={{ id: row.w.id, name: row.w.name, template: row.w.template, enabled: row.w.enabled, config: row.w.config, owner: row.owner, nextRunAt: row.w.next_run_at?.toISOString() ?? null, lastRun: null }}
      template={template} runs={data} canEdit={canEdit}
    />
  );
}
