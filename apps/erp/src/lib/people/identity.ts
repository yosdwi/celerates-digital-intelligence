// Identity numbers (NIK, NPWP, KK number, bank account number) leave the database in plaintext only through this
// module (docs/security/03). Everywhere else sees a masked value. A plaintext read needs `can()` → capability,
// lifecycle scope and a fresh step-up, and writes an audit row either way. tests/security-static.test.ts fails the
// build if `decryptPII` is used anywhere else.
import type { Sql, TransactionSql } from "postgres";
import { decryptPII, encryptPII } from "@/lib/pii-crypto";
import { audit } from "@/lib/security/audit";
import { can, type Action, type PolicyActor, type SubjectResource } from "@/lib/security/policy";

type Tx = Sql | TransactionSql;
export const IDENTITY_FIELDS = ["nik", "npwp", "family_card_no", "bank_account_no"] as const;
export type IdentityField = (typeof IDENTITY_FIELDS)[number];
type Actor = PolicyActor & { sid?: string | null };
type Meta = { ipHash?: string | null; device?: string | null };

const actionFor = (field: IdentityField): Action => (field === "bank_account_no" ? "bank.read" : "identity.reveal");

export class RevealDenied extends Error {
  constructor(public code: string) {
    super(code === "step_up_required" ? "Konfirmasi identitas diperlukan (step_up_required)." : "Anda tidak memiliki izin untuk melihat data ini.");
  }
}

/** "••••••••1234": enough to recognise a record, never enough to use the number. */
export function maskIdentity(stored: string | null | undefined): string | null {
  const plain = decryptPII(stored);
  if (!plain) return null;
  return plain.length <= 4 ? "••••" : "•".repeat(Math.min(plain.length - 4, 12)) + plain.slice(-4);
}

/** Lifecycle of an onboarding record: TA's while onboarding, HR's after promotion (employees row). */
async function resourceFor(sql: Tx, onboardingId: string, field: IdentityField): Promise<(SubjectResource & { employeeId: string | null }) | null> {
  const [row] = await sql`SELECT o.id, e.id AS employee_id, e.created_at FROM onboarding_requests o
    LEFT JOIN employees e ON e.onboarding_request_id = o.id WHERE o.id = ${onboardingId} ORDER BY e.created_at LIMIT 1`;
  if (!row) return null;
  return {
    classification: field === "bank_account_no" ? "bank" : "identity",
    stage: row.employee_id ? "employee" : "onboarding",
    promotedAt: row.employee_id ? new Date(row.created_at) : null,
    employeeId: (row.employee_id as string | null) ?? null,
  };
}

async function decideField(sql: Tx, actor: Actor, onboardingId: string, field: IdentityField, action: Action, meta: Meta) {
  const resource = await resourceFor(sql, onboardingId, field);
  if (!resource) throw new RevealDenied("not_found");
  const decision = can(actor, action, resource);
  await audit(sql, {
    action, decision: decision.allow ? "allow" : "deny", actorUserId: actor.userId, sessionId: actor.sid ?? null,
    resourceType: "onboarding_request", resourceId: onboardingId, subjectOnboardingId: onboardingId, subjectEmployeeId: resource.employeeId,
    reason: `${field}:${decision.reason}`, stepUpAt: actor.stepUpAt, ipHash: meta.ipHash, device: meta.device,
  });
  if (!decision.allow) throw new RevealDenied(decision.stepUpRequired ? "step_up_required" : decision.reason);
}

/** Plaintext of one field for an authorized, recently confirmed user. Audited (allow and deny). */
export async function revealIdentityField(sql: Tx, actor: Actor, onboardingId: string, field: IdentityField, meta: Meta = {}): Promise<string | null> {
  if (!IDENTITY_FIELDS.includes(field)) throw new RevealDenied("invalid_field");
  await decideField(sql, actor, onboardingId, field, actionFor(field), meta);
  const [row] = await sql.unsafe(`SELECT ${field} AS value FROM onboarding_requests WHERE id = $1`, [onboardingId]);
  return decryptPII(row?.value as string | null);
}

/**
 * Encrypted values for an edit form. A blank field keeps the stored value (the form never receives plaintext).
 * Changing a bank account after onboarding needs `bank.write` + step-up; TA entering it during onboarding does not.
 */
export async function identityWrites(sql: Tx, actor: Actor, onboardingId: string, form: FormData, meta: Meta = {}): Promise<Partial<Record<IdentityField, string | null>>> {
  const out: Partial<Record<IdentityField, string | null>> = {};
  for (const field of IDENTITY_FIELDS) {
    const value = String(form.get(field) ?? "").trim();
    if (value) out[field] = encryptPII(value);
  }
  if (out.bank_account_no) await decideField(sql, actor, onboardingId, "bank_account_no", "bank.write", meta);
  return out;
}

/**
 * Values for generated documents (contracts). Plaintext only when the user may reveal them right now; otherwise
 * the document carries the masked value. Audited either way.
 */
export async function identityForDocument(sql: Tx, actor: Actor | null, onboardingId: string, stored: Record<IdentityField, string | null>, meta: Meta = {}) {
  const out = {} as Record<IdentityField, string | null>;
  for (const field of IDENTITY_FIELDS) {
    let plain = false;
    if (actor && stored[field]) {
      try {
        await decideField(sql, actor, onboardingId, field, actionFor(field), meta);
        plain = true;
      } catch (error) {
        if (!(error instanceof RevealDenied)) throw error;
      }
    }
    out[field] = plain ? decryptPII(stored[field]) : maskIdentity(stored[field]);
  }
  return out;
}
