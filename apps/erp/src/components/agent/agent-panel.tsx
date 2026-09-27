"use client";
// Celerates Agent: one conversational surface (ADR-017). One thread and one composer — text, voice, file, send — and
// the Agent routes each message to the capability it needs: ask/search/reason, document understanding, controlled
// ERP actions (ERP-held proposals, ADR-010) and feedback. Nothing from `Bantuan Operasional` regresses:
//  • Perlu perhatian is the proactive Ringkasan at the top: the same deterministic ERP rules, counts, wording and
//    links, with `Tanyakan`, `Tindak lanjuti`, trends and `Tindak lanjut berjalan`. It folds away once a
//    conversation starts and works without Intelligence.
//  • Masukan is understood from free text (reviewed drafts); the same contextual Feature Request form stays as a
//    fallback, always reachable, and is the path when the Agent is not configured.
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_OPEN_EVENT } from "@/components/mobile/events";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, ExternalLink, Lightbulb, RefreshCw, Sparkles, X } from "lucide-react";
import { operationalContext, type OperationalContextResponse, type OperationalGroup } from "@/lib/operations/policy";
import { streamRun, type RunRequest } from "@/lib/agent/ag-ui-client";
import { applyEvent, newRun, type AgentRun } from "@/lib/agent/run-state";
import { AttentionGroup } from "./attention";
import type { SignalTrend } from "@/lib/operations/reader";
import { ContextualFeedback } from "./feedback";
import { FollowUps } from "./follow-ups";
import type { Suggestion } from "./agent-thread";
import type { Attachment } from "./attachment-bar";

const AgentThread = dynamic(() => import("./agent-thread"), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-5 text-sm text-slate-500">
      Memuat Agent…
    </p>
  ),
});

type AgentContext = {
  enabled: boolean;
  context: { path: string; module: string; label: string; submodule?: { label: string; href: string } | null };
  entity: { type: string; type_label: string; id: string; label: string; href: string } | null;
  capabilities?: { reasoning: string; voice: boolean };
  console?: boolean;
};

function uuid() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) => (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16));
}

