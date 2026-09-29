import { db } from "@/db";
import { applications, requisitions, candidates, userAccess, divisions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { notifyDivision } from "@/lib/notifications";
import { CLIENT_SUBMISSION_LABELS } from "@/app/ta/client-active/constants";

/** Divisi mana yang perlu dinotif -- selalu divisi LAWAN dari yang mengubah (TA<->Sales), fallback ke keduanya. */
export async function resolveNotifyTargets(actingUserId: string): Promise<string[]> {
  const myDivisions = await db
    .select({ key: divisions.key })
    .from(userAccess)
    .innerJoin(divisions, eq(userAccess.division_id, divisions.id))
    .where(eq(userAccess.user_id, actingUserId));
  const myKeys = new Set(myDivisions.map((d) => d.key));

  if (myKeys.size === 0) return ["sales", "ta"]; // user tanpa akses TA/Sales sama sekali (mis. HR) -> fallback notif keduanya

  const targets = new Set<string>();
  if (!myKeys.has("sales")) targets.add("sales");
  if (!myKeys.has("ta")) targets.add("ta");
  return [...targets];
}

/** Dipanggil setelah applications.client_submission_* di-update -- broadcast notifikasi ke divisi lawan. */
export async function notifyAboutClientSubmissionUpdate(
  actingUserId: string,
  actingUserName: string,
  applicationId: string,
  statusCode: string,
  note: string | null
) {
  const [app] = await db.select().from(applications).where(eq(applications.id, applicationId));
  const [req] = app?.requisition_id ? await db.select().from(requisitions).where(eq(requisitions.id, app.requisition_id)) : [undefined];
  const [candidate] = app?.candidate_id ? await db.select({ candidate_name: candidates.candidate_name }).from(candidates).where(eq(candidates.id, app.candidate_id)) : [undefined];

  const statusLabel = CLIENT_SUBMISSION_LABELS[statusCode] ?? statusCode;
  const body = `${actingUserName} update status "${candidate?.candidate_name ?? "-"}" (${req?.client_name ?? "-"}) jadi "${statusLabel}"${note ? `: ${note}` : "."}`;

  const targets = await resolveNotifyTargets(actingUserId);
  for (const key of targets) {
    await notifyDivision(key, "Update Status Client Active", body, "/ta/client-active");
  }
}
