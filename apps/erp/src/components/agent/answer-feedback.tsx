"use client";
// "Membantu?" under a completed Agent answer (ADR-015). The user's judgement is an observation for the Brain
// Console's quality measures; it never changes ERP data or company knowledge.
import { useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";

const REASONS: [string, string][] = [
  ["wrong", "Salah"],
  ["incomplete", "Kurang lengkap"],
  ["irrelevant", "Tidak relevan"],
  ["other", "Lainnya"],
];

export function AnswerFeedback({ runId }: { runId: string }) {
  const [rating, setRating] = useState<1 | -1 | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function send(value: 1 | -1, why: string | null = null, note = "") {
    setState("saving");
    const response = await fetch(`/api/agent/runs/${runId}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: value, reason: why, comment: note }),
    }).catch(() => null);
    setState(response?.ok ? "saved" : "error");
  }

  if (state === "saved" && (rating === 1 || reason))
    return (
      <p className="text-[11px] text-slate-500" data-answer-feedback="saved">
        Terima kasih — umpan balik tercatat untuk evaluasi kualitas Agent.
      </p>
    );
  return (
    <div className="space-y-2 text-[11px] text-slate-500" data-answer-feedback={rating === -1 ? "negative" : "ask"}>
      <div className="flex items-center gap-2">
        <span>Membantu?</span>
        <button type="button" aria-label="Jawaban membantu" aria-pressed={rating === 1} onClick={() => { setRating(1); void send(1); }} className={`rounded-md p-1 hover:bg-slate-100 ${rating === 1 ? "text-emerald-700" : ""}`}>
          <ThumbsUp className="h-3.5 w-3.5" />
        </button>
        <button type="button" aria-label="Jawaban tidak membantu" aria-pressed={rating === -1} onClick={() => setRating(-1)} className={`rounded-md p-1 hover:bg-slate-100 ${rating === -1 ? "text-red-700" : ""}`}>
          <ThumbsDown className="h-3.5 w-3.5" />
        </button>
        {state === "error" && <span role="alert" className="text-amber-800">Belum tersimpan. Coba lagi.</span>}
      </div>
      {rating === -1 && (
        <form
          className="space-y-2 rounded-lg border border-slate-200 p-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (reason) void send(-1, reason, comment);
          }}
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Apa yang kurang?">
            {REASONS.map(([code, label]) => (
              <button key={code} type="button" role="radio" aria-checked={reason === code} onClick={() => setReason(code)} className={`rounded-full border px-2 py-0.5 ${reason === code ? "border-brand-400 bg-brand-50 text-brand-700" : "border-slate-200"}`}>
                {label}
              </button>
            ))}
          </div>
          <input aria-label="Catatan (opsional)" placeholder="Catatan (opsional)" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs" />
          <button type="submit" disabled={!reason || state === "saving"} className="rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white disabled:opacity-40">
            Kirim umpan balik
          </button>
        </form>
      )}
    </div>
  );
}
