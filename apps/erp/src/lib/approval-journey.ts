import { db } from "@/db";
import { extensionIncrementRequests, signatureRequests, users, talentAssignments } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { createNotification } from "@/lib/notifications";

export const EXTENSION_REQUEST_SOURCE = "extension_increment_request";

type ExtensionRequestRow = typeof extensionIncrementRequests.$inferSelect;

type StepCode = "requester" | "approval_1" | "approval_2" | "approval_3" | "acknowledge";

export type StepDef = {
  code: StepCode;
  order: number;
  label: string;
  userField: "requester_user_id" | "approver_1_user_id" | "approver_2_user_id" | "approver_3_user_id" | "acknowledger_user_id";
};

export const APPROVAL_STEPS: StepDef[] = [
  { code: "requester", order: 0, label: "Requester", userField: "requester_user_id" },
  { code: "approval_1", order: 1, label: "Approval 1", userField: "approver_1_user_id" },
  { code: "approval_2", order: 2, label: "Approval 2", userField: "approver_2_user_id" },
  { code: "approval_3", order: 3, label: "Approval 3", userField: "approver_3_user_id" },
  { code: "acknowledge", order: 4, label: "Acknowledge", userField: "acknowledger_user_id" },
];

function documentTitleFor(request: ExtensionRequestRow): string {
  return `Extension/Increment Request - ${request.requester_name}`;
}

/**
 * Begitu Extension/Increment Request approved (baik lewat journey TTD penuh
 * atau Owner override), tarik nilai yang diajukan ke Talent Assignment terkait
 * -- sebelumnya Increment Amount Deal di Talents Book nggak pernah kesentuh
 * otomatis oleh flow approval ini sama sekali.
 */
async function syncApprovedExtensionToTalentAssignment(request: ExtensionRequestRow) {
  const assignments = await db.select().from(talentAssignments).where(eq(talentAssignments.employee_id, request.employee_id));
  if (assignments.length === 0) return;
  const assignment =
    assignments.find((a) => request.requisition_id && a.requisition_id === request.requisition_id) ??
    assignments.find((a) => a.status_code === "on_project") ??
    assignments[0];

  const updates: Record<string, unknown> = { increment_date: new Date().toISOString().slice(0, 10) };
  if (request.propose_start_date) updates.start_date = request.propose_start_date;
  if (request.propose_end_date) updates.end_date = request.propose_end_date;
  if (request.proposed_basic_salary_amount !== null) updates.basic_salary_amount = request.proposed_basic_salary_amount;
  if (request.proposed_transport_allowance_amount !== null) updates.transport_allowance_amount = request.proposed_transport_allowance_amount;
  if (request.proposed_project_allowance_amount !== null) updates.project_allowance_amount = request.proposed_project_allowance_amount;
  if (request.proposed_accommodation_allowance_amount !== null) updates.accommodation_allowance_amount = request.proposed_accommodation_allowance_amount;
  if (request.proposed_overtime_allowance_amount !== null) updates.overtime_allowance_amount = request.proposed_overtime_allowance_amount;
  if (request.proposed_increment_amount_deal !== null) updates.increment_amount_deal = request.proposed_increment_amount_deal;
  if (request.proposed_increment_percent_deal !== null) updates.increment_percent_deal = request.proposed_increment_percent_deal;

  await db.update(talentAssignments).set(updates).where(eq(talentAssignments.id, assignment.id));
}

async function setStepNameField(requestId: string, step: StepDef, signerName: string) {
  switch (step.code) {
    case "requester":
      await db.update(extensionIncrementRequests).set({ requester_name: signerName }).where(eq(extensionIncrementRequests.id, requestId));
      break;
    case "approval_1":
      await db.update(extensionIncrementRequests).set({ approved_by_1_name: signerName }).where(eq(extensionIncrementRequests.id, requestId));
      break;
    case "approval_2":
      await db.update(extensionIncrementRequests).set({ approved_by_2_name: signerName }).where(eq(extensionIncrementRequests.id, requestId));
      break;
    case "approval_3":
      await db.update(extensionIncrementRequests).set({ approved_by_3_name: signerName }).where(eq(extensionIncrementRequests.id, requestId));
      break;
    case "acknowledge":
      await db.update(extensionIncrementRequests).set({ acknowledged_by_name: signerName }).where(eq(extensionIncrementRequests.id, requestId));
      break;
  }
}

async function createStepSignatureRequest(request: ExtensionRequestRow, step: StepDef) {
  const signerId = request[step.userField];
  if (!signerId || !request.requester_user_id) return;

  await db.insert(signatureRequests).values({
    document_title: documentTitleFor(request),
    requested_by_user_id: request.requester_user_id,
    signer_user_id: signerId,
    source_type: EXTENSION_REQUEST_SOURCE,
    source_id: request.id,
    step_code: step.code,
    step_order: step.order,
  });

  await createNotification(
    signerId,
    `Permintaan Tanda Tangan: ${step.label}`,
    `Anda diminta menandatangani Extension/Increment Request untuk "${request.requester_name}" sebagai ${step.label}.`,
    "/ttd-online"
  );
}

