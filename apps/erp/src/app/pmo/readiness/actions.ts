"use server";
// Operational Readiness actions (doc 21 §7). Each checks PMO division level, then asks ConForm, which owns and
// re-validates the business state. Campaign approval is where Celerates mints the per-Talent deep-link grants.
import { revalidatePath } from "next/cache";
import { sql } from "@/db";
import { requireActor, requireOwner } from "@/lib/actor";
import { conform, ConformError, type BastJob, type Campaign } from "@/lib/conform/client";
import { conformCampaign, conformLookup, describeConformError, pmoActor } from "@/lib/conform/pmo";
import { activeLinksForEmployees, GRANT_DEFAULT_TTL_SECONDS, issueGrant, linkTalentAccount, TalentLinkError } from "@/lib/talent/identity";

type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
const NONCE = /^[A-Za-z0-9_-]{8,64}$/;

function fail(error: unknown): { ok: false; error: string } {
  if (error instanceof TalentLinkError) return { ok: false, error: error.message };
  return { ok: false, error: describeConformError(error) };
}

function publicBase(): string {
  const raw = process.env.CELERATES_PUBLIC_URL ?? process.env.NEXTAUTH_URL ?? "";
  return raw.replace(/\/+$/, "");
}

export async function decideCorrection(id: string, decision: "approve" | "reject", reason: string): Promise<Result<{ status: string; outcome: string }>> {
  await requireActor();
  try {
    const actor = await pmoActor("editor");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["approve", "reject"].includes(decision)) return { ok: false, error: "Permintaan tidak valid." };
    const trimmed = reason.trim().slice(0, 500);
    if (decision === "reject" && !trimmed) return { ok: false, error: "Alasan penolakan wajib diisi." };
    const result = await conform.post<{ status: string; outcome: string }>(
      `/attendance-corrections/${id}/decision`,
      { decision, reason: trimmed || null },
      { actor: actor.tag, idempotencyKey: `decision:${id}:${decision}` },
    );
    revalidatePath("/review");
    revalidatePath("/pmo/readiness");
    if (result.status !== "succeeded") return { ok: false, error: `ConForm tidak menerapkan keputusan (${result.outcome}). Data berubah; muat ulang.` };
    return { ok: true, data: result };
  } catch (error) {
    return fail(error);
  }
}

