"use client";
import { useSyncExternalStore } from "react";

// Who occupies the right edge of the screen (docs/design/SALES-V2-CRISP-UX-CONTRACT.md §9). A record preview panel
// publishes the width it covers; the Celerates Agent launcher moves left by that much, and the panel steps aside
// while the Agent is open. Positions follow this state, never a z-index contest.
export type RightRail = {
  /** Pixels the record panel covers from the right edge of the viewport (0 when closed). */
  panelWidth: number;
  agentOpen: boolean;
  /** The record being inspected, kept so the Agent can use it as context later. */
  record: { type: string; id: string; label: string } | null;
};

const INITIAL: RightRail = { panelWidth: 0, agentOpen: false, record: null };
let state = INITIAL;
const listeners = new Set<() => void>();

export function setRightRail(patch: Partial<RightRail>) {
  const next = { ...state, ...patch };
  if (next.panelWidth === state.panelWidth && next.agentOpen === state.agentOpen && next.record === state.record) return;
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

export function useRightRail() {
  return useSyncExternalStore(subscribe, () => state, () => INITIAL);
}
