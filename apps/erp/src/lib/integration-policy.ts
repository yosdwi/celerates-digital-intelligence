/** External integrations (Google Sheet sync and similar) are off on the pilot. UIs read this to say so up front. */
export const INTEGRATIONS_ENABLED = false;

export async function integrationDisabled(): Promise<void> { throw new Error("Fitur ini belum diaktifkan pada pilot."); }
