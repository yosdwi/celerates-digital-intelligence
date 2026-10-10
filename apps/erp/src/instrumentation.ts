// Runs once when the server starts (Next.js instrumentation): the Sales mailbox sync (lib/mail/sync.ts) and the
// workflow scheduler. The import
// sits inside the runtime check so the edge build drops it (Next.js docs, instrumentation).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startMailSync } = await import("./lib/mail/sync");
    startMailSync();
    // Workflows (lib/workflows/engine.ts): scheduled runs, checked every minute.
    const { startWorkflowScheduler } = await import("./lib/workflows/engine");
    startWorkflowScheduler();
  }
}
