// After a deploy, a tab opened on the previous build asks for script chunks and Server Actions that no longer exist.
// That is not a fault in the page: reload once onto the new build. The flag stops a reload loop if it keeps failing.
const STALE = /ChunkLoadError|Loading (CSS )?chunk|dynamically imported module|Server Action .* was not found|Failed to find Server Action/i;
const KEY = "erp-stale-reload";

export const isStaleBuild = (error: { name?: string; message?: string } | null | undefined) =>
  !!error && STALE.test(`${error.name ?? ""} ${error.message ?? ""}`);

/** True when the page is reloading onto the new build; false when it already tried in the last minute. */
export function reloadOnce(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
