// Private identity documents, one vertical slice (docs/security/04):
// upload → validate (size, magic bytes) → classify identity → envelope-encrypt (AES-256-GCM, fresh DEK, wrapped by
// the versioned KEK) → private MinIO under an opaque key → metadata row → policy + step-up → audit (fail closed)
// → decrypt in memory → stream. Never registered as a Company File; the Agent sees status metadata only.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { putIdentityObject, readIdentityObject } from "@/lib/object-store";
import { audit } from "./audit";
import { keyring } from "./keyring";
import { can, type Action, type PolicyActor, type SubjectResource } from "./policy";

type Tx = Sql | TransactionSql;
export const DOC_TYPES = ["ktp", "kk", "npwp", "bpjs_kesehatan", "bpjs_ketenagakerjaan"] as const;
export type DocType = (typeof DOC_TYPES)[number];
export const MAX_IDENTITY_BYTES = 5 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type Actor = PolicyActor & { sid?: string | null };
export type Meta = { ipHash?: string | null; device?: string | null };
export type Subject = { onboardingId?: string | null; employeeId?: string | null; userId?: string | null };

export class IdentityDocError extends Error {
  constructor(public status: number, public code: string) {
    super(code);
  }
}

/** Content type from the bytes themselves. Rejects anything that also looks like markup (polyglots, SVG, HTML). */
export function sniff(bytes: Buffer): "image/jpeg" | "image/png" | "application/pdf" | null {
  const head = bytes.subarray(0, 2048).toString("latin1").toLowerCase();
  if (/<(html|script|svg|!doctype|iframe|object|embed)\b/.test(head)) return null;
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.subarray(0, 5).toString("latin1") === "%PDF-" && bytes.subarray(-1024).toString("latin1").includes("%%EOF")) return "application/pdf";
  return null;
}

type ResolvedSubject = SubjectResource & { onboardingId: string | null; employeeId: string | null; userId: string | null };

/** Lifecycle stage now: promoted (an employees row exists) → HR's; onboarding only → TA's; neither → the Talent's own. */
async function resolve(sql: Tx, s: Subject): Promise<ResolvedSubject | null> {
  let onboardingId = s.onboardingId ?? null;
  let employeeId = s.employeeId ?? null;
  let promotedAt: Date | null = null;
  if (employeeId) {
    const [e] = await sql`SELECT id, created_at, onboarding_request_id FROM employees WHERE id = ${employeeId}`;
    if (!e) return null;
    promotedAt = new Date(e.created_at);
    onboardingId ??= e.onboarding_request_id ?? null;
  } else if (onboardingId) {
    const [o] = await sql`SELECT o.id, e.id AS employee_id, e.created_at FROM onboarding_requests o
      LEFT JOIN employees e ON e.onboarding_request_id = o.id WHERE o.id = ${onboardingId} ORDER BY e.created_at LIMIT 1`;
    if (!o) return null;
    if (o.employee_id) {
      employeeId = o.employee_id as string;
      promotedAt = new Date(o.created_at);
    }
  }
  // The Talent this record is about, when one is linked to the ERP employee.
  let userId = s.userId ?? null;
  if (!userId && employeeId) {
    const [l] = await sql`SELECT user_id FROM talent_identity_links WHERE erp_employee_id = ${employeeId} AND status = 'active'`;
    userId = (l?.user_id as string | undefined) ?? null;
  }
  const stage = employeeId ? "employee" : onboardingId ? "onboarding" : userId ? "self" : null;
  if (!stage) return null;
  return { classification: "identity", stage, promotedAt, subjectUserId: userId, onboardingId, employeeId, userId };
}

