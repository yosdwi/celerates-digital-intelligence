// Sensitive access and authentication audit (docs/security/03). Append-only table. Never pass content, identity
// numbers, bank numbers, pay values, codes, tokens or keys here: only ids, decisions and coarse request metadata.
import type { Sql, TransactionSql } from "postgres";

export type AuditEntry = {
  action: string;
  decision: "allow" | "deny";
  actorUserId?: string | null;
  sessionId?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  subjectEmployeeId?: string | null;
  subjectOnboardingId?: string | null;
  subjectUserId?: string | null;
  reason?: string | null;
  stepUpAt?: Date | null;
  ipHash?: string | null;
  device?: string | null;
};

/** Throws when the row cannot be written, so callers that must fail closed simply await it. */
export async function audit(sql: Sql | TransactionSql, e: AuditEntry): Promise<void> {
  await sql`INSERT INTO sensitive_access_log
    (actor_user_id, session_id, action, resource_type, resource_id, subject_employee_id, subject_onboarding_id, subject_user_id,
     decision, reason, step_up_at, ip_hash, device)
    VALUES (${e.actorUserId ?? null}, ${e.sessionId ?? null}, ${e.action}, ${e.resourceType ?? null}, ${e.resourceId ?? null},
            ${e.subjectEmployeeId ?? null}, ${e.subjectOnboardingId ?? null}, ${e.subjectUserId ?? null}, ${e.decision},
            ${e.reason?.slice(0, 200) ?? null}, ${e.stepUpAt ? new Date(e.stepUpAt).toISOString() : null}, ${e.ipHash ?? null}, ${e.device?.slice(0, 120) ?? null})`;
}
