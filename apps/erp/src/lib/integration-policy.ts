import { sheetsAccountEmail } from "./google-sheets";
import { requireDivisionAccess } from "./require-division-access";

/** External integrations (Google Sheet sync and similar) are off on the pilot. UIs read this to say so up front. */
export const INTEGRATIONS_ENABLED = false;

export async function integrationDisabled(): Promise<void> { throw new Error("Fitur ini belum diaktifkan pada pilot."); }

/**
 * Sales Google Sheet sync (Opportunity Tracker and PQ Tracker) is the exception (QA 2026-10-08): it runs on the company
 * Google account an Owner connected (or a service account), for Sales editors only. Call after the actor guard.
 */
export async function requireSalesSheetSync(): Promise<void> {
  if (!(await sheetsAccountEmail())) throw new Error("Google Sheet Sync belum aktif: akun Google belum dihubungkan.");
  await requireDivisionAccess("sales");
}
