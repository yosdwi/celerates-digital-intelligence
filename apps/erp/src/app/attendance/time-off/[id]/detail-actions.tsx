"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveTimeOffStep, rejectTimeOffStep, cancelTimeOffRequestAction } from "./actions";

export function ApproveRejectButtons({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");

  function approve() {
    setError(null);
    startTransition(async () => {
      const result = await approveTimeOffStep(requestId);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  function reject() {
    setError(null);
    startTransition(async () => {
      const result = await rejectTimeOffStep(requestId, notes);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {rejecting && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Alasan penolakan (opsional)"
          rows={2}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white"
        />
      )}
      <div className="flex gap-2">
        {!rejecting ? (
          <>
            <button type="button" onClick={approve} disabled={isPending} className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              Approve
            </button>
            <button type="button" onClick={() => setRejecting(true)} disabled={isPending} className="flex-1 rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-60">
              Reject
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={reject} disabled={isPending} className="flex-1 rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
              Kirim Penolakan
            </button>
            <button type="button" onClick={() => setRejecting(false)} disabled={isPending} className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
              Batal
            </button>
          </>
        )}
      </div>
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}

export function CancelButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    if (!confirm("Batalkan request Time Off ini?")) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelTimeOffRequestAction(requestId);
      if (!result.ok) { setError(result.error); return; }
      router.refresh();
    });
  }

  return (
    <div>
      <button type="button" onClick={cancel} disabled={isPending} className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60">
        Cancel request
      </button>
      {error && <p className="mt-1 text-xs font-medium text-rose-600">{error}</p>}
    </div>
  );
}