/** Dipanggil sesaat setelah sebuah Extension Request dibuat -- mulai journey dari step pertama yang punya user. */
export async function startExtensionRequestJourney(requestId: string) {
  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, requestId));
  if (!request) return;
  const firstStep = APPROVAL_STEPS.find((s) => request[s.userField]);
  if (firstStep) await createStepSignatureRequest(request, firstStep);
}

/** Dipanggil setelah signature_request dengan source extension_increment_request berhasil ditandatangani. */
export async function advanceExtensionRequestJourney(sourceId: string, signedStepCode: string, signerName: string) {
  const step = APPROVAL_STEPS.find((s) => s.code === signedStepCode);
  if (!step) return;
  await setStepNameField(sourceId, step, signerName);

  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, sourceId));
  if (!request) return;

  const nextStep = APPROVAL_STEPS.find((s) => s.order > step.order && request[s.userField]);
  if (nextStep) {
    await createStepSignatureRequest(request, nextStep);
    return;
  }

  await db.update(extensionIncrementRequests).set({ status_code: "approved" }).where(eq(extensionIncrementRequests.id, sourceId));
  await syncApprovedExtensionToTalentAssignment(request);
  if (request.requester_user_id) {
    await createNotification(
      request.requester_user_id,
      "Extension/Increment Request Disetujui",
      "Semua approval journey (Requester, Approval 1-3, Acknowledge) sudah selesai ditandatangani. Request Anda disetujui.",
      "/tm/extension-requests"
    );
  }
}

/** Dipanggil kalau salah satu signature_request di journey ini ditolak signer-nya. */
export async function rejectExtensionRequestJourney(sourceId: string, signerName: string, reason: string | null) {
  await db.update(extensionIncrementRequests).set({ status_code: "rejected" }).where(eq(extensionIncrementRequests.id, sourceId));

  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, sourceId));
  if (request?.requester_user_id) {
    await createNotification(
      request.requester_user_id,
      "Extension/Increment Request Ditolak",
      `${signerName} menolak menandatangani salah satu step approval${reason ? `: ${reason}` : "."}`,
      "/tm/extension-requests"
    );
  }
}

/** Owner override -- batalkan semua signature_request pending di journey ini tanpa perlu TTD asli. */
export async function ownerOverrideExtensionRequestJourney(requestId: string, ownerName: string) {
  await db.update(signatureRequests).set({
    status_code: "rejected",
    reject_reason: `Dilewati oleh Owner (${ownerName})`,
  }).where(and(
    eq(signatureRequests.source_type, EXTENSION_REQUEST_SOURCE),
    eq(signatureRequests.source_id, requestId),
    eq(signatureRequests.status_code, "pending")
  ));

  await db.update(extensionIncrementRequests).set({
    status_code: "approved",
    owner_override: true,
    owner_override_by_name: ownerName,
    owner_override_at: new Date(),
  }).where(eq(extensionIncrementRequests.id, requestId));

  const [request] = await db.select().from(extensionIncrementRequests).where(eq(extensionIncrementRequests.id, requestId));
  if (request) await syncApprovedExtensionToTalentAssignment(request);
  if (request?.requester_user_id) {
    await createNotification(
      request.requester_user_id,
      "Extension/Increment Request Disetujui (Owner Override)",
      `${ownerName} menyetujui request Anda secara langsung tanpa menunggu proses TTD.`,
      "/tm/extension-requests"
    );
  }
}

async function getLatestStepSignature(sourceId: string, stepCode: string) {
  const [row] = await db.select().from(signatureRequests)
    .where(and(eq(signatureRequests.source_type, EXTENSION_REQUEST_SOURCE), eq(signatureRequests.source_id, sourceId), eq(signatureRequests.step_code, stepCode)))
    .orderBy(desc(signatureRequests.created_at))
    .limit(1);
  return row;
}

export type ReconcileResult = { changed: boolean; blocked: boolean };

/**
 * Dipanggil saat user edit assignee sebuah step (mis. ganti Approval 1).
 * - Step yang belum pernah punya signature_request (belum sampai gilirannya): tinggal ganti kolomnya.
 * - Step yang signature_request-nya masih pending: batalkan yang lama, buat baru untuk assignee baru + notifikasi.
 * - Step yang sudah "signed": TIDAK diizinkan diganti, supaya history tanda tangan tetap valid.
 */
export async function reconcileApprovalStepChange(
  request: ExtensionRequestRow,
  step: StepDef,
  newUserId: string | null
): Promise<ReconcileResult> {
  const oldUserId = request[step.userField];
  if (oldUserId === newUserId) return { changed: false, blocked: false };

  const latestSig = await getLatestStepSignature(request.id, step.code);
  if (latestSig?.status_code === "signed") {
    return { changed: false, blocked: true };
  }

  if (latestSig?.status_code === "pending") {
    await db.update(signatureRequests).set({
      status_code: "rejected",
      reject_reason: "Digantikan -- signer step ini diubah",
    }).where(eq(signatureRequests.id, latestSig.id));

    if (newUserId) {
      await createStepSignatureRequest({ ...request, [step.userField]: newUserId } as ExtensionRequestRow, step);
    }
  }

  return { changed: true, blocked: false };
}

export type SignerOption = { id: string; full_name: string; email: string };

export async function getActiveUserOptions(): Promise<SignerOption[]> {
  return db.select({ id: users.id, full_name: users.full_name, email: users.email }).from(users).where(eq(users.status, "active"));
}
