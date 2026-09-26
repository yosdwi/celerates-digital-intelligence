// ERP sign-in to the Brain Console (ADR-016). The session Owner gets a short-lived, console-scoped assertion signed
// by ERP, handed to the Intelligence web in the URL fragment (never sent to a server by the browser).
import { NextResponse } from "next/server";
import { agentActor, agentEnabled, BffError } from "@/lib/agent/bff";
import { mintConsoleSignIn } from "@/lib/agent/delegation";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
function consoleUrl(): string | null {
  const raw = process.env.INTELLIGENCE_CONSOLE_URL || process.env.INTELLIGENCE_BASE_URL;
  if (!raw) return null;
  const url = new URL(raw);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
  return url.origin;
}
export async function GET() {
  try {
    const actor = await agentActor();
    const origin = consoleUrl();
    if (!agentEnabled() || !origin) throw new BffError(503, "Brain Console belum dikonfigurasi.");
    if (actor.isOwner !== true) throw new BffError(403, "Brain Console hanya untuk Owner.");
    const token = mintConsoleSignIn({ id: actor.id, name: actor.name, owner: true });
    return NextResponse.redirect(`${origin}/app/agent#erp_token=${token}`, { status: 303, headers });
  } catch (error) {
    if (error instanceof BffError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error("agent_console_signin_failed");
    return NextResponse.json({ error: "Brain Console belum dapat dibuka." }, { status: 503, headers });
  }
}
