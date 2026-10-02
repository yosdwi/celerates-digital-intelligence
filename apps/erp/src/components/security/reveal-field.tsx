"use client";
// A masked identity number with "Tampilkan". The server decides (capability, scope, step-up) and audits; the plaintext
// is only held in this component's state until the page is left.
import { useState } from "react";
import { revealField } from "@/lib/security/actions";
import type { IdentityField } from "@/lib/people/identity";
import { useStepUp } from "./step-up";

export function RevealField({ label, masked, onboardingId, field }: { label: string; masked: string | null; onboardingId: string; field: IdentityField }) {
  const [value, setValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { ensure, dialog } = useStepUp();

  async function reveal() {
    setBusy(true);
    setError(null);
    let result = await revealField(onboardingId, field);
    if (!result.ok && result.error === "step_up_required" && (await ensure())) result = await revealField(onboardingId, field);
    setBusy(false);
    if (result.ok) setValue(result.value ?? "-");
    else if (result.error !== "step_up_required") setError("Tidak punya izin melihat data ini.");
  }

  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 flex items-center gap-2 text-slate-900">
        <span className="font-mono">{value ?? masked ?? "-"}</span>
        {masked && value === null && (
          <button type="button" onClick={reveal} disabled={busy} className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50">
            {busy ? "…" : "Tampilkan"}
          </button>
        )}
      </p>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {dialog}
    </div>
  );
}
