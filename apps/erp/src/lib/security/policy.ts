// The single authorization decision for sensitive data (docs/security/03). Pure: no I/O, so every caller (page,
// server action, route handler, Agent read) gets the same answer for the same inputs, and the matrix is unit-tested.
//
//   actor (who, divisions, capabilities, step-up freshness)
// + resource (classification, lifecycle stage, subject)
// + action
// = allow | deny (+ reason, + whether a fresh step-up is what is missing)
//
// Division RBAC stays the module axis. Capabilities add the sensitivity axis. Owner is not a data clearance: an
// Owner administers access but reads identity, bank or pay data only through an explicit, audited capability.

export const CAPABILITIES = [
  "identity.read",
  "identity.reveal",
  "identity_document.read",
  "bank.read",
  "bank.write",
  "compensation.read",
  "compensation.write",
  "payroll.export",
  "access.admin",
] as const;
export type Capability = (typeof CAPABILITIES)[number];
export type CapabilityScope = "all" | "onboarding" | "employee";
export type CapabilityGrant = { capability: Capability; scope: CapabilityScope };

export const STEP_UP_SECONDS = 10 * 60;
/** TA keeps access to an employee's identity for this long after promotion (business may change it). */
export const TA_GRACE_DAYS = 14;

export type PolicyActor = {
  userId: string;
  status: string;
  accountType: string;
  isOwner: boolean;
  access: { divisionKey: string; level: string }[];
  capabilities: CapabilityGrant[];
  stepUpAt: Date | null;
};

/** Lifecycle stage of the person a record is about. `self` = a Talent's own record not tied to an ERP employee. */
export type Stage = "onboarding" | "employee" | "self";
export type SubjectResource = {
  classification: "identity" | "bank" | "compensation";
  stage: Stage;
  promotedAt?: Date | null;
  subjectUserId?: string | null;
};

export type Action =
  | "identity.read"
  | "identity.reveal"
  | "identity_document.read"
  | "identity_document.upload"
  | "identity_document.verify"
  | "identity_document.status"
  | "bank.read"
  | "bank.write"
  | "compensation.read"
  | "compensation.write"
  | "payroll.export"
  | "access.admin";

export type Decision = { allow: true; reason: string } | { allow: false; reason: string; stepUpRequired?: boolean };

const RANK: Record<string, number> = { viewer: 0, editor: 1, full: 2 };
const STEP_UP: ReadonlySet<Action> = new Set([
  "identity.reveal",
  "identity_document.read",
  "identity_document.verify",
  "bank.read",
  "bank.write",
  "compensation.write",
  "payroll.export",
  "access.admin",
]);
/** The capability an action needs; actions not listed need none beyond division/scope. */
const NEEDS: Partial<Record<Action, Capability>> = {
  "identity.read": "identity.read",
  "identity.reveal": "identity.reveal",
  "identity_document.read": "identity_document.read",
  "identity_document.verify": "identity_document.read",
  "bank.read": "bank.read",
  "bank.write": "bank.write",
  "compensation.read": "compensation.read",
  "compensation.write": "compensation.write",
  "payroll.export": "payroll.export",
};

export function stepUpFresh(stepUpAt: Date | null | undefined, now = new Date()): boolean {
  return !!stepUpAt && now.getTime() - stepUpAt.getTime() < STEP_UP_SECONDS * 1000 && stepUpAt.getTime() <= now.getTime() + 60_000;
}

const division = (actor: PolicyActor, key: string, min = "viewer") =>
  actor.access.some((a) => a.divisionKey === key && (RANK[a.level] ?? -1) >= RANK[min]);
const grant = (actor: PolicyActor, capability: Capability, stage: Stage) =>
  actor.capabilities.some((c) => c.capability === capability && (c.scope === "all" || c.scope === stage));
const deny = (reason: string): Decision => ({ allow: false, reason });

/**
 * Which division owns a person's sensitive record at this stage: TA while onboarding, HR after promotion (TA keeps
 * it for TA_GRACE_DAYS after promotion). Bank data is HR or Finance; pay is TM, HR or Finance.
 */
function inDivisionScope(actor: PolicyActor, resource: SubjectResource, min: string, now: Date): boolean {
  if (actor.isOwner) return true;
  if (resource.classification === "bank") return division(actor, "hr", min) || division(actor, "finance", min);
  if (resource.classification === "compensation") return ["tm", "hr", "finance"].some((d) => division(actor, d, min));
  if (resource.stage === "onboarding") return division(actor, "ta", min);
  if (resource.stage === "employee") {
    if (division(actor, "hr", min)) return true;
    const promoted = resource.promotedAt?.getTime();
    return promoted !== undefined && now.getTime() - promoted < TA_GRACE_DAYS * 86_400_000 && division(actor, "ta", min);
  }
  return false; // `self` records are reachable only by their subject
}

export function can(actor: PolicyActor | null | undefined, action: Action, resource?: SubjectResource, now = new Date()): Decision {
  if (!actor?.userId || actor.status !== "active") return deny("no_active_session");

  if (action === "access.admin") {
    if (!actor.isOwner && !actor.capabilities.some((c) => c.capability === "access.admin")) return deny("missing_capability");
    return stepUpFresh(actor.stepUpAt, now) ? { allow: true, reason: actor.isOwner ? "owner" : "capability" } : { allow: false, reason: "step_up_required", stepUpRequired: true };
  }
  if (!resource) return deny("no_resource");

  // A Talent reaches only records about themselves, and only identity documents (own upload, own view).
  if (actor.accountType === "talent" && !actor.isOwner) {
    if (!resource.subjectUserId || resource.subjectUserId !== actor.userId) return deny("not_own_record");
    if (!["identity_document.read", "identity_document.upload", "identity_document.status"].includes(action)) return deny("talent_action_not_allowed");
    if (action === "identity_document.read" && !stepUpFresh(actor.stepUpAt, now)) return { allow: false, reason: "step_up_required", stepUpRequired: true };
    return { allow: true, reason: "self" };
  }

  // TA enters bank details while onboarding: a data-entry write, not a change to a paid account.
  if (action === "bank.write" && resource.stage === "onboarding" && division(actor, "ta", "editor")) return { allow: true, reason: "onboarding_entry" };

  // Backoffice. Writes (upload, bank change, pay change) need editor in the owning division; reads any level.
  const write = action === "identity_document.upload" || action === "bank.write" || action === "compensation.write";
  if (!inDivisionScope(actor, resource, write ? "editor" : "viewer", now)) return deny("out_of_scope");

  const needed = NEEDS[action];
  if (needed && !grant(actor, needed, resource.stage)) return deny("missing_capability");
  if (STEP_UP.has(action) && !stepUpFresh(actor.stepUpAt, now)) return { allow: false, reason: "step_up_required", stepUpRequired: true };
  return { allow: true, reason: needed ? "capability" : "division" };
}