export function AgentPanel() {
  const pathname = usePathname();
  const { status } = useSession();
  const [open, setOpen] = useState(false);
  // Ringkasan (Perlu perhatian) is open until the conversation starts; the user can fold or unfold it any time.
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [form, setForm] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ path: string; data?: OperationalContextResponse & { trends?: Record<string, SignalTrend> }; error?: string }>();
  const [loading, setLoading] = useState(false);
  const [agent, setAgent] = useState<{ path: string; data?: AgentContext }>();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [threadId] = useState(() => "thread-" + uuid());
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const inflight = useRef<AbortController | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const context = operationalContext(pathname);
  const current = result?.path === pathname ? result : undefined;
  const data = current?.data;
  const attention = data?.groups.filter((g) => g.count > 0) ?? [];
  const clear = data?.groups.filter((g) => g.count === 0) ?? [];
  const agentContext = agent?.path === pathname ? agent.data : undefined;
  const running = runs.some((r) => r.status === "running");

  useEffect(() => {
    setOpen(false);
    setForm(false);
  }, [pathname]);
  useEffect(() => {
    if (status !== "authenticated") {
      setResult(undefined);
      setOpen(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/operations/context?path=${encodeURIComponent(pathname)}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ path: pathname, data });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ path: pathname, error: "Ringkasan belum dapat dimuat. Coba muat ulang." });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [pathname, status, refresh]);
  useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    fetch(`/api/agent/context?path=${encodeURIComponent(pathname)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) setAgent({ path: pathname, data: data ?? undefined });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [pathname, status]);
  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const reload = () => {
      if (document.visibilityState === "visible") setRefresh((n) => n + 1);
    };
    document.addEventListener("keydown", escape);
    window.addEventListener("focus", reload);
    const interval = window.setInterval(reload, 60000);
    return () => {
      document.removeEventListener("keydown", escape);
      window.removeEventListener("focus", reload);
      window.clearInterval(interval);
    };
  }, [open]);
  useEffect(() => () => inflight.current?.abort(), []);
  // The mobile shell opens the same Agent from its tab bar and Beranda (doc 18 §12).
  useEffect(() => {
    const openFromShell = () => {
      setOpen(true);
      setRefresh((n) => n + 1);
    };
    window.addEventListener(AGENT_OPEN_EVENT, openFromShell);
    return () => window.removeEventListener(AGENT_OPEN_EVENT, openFromShell);
  }, []);

  const startRun = useCallback(
    (skill: RunRequest["skill"], args: Record<string, unknown>, text: string, modality: "text" | "voice" = "text") => {
      if (running) return;
      const runId = uuid();
      setForm(false);
      setSummaryOpen(false);
      setRuns((all) => [...all, newRun(runId, text, skill)]);
      const controller = new AbortController();
      inflight.current = controller;
      const update = (fn: (run: AgentRun) => AgentRun) => setRuns((all) => all.map((r) => (r.runId === runId ? fn(r) : r)));
      streamRun({ runId, threadId, skill, args, path: pathname, text, modality }, (event, id) => update((r) => applyEvent(r, event, id)), controller.signal).catch(() => {
        if (!controller.signal.aborted) update((r) => applyEvent(r, { type: "RUN_ERROR", message: "Koneksi ke Agent terputus. Coba lagi.", code: "NETWORK" }));
      });
    },
    [pathname, running, threadId],
  );
  const ask = (group: OperationalGroup) => startRun("explain_signal", { signal_key: group.key }, `Tanyakan: ${group.title}`);
  const followUp = (group: OperationalGroup) => startRun("follow_up_signal", { signal_key: group.key }, `Tindak lanjuti: ${group.title}`);
  const importFile = async (file: File): Promise<string | null> => {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/agent/datasets", { method: "POST", body: form }).catch(() => null);
    const body = await response?.json().catch(() => null);
    if (!response?.ok || !body?.id) {
      const message = body?.error ?? "Berkas belum dapat diunggah.";
      // A scan cannot be read here, but it can still become a Company File, which is read with OCR (M6.x).
      if (/scan/i.test(message)) {
        setAttachment({ kind: "local", name: file.name, file, reason: "hasil scan; simpan ke Company Files agar dibaca dengan OCR" });
        return null;
      }
      return message;
    }
    if (body.kind === "document") {
      // A document stays attached to the conversation: later questions also search it.
      setAttachment({ kind: "dataset", id: body.id, name: body.name });
      startRun("read_document", { dataset_id: body.id }, `Baca berkas ${body.name} (${body.pages} halaman)`);
    } else {
      setAttachment({ kind: "table", id: body.id, name: body.name });
      startRun("import_dataset", { dataset_id: body.id }, `Impor berkas ${body.name} (${body.rows} baris)`);
    }
    return null;
  };
  const suggestions: Suggestion[] = [];
  if (attention.length) suggestions.push({ label: "Apa yang perlu aku perhatikan hari ini?", run: () => startRun("ask", { query: "Apa yang perlu aku perhatikan hari ini?" }, "Apa yang perlu aku perhatikan hari ini?") });
  if (agentContext?.entity) {
    const e = agentContext.entity;
    suggestions.push({ label: `Jelaskan ${e.type_label} ${e.label}`, run: () => startRun("explain_entity", {}, `Jelaskan ${e.type_label} ${e.label}`) });
  }
  for (const group of attention.slice(0, 2)) suggestions.push({ label: `Kenapa perlu perhatian: ${group.title}?`, run: () => ask(group) });
  const agentReady = agentContext?.enabled === true;
  const conversing = runs.length > 0;
  const checkedAt = data ? `${new Date(data.asOf).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB` : null;

  // Ringkasan: the proactive part of the Agent. ERP-only data, so it renders at once and without Intelligence.
  const summary = (
    <section aria-labelledby="agent-summary-title" data-agent-summary={summaryOpen ? "open" : "folded"} className={summaryOpen ? `min-h-0 overflow-y-auto overscroll-contain border-b border-slate-100 px-5 py-4 ${conversing ? "max-h-[45%] shrink-0" : "flex-1"}` : "shrink-0 border-b border-slate-100 px-5 py-2"}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setSummaryOpen(!summaryOpen)} aria-expanded={summaryOpen} className="inline-flex min-w-0 items-center gap-1.5 text-left text-xs font-semibold text-slate-700">
          <ClipboardList className="h-3.5 w-3.5 shrink-0 text-brand-600" />
          <span id="agent-summary-title">Perlu perhatian</span>
          {data && <span className={`rounded-full px-2 py-0.5 text-[11px] ${attention.length ? "bg-amber-100 text-amber-900" : "bg-emerald-50 text-emerald-800"}`}>{attention.length ? `${attention.length} kondisi` : "aman"}</span>}
          {summaryOpen ? <ChevronUp className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
        </button>
        <button aria-label="Muat ulang ringkasan" disabled={loading} onClick={() => setRefresh((n) => n + 1)} className="inline-flex items-center gap-1.5 rounded-lg p-1.5 text-[11px] text-brand-600 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {checkedAt ? `Diperiksa ${checkedAt}` : "Kondisi dari ERP"}
        </button>
      </div>
      {summaryOpen && (
        <div className="mt-3 space-y-4">
          {context.module === "sales" && (
            <Link href="/intelligence" onClick={() => setOpen(false)} className="block rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
              Review paket & akses Intelligence →
            </Link>
          )}
          {loading && !data && (
            <p role="status" className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
              Memeriksa kondisi ERP…
            </p>
          )}
          {current?.error && (
            <div role="alert" className="flex gap-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {current.error}
            </div>
          )}
          {data && (
            <>
              <p className="text-xs leading-relaxed text-slate-500">{data.coverage}</p>
              {attention.map((group) => (
                <AttentionGroup key={group.key} group={group} trend={data.trends?.[group.key]} onAsk={agentReady && !running ? ask : undefined} onFollowUp={agentReady && !running ? followUp : undefined} />
              ))}
              {!attention.length && data.groups.length > 0 && (
                <div className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-900">
                  <CheckCircle2 className="mb-2 h-5 w-5" />
                  Tidak ada record yang memenuhi kondisi perhatian yang diperiksa.
                </div>
              )}
              {clear.length > 0 && (
                <details className="rounded-xl border border-slate-200 p-3 text-xs text-slate-500">
                  <summary className="cursor-pointer">{clear.length} kondisi lain sudah diperiksa</summary>
                  <ul className="mt-3 space-y-2">
                    {clear.map((g) => (
                      <li key={g.key}>
                        {g.title}: 0 {g.unit}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          {agentReady && <FollowUps refresh={refresh + runs.filter((r) => r.status !== "running").length} />}
        </div>
      )}
    </section>
  );

  if (status !== "authenticated") return null;
  return (
    <>
      <button
        ref={trigger}
        onClick={() => {
          setOpen(!open);
          if (!open) setRefresh((n) => n + 1);
        }}
        aria-expanded={open}
        aria-controls="celerates-agent"
        className={`fixed bottom-6 right-6 z-40 h-14 items-center gap-2 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 px-5 text-sm font-semibold text-white shadow-lg hover:from-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 hidden md:inline-flex`}
      >
        <Sparkles className="h-5 w-5" />
        <span>Celerates Agent</span>
        {attention.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" aria-label={`${attention.length} kondisi perlu ditinjau`}>
            {attention.length}
          </span>
        )}
      </button>
      {open && (
        <section
          id="celerates-agent"
          role="dialog"
          aria-labelledby="celerates-agent-title"
          className="fixed inset-0 z-40 flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[min(720px,calc(100dvh-7rem))] sm:w-[440px] sm:rounded-2xl sm:border sm:border-slate-200 sm:shadow-2xl"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3">
            <div className="min-w-0">
              <h2 id="celerates-agent-title" className="text-base font-semibold text-slate-900">
                Celerates Agent
              </h2>
              {/* MS2 contextual envelope: what "ini" refers to, resolved by ERP from this page (doc 18 §16). */}
              <p className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-slate-600" data-agent-context data-agent-entity={agentContext?.entity?.type ?? ""}>
                <span className="max-w-full truncate rounded-full bg-white px-2 py-0.5 font-semibold ring-1 ring-slate-200">
                  {context.label}
                  {agentContext?.context.submodule ? ` › ${agentContext.context.submodule.label}` : ""}
                </span>
                {agentContext?.entity ? (
                  <span className="max-w-full truncate rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700 ring-1 ring-brand-100" title={`${agentContext.entity.type_label} ${agentContext.entity.label}`}>
                    {agentContext.entity.type_label} · {agentContext.entity.label}
                  </span>
                ) : (
                  <span className="truncate">ringkasan modul</span>
                )}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {agentContext?.console && (
                <a href="/api/agent/console" target="_blank" rel="noopener" title="Brain Console: kualitas & pembelajaran Agent" className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold text-brand-600 hover:bg-slate-200" data-agent-console-link>
                  Brain Console <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button
                ref={close}
                aria-label="Tutup Agent"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>
          {form ? (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5" data-agent-feedback-form>
              <button type="button" onClick={() => setForm(false)} className="mb-4 text-xs font-semibold text-brand-600 hover:underline">
                ← Kembali ke Agent
              </button>
              <ContextualFeedback context={context} />
            </div>
          ) : (
            <>
              {summary}
              <div className={conversing || !summaryOpen ? "min-h-0 flex-1" : "shrink-0"}>
                <AgentThread
                  runs={runs}
                  running={running}
                  enabled={agentReady}
                  suggestions={suggestions}
                  onSearch={(text, modality) =>
                    startRun(
                      "ask",
                      attachment?.kind === "file" ? { query: text, file_id: attachment.id } : attachment?.kind === "dataset" ? { query: text, dataset_id: attachment.id } : { query: text },
                      text,
                      modality,
                    )
                  }
                  onAttachFile={(file) => setAttachment({ ...file, kind: "file" })}
                  voice={agentContext?.capabilities?.voice === true}
                  onFile={importFile}
                  attachment={attachment}
                  onDetach={() => setAttachment(null)}
                  onAction={(a) => startRun(a.skill, a.args, a.label)}
                />
              </div>
              <p className="shrink-0 border-t border-slate-100 px-4 py-1.5 text-right text-[11px] text-slate-500">
                <button type="button" onClick={() => setForm(true)} className="inline-flex items-center gap-1 font-semibold text-pink-700 hover:underline">
                  <Lightbulb className="h-3 w-3" /> Formulir masukan
                </button>
              </p>
            </>
          )}
        </section>
      )}
    </>
  );
}
