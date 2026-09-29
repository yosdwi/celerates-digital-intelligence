// Window events that connect the mobile shell to shared surfaces (no state library needed).
/** Opens the one Agent surface (components/agent/agent-panel.tsx listens for this). */
export const AGENT_OPEN_EVENT = "celerates:agent-open";
/** Opens the Akun sheet owned by the mobile tab bar. */
export const ACCOUNT_OPEN_EVENT = "celerates:account-open";

/** Optional intent carried by an Agent open: start an ask run, or attach a captured file (doc 18 §17). */
export type AgentOpenDetail = { ask?: string; file?: File };

export function openAgent(detail?: AgentOpenDetail | unknown) {
  // Also used directly as an onClick handler, so ignore anything that is not an intent.
  const intent = detail && typeof detail === "object" && ("ask" in detail || "file" in detail) ? (detail as AgentOpenDetail) : undefined;
  window.dispatchEvent(new CustomEvent<AgentOpenDetail | undefined>(AGENT_OPEN_EVENT, { detail: intent }));
}
