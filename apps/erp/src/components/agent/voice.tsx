"use client";
// Push-to-talk (ADR-012). Click to record, click again to stop (auto-stops after 60 s). The recording is transcribed
// and the text is placed in the composer for the user to review and send. Voice never sends or confirms anything.
import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";

const MAX_MS = 60000;
const TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

export function VoiceButton({ disabled, onTranscript, onError, autoStart = false, hero = false }: { disabled: boolean; onTranscript: (text: string) => void; onError: (message: string | null) => void; autoStart?: boolean; hero?: boolean }) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  // Once, on mount, when the user already pressed "Bicara" in the Agent invitation.
  useEffect(() => {
    if (autoStart && !disabled) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function start() {
    onError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("Mikrofon tidak dapat digunakan. Izinkan akses mikrofon atau ketik pertanyaan Anda.");
      return;
    }
    const mimeType = TYPES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setState("transcribing");
      const blob = new Blob(chunks, { type: (rec.mimeType || "audio/webm").split(";")[0] });
      const form = new FormData();
      form.append("file", blob, "speech");
      const response = await fetch("/api/agent/transcribe", { method: "POST", body: form }).catch(() => null);
      const body = await response?.json().catch(() => null);
      setState("idle");
      if (!response?.ok || typeof body?.text !== "string") return onError(body?.error ?? "Transkripsi belum tersedia; ketik pertanyaan Anda.");
      if (!body.text) return onError("Suara tidak terdengar jelas. Coba lagi atau ketik pertanyaan Anda.");
      onTranscript(body.text);
    };
    recorder.current = rec;
    rec.start();
    setState("recording");
    timer.current = window.setTimeout(() => rec.state === "recording" && rec.stop(), MAX_MS);
  }

  function stop() {
    if (timer.current) window.clearTimeout(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  const label = state === "recording" ? "Berhenti merekam" : state === "transcribing" ? "Mentranskripsi" : "Bicara (tekan untuk merekam)";
  // The empty Agent's big "Ceritakan lewat suara" button: same recorder, labelled pill.
  if (hero)
    return (
      <button
        type="button"
        aria-pressed={state === "recording"}
        data-agent-voice={state}
        disabled={disabled || state === "transcribing"}
        onClick={() => (state === "recording" ? stop() : void start())}
        className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-40 ${state === "recording" ? "animate-pulse border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-brand-300"}`}
      >
        {state === "transcribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "recording" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4 text-brand-600" />}
        {state === "recording" ? "Berhenti merekam" : state === "transcribing" ? "Mentranskripsi…" : "Ceritakan lewat suara"}
      </button>
    );
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={state === "recording"}
      data-agent-voice={state}
      disabled={disabled || state === "transcribing"}
      onClick={() => (state === "recording" ? stop() : void start())}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border disabled:opacity-40 ${state === "recording" ? "animate-pulse border-red-300 bg-red-50 text-red-700" : "border-slate-300 text-slate-600 hover:border-brand-300 hover:text-brand-700"}`}
    >
      {state === "transcribing" ? <Loader2 className="h-4 w-4 animate-spin" /> : state === "recording" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
    </button>
  );
}