async function decide(sql: Tx, actor: Actor, action: Action, subject: ResolvedSubject, resourceId: string | null, meta: Meta) {
  const decision = can(actor, action, subject);
  const entry = {
    actorUserId: actor.userId,
    sessionId: actor.sid ?? null,
    action,
    resourceType: "identity_document",
    resourceId,
    subjectEmployeeId: subject.employeeId,
    subjectOnboardingId: subject.onboardingId,
    subjectUserId: subject.userId,
    stepUpAt: actor.stepUpAt,
    ipHash: meta.ipHash ?? null,
    device: meta.device ?? null,
  };
  if (!decision.allow) {
    await audit(sql, { ...entry, decision: "deny", reason: decision.reason });
    if (decision.stepUpRequired) throw new IdentityDocError(401, "step_up_required");
    // Out of scope or someone else's record: indistinguishable from "does not exist".
    throw new IdentityDocError(decision.reason === "missing_capability" ? 403 : 404, decision.reason);
  }
  return entry;
}

const aad = (id: string, docType: string, s: { onboardingId: string | null; employeeId: string | null; userId: string | null }) =>
  Buffer.from(`identity-document:v1:${id}:${docType}:${s.onboardingId ?? ""}:${s.employeeId ?? ""}:${s.userId ?? ""}`);

export async function uploadIdentityDocument(
  sql: Tx,
  actor: Actor,
  input: { subject: Subject; docType: string; declaredType: string; bytes: Buffer },
  meta: Meta = {},
): Promise<{ id: string }> {
  if (!DOC_TYPES.includes(input.docType as DocType)) throw new IdentityDocError(400, "invalid_doc_type");
  const subject = await resolve(sql, input.subject);
  if (!subject) throw new IdentityDocError(404, "subject_not_found");
  const entry = await decide(sql, actor, "identity_document.upload", subject, null, meta);
  if (input.bytes.length === 0 || input.bytes.length > MAX_IDENTITY_BYTES) {
    await audit(sql, { ...entry, decision: "deny", reason: "invalid_size" });
    throw new IdentityDocError(413, "invalid_size");
  }
  const mediaType = sniff(input.bytes);
  if (!mediaType || mediaType !== input.declaredType) {
    await audit(sql, { ...entry, decision: "deny", reason: mediaType ? "type_mismatch" : "unsupported_content" });
    throw new IdentityDocError(415, mediaType ? "type_mismatch" : "unsupported_content");
  }

  const id = randomUUID();
  const objectKey = `id/${randomBytes(16).toString("hex")}`;
  const dek = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dek, iv);
  cipher.setAAD(aad(id, input.docType, subject));
  const body = Buffer.concat([iv, cipher.update(input.bytes), cipher.final(), cipher.getAuthTag()]);
  const { wrapped, version } = await keyring().wrap(dek);
  dek.fill(0);

  await putIdentityObject(objectKey, body);
  await sql`INSERT INTO identity_documents (id, subject_onboarding_id, subject_employee_id, subject_user_id, doc_type, object_key, sha256,
      size_bytes, media_type, wrapped_dek, kek_version, uploaded_by)
    VALUES (${id}, ${subject.onboardingId}, ${subject.employeeId}, ${subject.userId}, ${input.docType}, ${objectKey},
      ${createHash("sha256").update(input.bytes).digest("hex")}, ${input.bytes.length}, ${mediaType}, ${wrapped}, ${version}, ${actor.userId})`;
  await audit(sql, { ...entry, resourceId: id, decision: "allow", reason: "uploaded" });
  return { id };
}

type Row = {
  id: string; subject_onboarding_id: string | null; subject_employee_id: string | null; subject_user_id: string | null; doc_type: string;
  object_key: string; sha256: string; media_type: string; wrapped_dek: string; kek_version: number;
};

async function loadRow(sql: Tx, id: string) {
  if (!UUID.test(id)) return null;
  const [row] = await sql<Row[]>`SELECT id, subject_onboarding_id, subject_employee_id, subject_user_id, doc_type, object_key, sha256, media_type,
      wrapped_dek, kek_version FROM identity_documents WHERE id = ${id} AND deleted_at IS NULL`;
  if (!row) return null;
  const subject = await resolve(sql, { onboardingId: row.subject_onboarding_id, employeeId: row.subject_employee_id, userId: row.subject_user_id });
  return subject ? { row, subject } : null;
}

