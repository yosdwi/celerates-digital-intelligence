"use server";
import { requirePilotActor } from "@/lib/actor";
import { db } from "@/db";
import { extensionRequestSpecialNotes, extensionIncrementRequests, employees, onboardingRequests, candidates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";
import { resolveActorDivision, notifyOtherDivision } from "@/lib/special-notes-notify";
import { SPECIAL_NOTE_CATEGORY_LABELS, DIVISION_LABELS } from "./constants";

async function currentUser() {
  const session = await getServerSession(authOptions);
  const id = (session?.user as any)?.id as string | undefined;
  const name = ((session?.user as any)?.fullName ?? session?.user?.name ?? session?.user?.email ?? "Seseorang") as string;
  if (!id) throw new Error("Sesi tidak valid, silakan login ulang");
  return { id, name };
}

async function getEmployeeLabel(employeeId: string) {
  const [row] = await db.select({ employee_no: employees.employee_no, candidate_name: candidates.candidate_name })
    .from(employees)
    .leftJoin(onboardingRequests, eq(employees.onboarding_request_id, onboardingRequests.id))
    .leftJoin(candidates, eq(onboardingRequests.candidate_id, candidates.id))
    .where(eq(employees.id, employeeId));
  return row ? `${row.candidate_name ?? "Talent"} (${row.employee_no})` : "Talent";
}

export async function createSpecialNote(extensionRequestId: string, formData: FormData): Promise<void> {
  await requirePilotActor();

  const { id: userId, name: userName } = await currentUser();
  const division = (await resolveActorDivision(userId)) ?? "tm";

  const title = formData.get("title") as string;
  const note_text = formData.get("note_text") as string;
  const category_code = (formData.get("category_code") as string) || "other";
  const effective_date = (formData.get("effective_date") as string) || null;
  if (!title || !note_text) throw new Error("Judul dan isi catatan wajib diisi");

  await db.insert(extensionRequestSpecialNotes).values({
    extension_request_id: extensionRequestId,
    category_code,
    title,
    note_text,
    effective_date,
    created_by_name: userName,
    created_by_division: division,
  });

  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, extensionRequestId));
  const employeeLabel = request ? await getEmployeeLabel(request.employee_id) : "Talent";

  await notifyOtherDivision(
    userId,
    "Catatan Khusus Extension Request",
    `${userName} (${DIVISION_LABELS[division]}) menambahkan catatan "${title}" [${SPECIAL_NOTE_CATEGORY_LABELS[category_code]}] untuk ${employeeLabel}.`,
    "/tm/special-notes"
  );

  await logActivity(division, "create", `Catatan khusus: ${title} untuk ${employeeLabel}`, "Special Notes");
  revalidatePath("/tm/special-notes");
}

export async function updateSpecialNoteStatus(id: string, statusCode: string): Promise<void> {
  await requirePilotActor();

  const { id: userId, name: userName } = await currentUser();
  const division = (await resolveActorDivision(userId)) ?? "hr";

  const [note] = await db.select().from(extensionRequestSpecialNotes).where(eq(extensionRequestSpecialNotes.id, id));
  if (!note) throw new Error("Catatan tidak ditemukan");

  await db.update(extensionRequestSpecialNotes).set({
    status_code: statusCode,
    acknowledged_by_name: statusCode !== "open" ? userName : note.acknowledged_by_name,
    acknowledged_at: statusCode !== "open" ? new Date() : note.acknowledged_at,
    updated_at: new Date(),
  }).where(eq(extensionRequestSpecialNotes.id, id));

  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, note.extension_request_id));
  const employeeLabel = request ? await getEmployeeLabel(request.employee_id) : "Talent";

  if (note.created_by_division !== division) {
    await notifyOtherDivision(
      userId,
      "Update Catatan Khusus",
      `${userName} (${DIVISION_LABELS[division]}) mengubah status catatan "${note.title}" untuk ${employeeLabel} jadi "${statusCode}".`,
      "/tm/special-notes"
    );
  }

  await logActivity(division, "update", `Status catatan khusus diubah jadi ${statusCode}: ${note.title}`, "Special Notes");
  revalidatePath("/tm/special-notes");
}

export async function deleteSpecialNote(id: string): Promise<void> {
  await requirePilotActor();

  const { id: userId } = await currentUser();
  const division = (await resolveActorDivision(userId)) ?? "tm";
  const [note] = await db.select().from(extensionRequestSpecialNotes).where(eq(extensionRequestSpecialNotes.id, id));
  if (!note) throw new Error("Catatan tidak ditemukan");

  await db.delete(extensionRequestSpecialNotes).where(eq(extensionRequestSpecialNotes.id, id));
  await logActivity(division, "delete", `Catatan khusus dihapus: ${note.title}`, "Special Notes");
  revalidatePath("/tm/special-notes");
}
