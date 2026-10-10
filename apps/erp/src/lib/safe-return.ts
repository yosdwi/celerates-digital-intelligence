/**
 * Where a Sales action may send the user back to. Sales V2 passes its own URL (with view state) so a redirecting
 * action lands where the user was; anything that is not a plain same-site Sales path falls back to V1's list.
 */
export function safeSalesReturnPath(value: unknown, fallback = "/sales/opportunity-tracker"): string {
  if (typeof value !== "string" || value.length > 2000) return fallback;
  return /^\/sales\/[A-Za-z0-9\-_/?=&%.,:+]*$/.test(value) ? value : fallback;
}
