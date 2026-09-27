"use client";
// A draft the Agent prepared from free text (ADR-017): a knowledge correction or feedback on an earlier answer.
// Held by Intelligence, owned by this user, sent only when they press Kirim. ERP data never changes here.
import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquareWarning } from "lucide-react";
import type { Submission } from "@/lib/agent/run-state";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400";
const AFTER: Record<Submission["intent"], string> = {
  knowledge_correction: "Terkirim ke kurator. Pengetahuan berubah hanya setelah kurator meninjaunya.",
  agent_feedback: "Terkirim. Tim melihatnya bersama jejak jawaban tersebut.",
  feature_request: "Terkirim.",
  data_correction: "Terkirim.",
};

// Edits survive a remount (the thread re-keys parts while a run is still streaming).
const drafts = new Map<string, { title: string; body: string; state: "draft" | "sending" | "submitted" | "cancelled" }>();

export function SubmissionCard({ value }: { value: Submission }) {
  const saved = drafts.get(value.id);
  const [title, setTitleState] = useState(saved?.title ?? value.title);
  const [body, setBodyState] = useState(saved?.body ?? value.body);
  const [state, setStateValue] = useState<"draft" | "sending" | "submitted" | "cancelled">(saved?.state ?? "draft");
  const remember = (patch: Partial<{ title: string; body: string; state: "draft" | "sending" | "submitted" | "cancelled" }>) =>
    drafts.set(value.id, { title, body, state, ...drafts.get(value.id), ...patch });
  const setTitle = (v: string) => { remember({ title: v }); setTitleState(v); };
  const setBody = (v: string) => { remember({ body: v }); setBodyState(v); };
  const setState = (v: "draft" | "sending" | "submitted" | "cancelled") => { remember({ state: v }); setStateValue(v); };
  const [error, setError] = useState("");
  async function send(action: "submit" | "cancel") {
    setState("sending");
    setError("");
    const response = await fetch(`/api/agent/submissions/${value.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(action === "submit" ? { action, title, body } : { action }),
    }).catch(() => null);
    const result = await response?.json().catch(() => null);
    if (!response?.ok) {
      setState("draft");
      setError(result?.error ?? "Draf belum dapat dikirim. Coba lagi.");
      return;
    }
    setState(result?.state === "cancelled" ? "cancelled" : "submitted");
  }
  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm" data-agent-submission={value.intent} aria-label={`Draf ${value.label}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-900">
        <MessageSquareWarning className="h-3.5 w-3.5" /> Draf {value.label}
      </p>
      {value.refs.length > 0 && <p className="mt-1 text-xs text-slate-600">Tentang: {value.refs.join("; ")}</p>}
      {state === "submitted" || state === "cancelled" ? (
        <p role="status" className="mt-2 flex items-center gap-1.5 text-xs text-emerald-800">
          <CheckCircle2 className="h-3.5 w-3.5" /> {state === "cancelled" ? "Draf dibatalkan. Tidak ada yang dikirim." : AFTER[value.intent]}
        </p>
      ) : (
        <form
          className="mt-2 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send("submit");
          }}
        >
          <label className="block text-xs text-slate-600">
            Judul
            <input className={inputClass} value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-xs text-slate-600">
            Isi
            <textarea className={inputClass} value={body} rows={3} maxLength={3000} required onChange={(e) => setBody(e.target.value)} />
          </label>
          {error && (
            <p role="alert" className="text-xs text-amber-900">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={state === "sending" || !title.trim() || !body.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              {state === "sending" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Kirim
            </button>
            <button type="button" disabled={state === "sending"} onClick={() => void send("cancel")} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100">
              Batal
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
