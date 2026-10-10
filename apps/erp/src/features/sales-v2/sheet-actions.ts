"use server";
// Sheet Sync dialog helpers (QA 2026-10-09): pick a spreadsheet the connected account can open and one of its tabs,
// instead of pasting a link. Owner may disconnect the account. Same guards as the V1 sheet-sync actions.
import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { googleAccounts } from "@/db/schema";
import { requestMeta, requireActor, requireOwner } from "@/lib/actor";
import { requireSalesSheetSync } from "@/lib/integration-policy";
import { audit } from "@/lib/security/audit";
import { extractSpreadsheetId, forgetSheetsToken, getSheetsToken, listSheetTabs, listSpreadsheets, SHEETS_PURPOSE } from "@/lib/google-sheets";

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Gagal menghubungi Google." });

export async function availableSheets(): Promise<Result<{ id: string; name: string; url: string }[]>> {
  await requireActor();
  await requireSalesSheetSync();
  try { return { ok: true, value: await listSpreadsheets(await getSheetsToken()) }; } catch (e) { return fail(e); }
}

export async function sheetTabs(urlOrId: string): Promise<Result<string[]>> {
  await requireActor();
  await requireSalesSheetSync();
  const id = extractSpreadsheetId(urlOrId) ?? (/^[A-Za-z0-9_-]{20,}$/.test(urlOrId) ? urlOrId : null);
  if (!id) return { ok: false, error: "Link Google Sheet tidak valid." };
  try { return { ok: true, value: await listSheetTabs(await getSheetsToken(), id) }; } catch (e) { return fail(e); }
}

export async function disconnectGoogleAccount(): Promise<void> {
  await requireActor();
  const owner = await requireOwner();
  await db.delete(googleAccounts).where(eq(googleAccounts.purpose, SHEETS_PURPOSE));
  forgetSheetsToken();
  await audit(sql, { action: "google_account_disconnect", decision: "allow", actorUserId: owner.id, sessionId: (owner as { sid?: string }).sid ?? null, reason: SHEETS_PURPOSE, ...(await requestMeta()) });
}
