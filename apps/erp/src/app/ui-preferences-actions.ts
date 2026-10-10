"use server";
import { cookies } from "next/headers";
import { requireActor } from "@/lib/actor";
import { UI_PREF_COOKIE, isUiPref, serializeUiPrefs, uiPreferences, type UiPrefs } from "@/lib/ui-preferences";

/** One view preference for this browser (not a security setting; the cookie only picks a layout). */
export async function setUiPreference<K extends keyof UiPrefs>(key: K, value: UiPrefs[K]): Promise<void> {
  await requireActor();
  if (!isUiPref(key, value)) return;
  const next = { ...(await uiPreferences()), [key]: value };
  (await cookies()).set(UI_PREF_COOKIE, serializeUiPrefs(next), { path: "/", maxAge: 365 * 86_400, sameSite: "lax", secure: true, httpOnly: true });
}
