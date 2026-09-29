export type ActorClaims = { id?: string; status?: string; isOwner?: boolean; accountType?: string; access?: { divisionKey: string; level: string }[] };
export type Actor = ActorClaims & { id: string };
// Authority is the division RBAC (doc 22 §2.1): this is only the first gate -- an active backoffice user.
// A Talent account never passes it (Talent entry points use requireTalentActor). Each action adds its
// module authority after it (division level, Owner, or the record's own ownership rule).
export const isBackofficeClaims = (actor: ActorClaims | null | undefined) =>
  (actor?.accountType ?? "backoffice") !== "talent" || actor?.isOwner === true;
export function assertActor(actor: ActorClaims | null | undefined): Actor {
  if (!actor?.id || actor.status !== "active" || !isBackofficeClaims(actor)) {
    throw new Error("Akses hanya untuk pengguna backoffice aktif.");
  }
  return actor as Actor;
}
/** Owner-only modules (executive dashboard, kill switch, owner administration). */
export function assertOwner(actor: ActorClaims | null | undefined): Actor {
  const checked = assertActor(actor);
  if (checked.isOwner !== true) throw new Error("Aksi ini hanya untuk Owner.");
  return checked;
}
export function safeContextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  return value.split(/[?#]/)[0].replace(/[\x00-\x1f\x7f]/g, "").slice(0, 300);
}
export function safeExternalLink(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Link harus HTTP/HTTPS tanpa kredensial.");
  return url.toString();
}
