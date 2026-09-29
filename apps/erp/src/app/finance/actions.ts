"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { financeDocumentHandoffs, opportunities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { notifyDivision } from "@/lib/notifications";
import { requireDivisionAccess } from "@/lib/require-division-access";

export type FinanceActionResult = { ok: true } | { ok: false; error: string };

async function currentUserName() {
  const session = await getServerSession(authOptions);
  return ((session?.user as any)?.fullName ?? session?.user?.name ?? "Seseorang") as string;
}

async function clientNameOf(opportunityId: string): Promise<string> {
  const [opty] = await db.select({ client_name: opportunities.client_name }).from(opportunities).where(eq(opportunities.id, opportunityId));
  return opty?.client_name ?? opportunityId;
}

/** Finance menandai dokumen invoice sebuah project sudah diterima & lengkap -- notify balik ke PMO. */
export async function acknowledgeFinanceHandoff(opportunityId: string, formData: FormData): Promise<FinanceActionResult> {
  await requirePilotActor();

  try { await requireDivisionAccess("finance"); } catch (e: any) { return { ok: false, error: e.message }; }
  const userName = await currentUserName();
  const [existing] = await db.select().from(financeDocumentHandoffs).where(eq(financeDocumentHandoffs.opportunity_id, opportunityId));
  if (!existing || existing.status_code !== "notified") {
    return { ok: false, error: "Belum ada dokumen baru dari PMO yang perlu diverifikasi." };
  }

  const finance_notes = (formData.get("finance_notes") as string) || null;

  await db.update(financeDocumentHandoffs).set({
    status_code: "received",
    received_at: new Date(),
    received_by_name: userName,
    finance_notes,
  }).where(eq(financeDocumentHandoffs.id, existing.id));

  const clientLabel = await clientNameOf(opportunityId);
  await notifyDivision(
    "pmo",
    "Dokumen Invoice Diterima Finance",
    `${userName} menandai dokumen invoice untuk ${clientLabel} sudah diterima dan lengkap.`,
    "/pmo/invoices"
  );

  await logActivity("finance", "update", `Dokumen Finance diterima: ${clientLabel}`, "Dokumen Finance");
  revalidatePath("/finance");
  revalidatePath("/pmo/invoices");
  return { ok: true };
}

/** Finance mengembalikan ke PMO karena dokumennya kurang/salah -- notify balik ke PMO dengan alasannya. */
export async function requestRevisionFinanceHandoff(opportunityId: string, formData: FormData): Promise<FinanceActionResult> {
  await requirePilotActor();

  try { await requireDivisionAccess("finance"); } catch (e: any) { return { ok: false, error: e.message }; }
  const userName = await currentUserName();
  const finance_notes = (formData.get("finance_notes") as string) || "";
  if (!finance_notes.trim()) {
    return { ok: false, error: "Isi alasan/kekurangannya dulu sebelum dikembalikan ke PMO." };
  }

  const [existing] = await db.select().from(financeDocumentHandoffs).where(eq(financeDocumentHandoffs.opportunity_id, opportunityId));
  if (!existing || existing.status_code !== "notified") {
    return { ok: false, error: "Belum ada dokumen baru dari PMO yang perlu direview." };
  }

  await db.update(financeDocumentHandoffs).set({
    status_code: "needs_revision",
    received_at: null,
    received_by_name: null,
    finance_notes,
  }).where(eq(financeDocumentHandoffs.id, existing.id));

  const clientLabel = await clientNameOf(opportunityId);
  await notifyDivision(
    "pmo",
    "Dokumen Invoice Dikembalikan Finance",
    `${userName} mengembalikan dokumen invoice untuk ${clientLabel}: ${finance_notes}`,
    "/pmo/invoices"
  );

  await logActivity("finance", "update", `Dokumen Finance dikembalikan ke PMO: ${clientLabel}`, "Dokumen Finance");
  revalidatePath("/finance");
  revalidatePath("/pmo/invoices");
  return { ok: true };
}
