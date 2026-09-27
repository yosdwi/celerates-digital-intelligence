// Window events that connect the mobile shell to shared surfaces (no state library needed).
/** Opens the one Agent surface (components/agent/agent-panel.tsx listens for this). */
export const AGENT_OPEN_EVENT = "celerates:agent-open";
/** Opens the Akun sheet owned by the mobile tab bar. */
export const ACCOUNT_OPEN_EVENT = "celerates:account-open";

export function openAgent() {
  window.dispatchEvent(new CustomEvent(AGENT_OPEN_EVENT));
}
