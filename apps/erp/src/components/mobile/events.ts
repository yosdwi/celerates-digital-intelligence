// Window events that connect the mobile shell to shared surfaces (no state library needed).
/** Opens the one Agent surface (components/agent/agent-panel.tsx listens for this). */
export const AGENT_OPEN_EVENT = "celerates:agent-open";
/** Opens the Akun sheet owned by the mobile tab bar. */
export const ACCOUNT_OPEN_EVENT = "celerates:account-open";

/** Optional intent carried by an Agent open: start an ask run, attach a captured file (doc 18 §17), or put text in
 *  the composer for the user to finish (`prefill`, e.g. "Tanya Agent" on a record). */
/** `full`: the conversation takes the page's main area instead of the right drawer (Beranda, QA doc page 22). */
export type AgentOpenDetail = { ask?: string; file?: File; prefill?: string; full?: boolean };

export function openAgent(detail?: AgentOpenDetail | unknown) {
  // Also used directly as an onClick handler, so ignore anything that is not an intent.
  const intent = detail && typeof detail === "object" && ("ask" in detail || "file" in detail || "prefill" in detail) ? (detail as AgentOpenDetail) : undefined;
  window.dispatchEvent(new CustomEvent<AgentOpenDetail | undefined>(AGENT_OPEN_EVENT, { detail: intent }));
}
