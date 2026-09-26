"use client";
// Celerates Agent shell. Evolves `Bantuan Operasional` without regressing it:
//  • Perlu perhatian — the same deterministic ERP rules, counts, wording and links, plus `Tanyakan`,
//    `Tindak lanjuti` (signal → ERP-held proposal, ADR-010) and `Tindak lanjut berjalan` (live outcomes).
//  • Tanya — evidence-backed runs through the Intelligence Layer (AG-UI via the ERP BFF, ADR-008/013), including
//    dropped CSV/XLSX files that become proposals the user confirms in ERP.
//  • Masukan — the same contextual Feature Request form.
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertCircle, CheckCircle2, ClipboardList, Lightbulb, MessageSquareText, RefreshCw, Sparkles, X } from "lucide-react";
import { operationalContext, type OperationalContextResponse, type OperationalGroup } from "@/lib/operations/policy";
import { streamRun, type RunRequest } from "@/lib/agent/ag-ui-client";
import { applyEvent, newRun, type AgentRun } from "@/lib/agent/run-state";
import { AttentionGroup } from "./attention";
import { ContextualFeedback } from "./feedback";
import { FollowUps } from "./follow-ups";
import type { Suggestion } from "./agent-thread";

const AgentThread = dynamic(() => import("./agent-thread"), {
  ssr: false,
  loading: () => (
    <p role="status" className="p-5 text-sm text-slate-500">
      Memuat Agent…
    </p>
  ),
});

type Tab = "attention" | "ask" | "feedback";
type AgentContext = {
  enabled: boolean;
  context: { path: string; module: string; label: string };
  entity: { type: string; type_label: string; id: string; label: string; href: string } | null;
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
  const [tab, setTab] = useState<Tab>("attention");
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ path: string; data?: OperationalContextResponse; error?: string }>();
  const [loading, setLoading] = useState(false);
  const [agent, setAgent] = useState<{ path: string; data?: AgentContext }>();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [threadId] = useState(() => "thread-" + uuid());
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
    setTab((t) => (t === "feedback" ? "attention" : t));
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

  const startRun = useCallback(
    (skill: RunRequest["skill"], args: Record<string, string>, text: string) => {
      if (running) return;
      const runId = uuid();
      setTab("ask");
      setRuns((all) => [...all, newRun(runId, text)]);
      const controller = new AbortController();
      inflight.current = controller;
      const update = (fn: (run: AgentRun) => AgentRun) => setRuns((all) => all.map((r) => (r.runId === runId ? fn(r) : r)));
      streamRun({ runId, threadId, skill, args, path: pathname, text }, (event, id) => update((r) => applyEvent(r, event, id)), controller.signal).catch(() => {
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
    if (!response?.ok || !body?.id) return body?.error ?? "Berkas belum dapat diunggah.";
    startRun("import_dataset", { dataset_id: body.id }, `Impor berkas ${body.name} (${body.rows} baris)`);
    return null;
  };
  const suggestions: Suggestion[] = [];
  if (agentContext?.entity) {
    const e = agentContext.entity;
    suggestions.push({ label: `Jelaskan ${e.type_label} ${e.label}`, run: () => startRun("explain_entity", {}, `Jelaskan ${e.type_label} ${e.label}`) });
  }
  for (const group of attention.slice(0, 2)) suggestions.push({ label: `Kenapa perlu perhatian: ${group.title}?`, run: () => ask(group) });
  const agentReady = agentContext?.enabled === true;

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
        className="fixed bottom-6 right-6 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-gradient-to-br from-brand-600 to-brand-800 px-5 text-sm font-semibold text-white shadow-lg hover:from-brand-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
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
          className="fixed bottom-24 right-3 z-40 flex h-[min(680px,calc(100dvh-7rem))] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:right-6 sm:w-[440px]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-4">
            <div className="min-w-0">
              <h2 id="celerates-agent-title" className="text-base font-semibold text-slate-900">
                Celerates Agent
              </h2>
              <p className="mt-1 truncate text-xs text-slate-500" data-agent-context>
                {context.label} · {agentContext?.entity ? `${agentContext.entity.type_label} ${agentContext.entity.label}` : "ringkasan modul"}
              </p>
            </div>
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
          </header>
          <nav className="flex gap-2 border-b border-slate-100 px-5 py-3" aria-label="Isi Agent">
            <button aria-pressed={tab === "attention"} onClick={() => setTab("attention")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "attention" ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}>
              <ClipboardList className="h-3.5 w-3.5" />
              Perlu perhatian
            </button>
            <button aria-pressed={tab === "ask"} onClick={() => setTab("ask")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "ask" ? "bg-brand-50 text-brand-700" : "text-slate-500"}`}>
              <MessageSquareText className="h-3.5 w-3.5" />
              Tanya
            </button>
            <button aria-pressed={tab === "feedback"} onClick={() => setTab("feedback")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${tab === "feedback" ? "bg-pink-50 text-pink-700" : "text-slate-500"}`}>
              <Lightbulb className="h-3.5 w-3.5" />
              Masukan
            </button>
          </nav>
          {tab === "ask" ? (
            <div className="min-h-0 flex-1">
              <AgentThread runs={runs} running={running} enabled={agentReady} suggestions={suggestions} onSearch={(text) => startRun("ask", { query: text }, text)} onFile={importFile} onAction={(a) => startRun(a.skill, a.args, a.label)} />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
              {context.module === "sales" && (
                <Link href="/intelligence" onClick={() => setOpen(false)} className="mb-4 block rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
                  Review paket & akses Intelligence →
                </Link>
              )}
              {tab === "feedback" ? (
                <ContextualFeedback context={context} />
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {data
                        ? `Diperiksa ${new Date(data.asOf).toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" })} WIB`
                        : "Kondisi dari ERP"}
                    </span>
                    <button aria-label="Muat ulang ringkasan" disabled={loading} onClick={() => setRefresh((n) => n + 1)} className="inline-flex items-center gap-1.5 rounded-lg p-2 text-brand-600 disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                      Muat ulang
                    </button>
                  </div>
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
                        <AttentionGroup key={group.key} group={group} onAsk={agentReady && !running ? ask : undefined} onFollowUp={agentReady && !running ? followUp : undefined} />
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
                  <button onClick={() => setTab("feedback")} className="w-full rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-left text-sm font-medium text-pink-800">
                    Ada kendala di halaman ini? Kirim masukan →
                  </button>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </>
  );
}