/** Policy → step-up → audit (written before any byte leaves) → decrypt in memory. */
export async function readIdentityDocument(sql: Tx, actor: Actor, id: string, meta: Meta = {}) {
  const found = await loadRow(sql, id);
  if (!found) {
    await audit(sql, { actorUserId: actor.userId, sessionId: actor.sid ?? null, action: "identity_document.read", resourceType: "identity_document",
      resourceId: UUID.test(id) ? id : null, decision: "deny", reason: "not_found", stepUpAt: actor.stepUpAt, ipHash: meta.ipHash, device: meta.device });
    throw new IdentityDocError(404, "not_found");
  }
  const { row, subject } = found;
  const entry = await decide(sql, actor, "identity_document.read", subject, row.id, meta);
  await audit(sql, { ...entry, decision: "allow", reason: "read" });

  const body = await readIdentityObject(row.object_key);
  const dek = await keyring().unwrap(row.wrapped_dek, row.kek_version);
  const decipher = createDecipheriv("aes-256-gcm", dek, body.subarray(0, 12));
  decipher.setAAD(aad(row.id, row.doc_type, { onboardingId: row.subject_onboarding_id, employeeId: row.subject_employee_id, userId: row.subject_user_id }));
  decipher.setAuthTag(body.subarray(-16));
  const bytes = Buffer.concat([decipher.update(body.subarray(12, -16)), decipher.final()]);
  dek.fill(0);
  if (createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new IdentityDocError(500, "integrity");
  return { bytes, mediaType: row.media_type, docType: row.doc_type };
}

export async function verifyIdentityDocument(sql: Tx, actor: Actor, id: string, status: "verified" | "rejected", meta: Meta = {}) {
  const found = await loadRow(sql, id);
  if (!found) throw new IdentityDocError(404, "not_found");
  const entry = await decide(sql, actor, "identity_document.verify", found.subject, id, meta);
  await sql`UPDATE identity_documents SET verification_status = ${status}, verified_by = ${actor.userId}, verified_at = now() WHERE id = ${id}`;
  await audit(sql, { ...entry, decision: "allow", reason: status });
}

export type DocumentStatus = { id: string | null; doc_type: string; status: "absent" | "uploaded" | "verified" | "rejected"; verified_at: string | null; uploaded_at: string | null };

/**
 * Metadata only (never content): latest document per type for one subject. Gated by `identity_document.status`.
 * This is all the Agent and list views ever receive.
 */
export async function identityDocumentStatus(sql: Tx, actor: Actor, subjectInput: Subject): Promise<DocumentStatus[] | null> {
  const subject = await resolve(sql, subjectInput);
  if (!subject || !can(actor, "identity_document.status", subject).allow) return null;
  const rows = await sql`SELECT DISTINCT ON (doc_type) id, doc_type, verification_status, verified_at, uploaded_at FROM identity_documents
    WHERE deleted_at IS NULL AND (
      (${subject.onboardingId}::uuid IS NOT NULL AND subject_onboarding_id = ${subject.onboardingId}::uuid)
      OR (${subject.employeeId}::uuid IS NOT NULL AND subject_employee_id = ${subject.employeeId}::uuid)
      OR (${subject.userId}::uuid IS NOT NULL AND subject_user_id = ${subject.userId}::uuid))
    ORDER BY doc_type, uploaded_at DESC`;
  const byType = new Map(rows.map((r) => [r.doc_type as string, r]));
  return DOC_TYPES.map((t) => {
    const r = byType.get(t);
    const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
    return r
      ? { id: r.id, doc_type: t, status: r.verification_status, verified_at: iso(r.verified_at), uploaded_at: iso(r.uploaded_at) }
      : { id: null, doc_type: t, status: "absent", verified_at: null, uploaded_at: null };
  });
}
