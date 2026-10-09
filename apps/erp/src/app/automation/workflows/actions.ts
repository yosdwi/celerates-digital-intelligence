"use server";
// Workflows (QA doc pages 18–19): made from a template, edited, switched on and run by hand. Automation Full (or Owner);
// a run executes as the workflow's owner, with that person's access at run time (lib/workflows/engine.ts).
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { workflows } from "@/db/schema";
import { requireActor } from "@/lib/actor";
import { requireDivisionAccess } from "@/lib/require-division-access";
import { logActivity } from "@/lib/activity-log";
import { cleanConfig, templateOf } from "@/lib/workflows/templates";
import { runWorkflow, scheduleFor } from "@/lib/workflows/engine";

type Result = { ok: true; id?: string } | { ok: false; error: string };
const UUID = /^[0-9a-f-]{36}$/i;
const fail = (e: unknown): Result => ({ ok: false, error: e instanceof Error ? e.message : "Gagal" });

export async function createWorkflow(template: string, name: string): Promise<Result> {
  await requireActor();
  try {
    const actor = await requireDivisionAccess("automation", "full");
    const t = templateOf(template);
    if (!t) return { ok: false, error: "Template tidak dikenal." };
    const [wf] = await db.insert(workflows).values({
      name: (name ?? "").trim().slice(0, 120) || t.name, template: t.key, config: cleanConfig(t, t.defaults), enabled: false, owner_user_id: actor.userId,
    }).returning({ id: workflows.id });
    await logActivity("automation", "create", `Workflow: ${name || t.name}`, "Workflows");
    revalidatePath("/automation/workflows");
    return { ok: true, id: wf.id };
  } catch (e) { return fail(e); }
}

export async function updateWorkflow(id: string, patch: { name?: string; config?: unknown }): Promise<Result> {
  await requireActor();
  try {
    await requireDivisionAccess("automation", "full");
    if (!UUID.test(id)) return { ok: false, error: "Workflow tidak dikenal." };
    const [wf] = await db.select().from(workflows).where(eq(workflows.id, id));
    const t = wf ? templateOf(wf.template) : null;
    if (!wf || !t) return { ok: false, error: "Workflow tidak ditemukan." };
    const config = patch.config === undefined ? cleanConfig(t, wf.config) : cleanConfig(t, patch.config);
    await db.update(workflows).set({
      name: patch.name !== undefined ? patch.name.trim().slice(0, 120) || wf.name : wf.name,
      config, next_run_at: scheduleFor(t.key, config, wf.enabled), updated_at: new Date(),
    }).where(eq(workflows.id, id));
    revalidatePath(`/automation/workflows/${id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function setWorkflowEnabled(id: string, enabled: boolean): Promise<Result> {
  await requireActor();
  try {
    await requireDivisionAccess("automation", "full");
    if (!UUID.test(id)) return { ok: false, error: "Workflow tidak dikenal." };
    const [wf] = await db.select().from(workflows).where(eq(workflows.id, id));
    if (!wf) return { ok: false, error: "Workflow tidak ditemukan." };
    await db.update(workflows).set({ enabled, next_run_at: scheduleFor(wf.template, wf.config, enabled), updated_at: new Date() }).where(eq(workflows.id, id));
    await logActivity("automation", "update", `Workflow ${enabled ? "Live" : "dimatikan"}: ${wf.name}`, "Workflows");
    revalidatePath("/automation/workflows");
    revalidatePath(`/automation/workflows/${id}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function runWorkflowNow(id: string): Promise<Result> {
  await requireActor();
  try {
    await requireDivisionAccess("automation", "full");
    if (!UUID.test(id)) return { ok: false, error: "Workflow tidak dikenal." };
    const runId = await runWorkflow(id, "manual");
    revalidatePath(`/automation/workflows/${id}`);
    return { ok: true, id: runId };
  } catch (e) { return fail(e); }
}

export async function deleteWorkflow(id: string): Promise<Result> {
  await requireActor();
  try {
    await requireDivisionAccess("automation", "full");
    if (!UUID.test(id)) return { ok: false, error: "Workflow tidak dikenal." };
    const [wf] = await db.delete(workflows).where(eq(workflows.id, id)).returning({ name: workflows.name });
    if (wf) await logActivity("automation", "delete", `Workflow: ${wf.name}`, "Workflows");
    revalidatePath("/automation/workflows");
    return { ok: true };
  } catch (e) { return fail(e); }
}
