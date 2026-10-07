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
import { AGENT_OPEN_EVENT, type AgentOpenDetail } from "@/components/mobile/events";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, ChevronUp, ClipboardList, ExternalLink, Lightbulb, Mic, RefreshCw, Sparkles, X } from "lucide-react";
import { operationalContext, type OperationalContextResponse, type OperationalGroup } from "@/lib/operations/policy";
import { streamRun, type RunRequest } from "@/lib/agent/ag-ui-client";
import { applyEvent, newRun, type AgentRun } from "@/lib/agent/run-state";
import { AttentionGroup } from "./attention";
import { setRightRail, useRightRail } from "@/lib/right-rail";
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

// First visit: a short invitation above the launcher (pilot: ask, or tell us how the ERP works for you). Once per browser.
const INTRO_KEY = "celerates.agent.intro.v1";
// Docked width of the drawer on large screens; the page narrows by this much instead of being covered (Railway-style).
const RAIL_WIDTH = "400px";

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
  // Right-rail contract: a record preview steps aside while the Agent is open, and the launcher sits left of an open
  // preview instead of on top of it (docs/design/SALES-V2-CRISP-UX-CONTRACT.md §9).
  const rail = useRightRail();
  useEffect(() => setRightRail({ agentOpen: open }), [open]);
  // Docked on lg+: the app shell and the fixed top-right controls read --agent-rail and move left by the drawer width.
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const apply = () => document.documentElement.style.setProperty("--agent-rail", open && mql.matches ? RAIL_WIDTH : "0px");
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, [open]);
  const [intro, setIntro] = useState(false);
  useEffect(() => {
    if (status !== "authenticated") return;
    let seen = true;
    try { seen = localStorage.getItem(INTRO_KEY) === "1"; } catch { /* storage blocked: do not nag */ }
    if (seen) return;
    const timer = window.setTimeout(() => setIntro(true), 1200);
    return () => window.clearTimeout(timer);
  }, [status]);
  const dismissIntro = () => {
    setIntro(false);
    try { localStorage.setItem(INTRO_KEY, "1"); } catch { /* not kept; shows again next visit */ }
  };
  // "Bicara" from the invitation opens the Agent already recording (push-to-talk still only fills the composer).
  const [autoVoice, setAutoVoice] = useState(false);
  useEffect(() => { if (!open) setAutoVoice(false); }, [open]);
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
  // Beranda search ("Tanya Agent: …") and Tangkap ("Lampirkan ke Agent") open it with an intent (doc 18 §17).
  const intent = useRef<AgentOpenDetail | null>(null);
  const [intentTick, setIntentTick] = useState(0);
  useEffect(() => {
    const openFromShell = (event: Event) => {
      const detail = (event as CustomEvent<AgentOpenDetail | undefined>).detail;
      if (detail?.ask || detail?.file) {
        intent.current = detail;
        setIntentTick((n) => n + 1);
      }
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
  useEffect(() => {
    const pending = intent.current;
    if (!pending || !open || running) return;
    if (pending.ask) {
      if (!agentReady) return;
      intent.current = null;
      startRun("ask", { query: pending.ask }, pending.ask);
    } else if (pending.file) {
      intent.current = null;
      const file = pending.file;
      void importFile(file).then((message) => message && setAttachment({ kind: "local", name: file.name, file, reason: message }));
    }
    // importFile is recreated each render; the intent is consumed once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentTick, open, running, agentReady, startRun]);
  const conversing = runs.length > 0;
  const checkedAt = data ? `${new Date(data.asOf).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB` : null;

  // Ringkasan: the proactive part of the Agent. ERP-only data, so it renders at once and without Intelligence.
  const summary = (
    <section aria-labelledby="agent-summary-title" data-agent-summary={summaryOpen ? "open" : "folded"} className={summaryOpen ? `min-h-0 overflow-y-auto overscroll-contain border-b border-slate-100 px-4 py-3 ${conversing ? "max-h-[45%] shrink-0" : "flex-1"}` : "shrink-0 border-b border-slate-100 px-4 py-2"}>
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
        <div className="mt-3 space-y-3">
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
  const openAgentPanel = () => {
    dismissIntro();
    setOpen(true);
    setRefresh((n) => n + 1);
  };
  const voiceReady = agentReady && agentContext?.capabilities?.voice === true;
  const launcherStyle = rail.panelWidth ? { right: rail.panelWidth + 24 } : undefined;
  return (
    <>
      <button
        ref={trigger}
        onClick={() => (open ? setOpen(false) : openAgentPanel())}
        aria-expanded={open}
        aria-controls="celerates-agent"
        style={launcherStyle}
        className={`fixed bottom-6 right-6 z-40 h-12 items-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold text-white shadow-lg hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600 ${open ? "hidden" : "hidden md:inline-flex"}`}
      >
        <Sparkles className="h-4 w-4" />
        <span>Celerates Agent</span>
        {attention.length > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900" aria-label={`${attention.length} kondisi perlu ditinjau`}>
            {attention.length}
          </span>
        )}
      </button>
      {intro && !open && (
        <section
          role="dialog"
          aria-label="Perkenalan Agent"
          data-agent-intro-popup
          style={launcherStyle}
          className="fixed bottom-20 right-6 z-40 hidden w-[320px] rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_16px_48px_rgba(9,34,54,0.18)] md:block"
        >
          <button type="button" aria-label="Tutup perkenalan" onClick={dismissIntro} className="absolute right-2 top-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
          {voiceReady && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => { setAutoVoice(true); openAgentPanel(); }}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-4 text-sm font-medium text-slate-800 shadow-sm hover:border-brand-300"
              >
                <span aria-hidden className="h-8 w-8 rounded-full bg-[radial-gradient(circle_at_35%_30%,#e8eefd,#2356e8_75%)]" />
                <Mic className="h-4 w-4 text-slate-500" /> Bicara sekarang
              </button>
            </div>
          )}
          <p className="mt-3 text-sm font-semibold text-slate-900">Ada yang ingin ditanyakan atau diceritakan?</p>
          <p className="mt-1 text-[13px] leading-5 text-slate-600">Kami sedang pilot. Ceritakan pengalaman Anda memakai ERP ini atau kebutuhan yang belum ada.</p>
          {agentReady && (
            <form
              className="mt-3 flex items-center gap-1 rounded-xl border border-slate-300 py-1 pl-3 pr-1 focus-within:ring-2 focus-within:ring-brand-400"
              onSubmit={(e) => {
                e.preventDefault();
                const text = String(new FormData(e.currentTarget).get("q") ?? "").trim();
                if (!text) return;
                intent.current = { ask: text };
                setIntentTick((n) => n + 1);
                openAgentPanel();
              }}
            >
              <input name="q" aria-label="Pesan untuk Agent" placeholder="Tanya atau beri masukan…" maxLength={1000} autoComplete="off" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none" />
              <button type="submit" aria-label="Kirim" className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white hover:bg-brand-700">
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
          <button type="button" onClick={() => { setForm(true); openAgentPanel(); }} className="mt-2 text-[12px] font-medium text-slate-500 hover:text-slate-800 hover:underline">
            Isi formulir masukan
          </button>
        </section>
      )}
      {open && (
        <section
          id="celerates-agent"
          role="dialog"
          aria-labelledby="celerates-agent-title"
          className="fixed inset-0 z-50 flex h-[100dvh] w-full flex-col overflow-hidden bg-white sm:inset-y-0 sm:left-auto sm:right-0 sm:z-40 sm:w-[400px] sm:border-l sm:border-slate-200 sm:shadow-[-8px_0_24px_rgba(9,34,54,0.06)] lg:shadow-none"
        >
          <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-4">
            <div className="flex min-w-0 items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
              <h2 id="celerates-agent-title" className="shrink-0 text-sm font-semibold text-slate-900">
                Celerates Agent
              </h2>
              {/* MS2 contextual envelope: what "ini" refers to, resolved by ERP from this page (doc 18 §16). */}
              <span
                className="min-w-0 truncate rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600"
                data-agent-context
                data-agent-entity={agentContext?.entity?.type ?? ""}
                title={agentContext?.entity ? `${agentContext.entity.type_label} ${agentContext.entity.label}` : undefined}
              >
                {context.label}
                {agentContext?.context.submodule ? ` › ${agentContext.context.submodule.label}` : ""}
                {agentContext?.entity ? ` · ${agentContext.entity.label}` : ""}
              </span>
            </div>
            <div className="flex shrink-0 items-center">
              {agentContext?.console && (
                <a href="/api/agent/console" target="_blank" rel="noopener" aria-label="Brain Console" title="Brain Console: kualitas & pembelajaran Agent" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800" data-agent-console-link>
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                ref={close}
                aria-label="Tutup Agent"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
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
                  autoVoice={autoVoice}
                />
              </div>
              <p className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 px-4 py-1.5 text-[11px] text-slate-500">
                {context.module === "sales" ? (
                  <Link href="/intelligence" onClick={() => setOpen(false)} className="hover:text-slate-800 hover:underline">
                    Paket & akses Intelligence
                  </Link>
                ) : <span />}
                <button type="button" onClick={() => setForm(true)} className="inline-flex items-center gap-1 font-medium hover:text-slate-800 hover:underline">
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
