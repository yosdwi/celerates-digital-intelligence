"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { crmClients, crmClientContacts, crmClientActivities } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity-log";
import { requireDivisionAccess } from "@/lib/require-division-access";

export async function createClient(formData: FormData) {
  await requirePilotActor();

  const actor = await requireDivisionAccess("sales");
  const name = formData.get("name") as string;
  const industry = (formData.get("industry") as string) || null;
  const status_code = (formData.get("status_code") as string) || "prospect";
  const notes = (formData.get("notes") as string) || null;

  await db.insert(crmClients).values({ name, industry, status_code, notes, created_by_name: actor.userName });
  await logActivity("sales", "create", `Account: ${name}`, "CRM Account");
  revalidatePath("/sales/accounts");
}

export async function updateClient(id: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const name = formData.get("name") as string;
  const industry = (formData.get("industry") as string) || null;
  const status_code = (formData.get("status_code") as string) || "prospect";
  const notes = (formData.get("notes") as string) || null;

  await db.update(crmClients).set({ name, industry, status_code, notes }).where(eq(crmClients.id, id));
  await logActivity("sales", "update", `Account: ${name}`, "CRM Account");
  revalidatePath("/sales/accounts");
  revalidatePath(`/sales/accounts/${id}`);
}

export type DeleteResult = { ok: true } | { ok: false; error: string };

export async function deleteClient(id: string): Promise<DeleteResult> {
  await requirePilotActor();

  try {
    await requireDivisionAccess("sales", "full");
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
  const [client] = await db.select().from(crmClients).where(eq(crmClients.id, id));
  await db.delete(crmClientActivities).where(eq(crmClientActivities.client_id, id));
  await db.delete(crmClientContacts).where(eq(crmClientContacts.client_id, id));
  await db.delete(crmClients).where(eq(crmClients.id, id));
  await logActivity("sales", "delete", `Account: ${client?.name ?? id}`, "CRM Account");
  revalidatePath("/sales/accounts");
  return { ok: true };
}

export async function createContact(clientId: string, formData: FormData) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  const name = formData.get("name") as string;
  const role_title = (formData.get("role_title") as string) || null;
  const email = (formData.get("email") as string) || null;
  const phone = (formData.get("phone") as string) || null;
  const is_primary = formData.get("is_primary") === "true";

  if (is_primary) {
    await db.update(crmClientContacts).set({ is_primary: false }).where(eq(crmClientContacts.client_id, clientId));
  }
  await db.insert(crmClientContacts).values({ client_id: clientId, name, role_title, email, phone, is_primary });
  await logActivity("sales", "create", `Contact ${name} untuk Account`, "CRM Account");
  revalidatePath(`/sales/accounts/${clientId}`);
}

export async function deleteContact(id: string, clientId: string) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  await db.delete(crmClientContacts).where(eq(crmClientContacts.id, id));
  revalidatePath(`/sales/accounts/${clientId}`);
}

export async function createActivity(clientId: string, formData: FormData) {
  await requirePilotActor();

  const actor = await requireDivisionAccess("sales");
  const type_code = formData.get("type_code") as string;
  const title = formData.get("title") as string;
  const description = (formData.get("description") as string) || null;
  const activity_date = formData.get("activity_date") as string;
  const contact_id = (formData.get("contact_id") as string) || null;

  await db.insert(crmClientActivities).values({
    client_id: clientId,
    contact_id,
    type_code,
    title,
    description,
    activity_date,
    created_by_name: actor.userName,
  });
  await logActivity("sales", "create", `Activity "${title}" untuk Account`, "CRM Account");
  revalidatePath(`/sales/accounts/${clientId}`);
}

export async function deleteActivity(id: string, clientId: string) {
  await requirePilotActor();

  await requireDivisionAccess("sales");
  await db.delete(crmClientActivities).where(eq(crmClientActivities.id, id));
  revalidatePath(`/sales/accounts/${clientId}`);
}
