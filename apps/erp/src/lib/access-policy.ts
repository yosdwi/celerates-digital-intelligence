export type ActorClaims = { id?: string; status?: string; isOwner?: boolean };
// This audited pilot is intentionally owner-only. Multi-role rollout requires the
// row-level authorization work listed in docs/erp-audit, not an environment toggle.
export function assertPilotActor(actor: ActorClaims | null | undefined) {
  if (!actor?.id || actor.status !== "active" || actor.isOwner !== true) {
    throw new Error("Akses pilot hanya untuk Owner aktif.");
  }
  return actor as ActorClaims & { id: string };
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