export async function createCampaign(year: number, month: number, nonce: string): Promise<Result<{ id: string }>> {
  await requireActor();
  try {
    const actor = await pmoActor("editor");
    if (!NONCE.test(nonce)) return { ok: false, error: "Permintaan tidak valid." };
    const campaign = await conform.post<Campaign>("/campaigns", { year, month }, { actor: actor.tag, idempotencyKey: `campaign:${year}-${month}:${nonce}` });
    revalidatePath("/review");
    revalidatePath("/pmo/readiness");
    return { ok: true, data: { id: campaign.id } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Approve a draft campaign. For each eligible recipient with an active Celerates link, Celerates issues a
 * single-use grant bound to that user; ConForm only carries the opaque URL. Unlinked recipients are skipped.
 */
export async function approveCampaign(id: string): Promise<Result<{ linked: number; skipped: number }>> {
  await requireActor();
  try {
    const actor = await pmoActor("full");
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Permintaan tidak valid." };
    const base = publicBase();
    if (!/^https?:\/\//.test(base)) return { ok: false, error: "CELERATES_PUBLIC_URL belum dikonfigurasi." };
    const campaign = await conformCampaign(id);
    if (campaign.state !== "draft") return { ok: false, error: "Kampanye ini sudah diproses." };
    const eligible = campaign.recipients.filter((r) => r.eligibility === "eligible");
    const links = await activeLinksForEmployees(sql, eligible.map((r) => r.employee_id));
    const target = `/me?year=${campaign.cycle.year}&month=${campaign.cycle.month}`;
    const payload: { employee_id: string; url: string; expires_at: string }[] = [];
    for (const recipient of eligible) {
      const link = links.get(recipient.employee_id);
      if (!link) continue;
      const grant = await issueGrant(sql, { userId: link.user_id, targetPath: target, purpose: "campaign", ttlSeconds: GRANT_DEFAULT_TTL_SECONDS, campaignRef: id, createdBy: actor.userId });
      payload.push({ employee_id: recipient.employee_id, url: `${base}/go/${grant.code}`, expires_at: grant.expiresAt.toISOString() });
    }
    await conform.post<Campaign>(`/campaigns/${id}/approve`, { links: payload }, { actor: actor.tag, idempotencyKey: `approve:${id}` });
    revalidatePath("/review");
    revalidatePath(`/review/campaign/${id}`);
    return { ok: true, data: { linked: payload.length, skipped: campaign.recipients.length - payload.length } };
  } catch (error) {
    return fail(error);
  }
}

export async function controlCampaign(id: string, action: "pause" | "resume" | "stop", nonce: string): Promise<Result> {
  await requireActor();
  try {
    const actor = await pmoActor(action === "stop" ? "full" : "editor");
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["pause", "resume", "stop"].includes(action) || !NONCE.test(nonce)) return { ok: false, error: "Permintaan tidak valid." };
    await conform.post(`/campaigns/${id}/${action}`, action === "pause" ? { reason: "paused_by_pmo" } : {}, { actor: actor.tag, idempotencyKey: `${action}:${id}:${nonce}` });
    revalidatePath("/review");
    revalidatePath(`/review/campaign/${id}`);
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function setKillSwitch(on: boolean): Promise<Result> {
  await requireOwner();
  try {
    const actor = await pmoActor("full");
    if (!actor.isOwner) return { ok: false, error: "Hanya Owner yang dapat mengubah kill switch." };
    await conform.put("/control", { kill_switch: Boolean(on) }, { actor: actor.tag, idempotencyKey: `control:${on ? "on" : "off"}:${Date.now()}` });
    revalidatePath("/pmo/readiness");
    return { ok: true, data: undefined };
  } catch (error) {
    return fail(error);
  }
}

export async function sendPmoSummary(year: number, month: number, nonce: string): Promise<Result<{ status: string }>> {
  await requireActor();
  try {
    const actor = await pmoActor("editor");
    if (!NONCE.test(nonce)) return { ok: false, error: "Permintaan tidak valid." };
    const link = `${publicBase()}/pmo/readiness?year=${year}&month=${month}`;
    const result = await conform.post<{ status: string; error?: string | null }>("/pmo-summary/send", { year, month, link }, { actor: actor.tag, idempotencyKey: `summary:${year}-${month}:${nonce}` });
    if (result.status === "failed") return { ok: false, error: `Ringkasan belum terkirim (${result.error ?? "transport"}).` };
    return { ok: true, data: { status: result.status } };
  } catch (error) {
    return fail(error);
  }
}

export async function pmoSummaryPreview(year: number, month: number): Promise<Result<{ text: string; groupConfigured: boolean }>> {
  await requireActor();
  try {
    await pmoActor("editor");
    const link = `${publicBase()}/pmo/readiness?year=${year}&month=${month}`;
    const result = await conform.get<{ text: string; group_configured: boolean }>(`/pmo-summary/preview?year=${year}&month=${month}&link=${encodeURIComponent(link)}`);
    return { ok: true, data: { text: result.text, groupConfigured: result.group_configured } };
  } catch (error) {
    return fail(error);
  }
}

export async function generateBast(input: { year: number; month: number; reportType: "developer" | "iotoperation"; mode: "preview" | "final"; force: boolean; reason: string }): Promise<Result<BastJob>> {
  await requireActor();
  try {
    const actor = await pmoActor("full");
    if (!["developer", "iotoperation"].includes(input.reportType) || !["preview", "final"].includes(input.mode)) return { ok: false, error: "Permintaan tidak valid." };
    if (input.force && !input.reason.trim()) return { ok: false, error: "Alasan force wajib diisi." };
    const job = await conform.post<BastJob>(
      "/bast/generations",
      { year: input.year, month: input.month, report_type: input.reportType, mode: input.mode, force: input.force, force_reason: input.force ? input.reason.trim().slice(0, 500) : null },
      { actor: actor.tag, timeoutMs: 30000 },
    );
    return { ok: true, data: job };
  } catch (error) {
    if (error instanceof ConformError && error.code === "bast_not_ready") return { ok: false, error: `BAST belum siap: ${error.message}. Gunakan preview, atau force dengan alasan.` };
    return fail(error);
  }
}

export async function bastJobStatus(jobId: string): Promise<Result<BastJob>> {
  await requireActor();
  try {
    await pmoActor("full");
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return { ok: false, error: "Permintaan tidak valid." };
    return { ok: true, data: await conform.get<BastJob>(`/bast/generations/${jobId}`) };
  } catch (error) {
    return fail(error);
  }
}

/** PMO full links a Talent's Celerates account to their ConForm employee record (doc 21 §3). */
export async function linkTalent(employeeId: string, email: string): Promise<Result<{ created: boolean }>> {
  await requireActor();
  try {
    const actor = await pmoActor("full");
    const talent = await conformLookup(employeeId);
    const result = await linkTalentAccount(sql, { email, conformEmployeeId: talent.employee_id, nrp: talent.nrp, name: talent.name, linkedBy: actor.userId });
    revalidatePath(`/pmo/readiness/talent/${encodeURIComponent(employeeId)}`);
    return { ok: true, data: { created: result.created } };
  } catch (error) {
    return fail(error);
  }
}
