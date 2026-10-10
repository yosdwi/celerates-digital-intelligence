// The person's view preferences (QA 2026-10-09): which app shell, the sidebar tone and the page look. Kept in a cookie
// so the server renders the right one at once (no flash), and so any view can be switched back without a deploy.
import { cookies } from "next/headers";

export type UiPrefs = { shell: "crisp" | "classic"; sidebar: "light" | "dark"; look: "v1" | "hybrid" };
export const UI_PREF_COOKIE = "erp_ui";
export const DEFAULT_UI_PREFS: UiPrefs = { shell: "crisp", sidebar: "light", look: "v1" };
const ALLOWED: { [K in keyof UiPrefs]: readonly UiPrefs[K][] } = { shell: ["crisp", "classic"], sidebar: ["light", "dark"], look: ["v1", "hybrid"] };

/** "shell=crisp;sidebar=dark" → prefs; unknown keys or values fall back to the defaults. */
export function parseUiPrefs(raw: string | undefined): UiPrefs {
  const out = { ...DEFAULT_UI_PREFS };
  for (const part of (raw ?? "").split(";")) {
    const [k, v] = part.split("=") as [keyof UiPrefs, string];
    if (k in ALLOWED && (ALLOWED[k] as readonly string[]).includes(v)) (out as Record<string, string>)[k] = v;
  }
  return out;
}
export const serializeUiPrefs = (p: UiPrefs) => `shell=${p.shell};sidebar=${p.sidebar};look=${p.look}`;
export const isUiPref = <K extends keyof UiPrefs>(k: K, v: unknown): v is UiPrefs[K] => (ALLOWED[k] as readonly unknown[] | undefined)?.includes(v) === true;

export async function uiPreferences(): Promise<UiPrefs> {
  return parseUiPrefs((await cookies()).get(UI_PREF_COOKIE)?.value);
}
