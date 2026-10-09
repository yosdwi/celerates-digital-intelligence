"use client";
// Workflows UI (QA doc pages 18–19, Attio's Workflows): a list with Live switches and a template gallery; a workflow
// page with Editor (Crisp FlowCanvas plus settings), Runs (history, steps of a run, overview) and Pengaturan.
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Circle, CircleX, Loader2, Play, Plus, Sparkles, Workflow as WorkflowIcon, Zap } from "lucide-react";
import { Badge, Button, Callout, Dialog, DialogBody, FlowCanvas, Input, Segmented, Select, Switch } from "@crisp-ui-kit/crisp";
import { createWorkflow, deleteWorkflow, runWorkflowNow, setWorkflowEnabled, updateWorkflow } from "@/app/automation/workflows/actions";
import { TEMPLATES, cleanConfig, describeSchedule, templateOf, type Schedule, type Step, type Template, type WorkflowConfig } from "@/lib/workflows/templates";

export type WorkflowRow = {
  id: string; name: string; template: string; enabled: boolean; config: unknown; owner: string | null;
  nextRunAt: string | null; lastRun: { status: string; startedAt: string } | null;
};
export type RunRow = { id: string; number: number; trigger: string; status: string; startedAt: string; finishedAt: string | null; steps: { id: string; title: string; status: string; message: string }[]; summary: string | null };

const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }).format(new Date(iso)) : "—");
const STATUS: Record<string, { text: string; tone: "success" | "danger" | "brand" | "neutral"; Icon: React.ComponentType<{ className?: string }> }> = {
  succeeded: { text: "Selesai", tone: "success", Icon: CheckCircle2 },
  failed: { text: "Gagal", tone: "danger", Icon: CircleX },
  running: { text: "Berjalan", tone: "brand", Icon: Loader2 },
};

// ── List ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Templates hold functions (steps), so they are imported here rather than passed from the server page.
export function WorkflowList({ rows, canEdit }: { rows: WorkflowRow[]; canEdit: boolean }) {
  const templates = TEMPLATES;
  const router = useRouter();
  const [creating, setCreating] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const tpl = (k: string) => templates.find((t) => t.key === k);

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-8 px-6 py-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] text-slate-500">Otomasi yang berjalan sendiri sesuai jadwal. Setiap run tercatat lengkap dengan langkah-langkahnya.</p>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-[13px] text-slate-500">Belum ada workflow. Mulai dari template di bawah.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-[13.5px]">
              <thead className="text-left text-[12px] text-slate-500">
                <tr className="border-b border-slate-100">
                  <th className="px-4 py-2.5 font-medium">Nama</th><th className="px-4 py-2.5 font-medium">Jadwal</th>
                  <th className="px-4 py-2.5 font-medium">Run terakhir</th><th className="px-4 py-2.5 font-medium">Berikutnya</th>
                  <th className="px-4 py-2.5 font-medium">Pemilik</th><th className="px-4 py-2.5 font-medium">Live</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((w) => {
                  const t = tpl(w.template);
                  const cfg = t ? cleanConfig(t, w.config) : null;
                  const s = w.lastRun ? STATUS[w.lastRun.status] : null;
                  return (
                    <tr key={w.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5">
                        <Link href={`/automation/workflows/${w.id}`} className="font-medium text-slate-900 hover:underline">{w.name}</Link>
                        <span className="block text-[12px] text-slate-500">{t?.name ?? w.template}</span>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700">{cfg ? describeSchedule(cfg.schedule) : "—"}</td>
                      <td className="px-4 py-2.5">{s ? <span className="inline-flex items-center gap-1.5"><Badge size="small" tone={s.tone}>{s.text}</Badge><span className="text-[12px] text-slate-500">{when(w.lastRun!.startedAt)}</span></span> : <span className="text-slate-400">Belum pernah</span>}</td>
                      <td className="px-4 py-2.5 text-slate-700">{w.enabled ? when(w.nextRunAt) : "—"}</td>
                      <td className="px-4 py-2.5 text-slate-700">{w.owner ?? "—"}</td>
                      <td className="px-4 py-2.5">
                        <Switch checked={w.enabled} disabled={!canEdit || pending} aria-label={`Live ${w.name}`}
                          onCheckedChange={(on) => start(async () => { const r = await setWorkflowEnabled(w.id, on); if (!r.ok) setError(r.error); router.refresh(); })} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-[13px] font-medium text-slate-500">Template</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {templates.map((t) => (
            <button key={t.key} type="button" disabled={!canEdit} onClick={() => { setCreating(t); setName(t.name); setError(null); }}
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-60">
              <span className="inline-flex w-fit items-center gap-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600"><WorkflowIcon className="h-3 w-3" /> {t.category}</span>
              <span className="text-[14px] font-medium text-slate-900">{t.name}</span>
              <span className="text-[12.5px] leading-snug text-slate-500">{t.description}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-[12.5px] font-medium text-[#194667]"><Plus className="h-3.5 w-3.5" /> Pakai template</span>
            </button>
          ))}
        </div>
        {!canEdit && <p className="mt-2 text-[12.5px] text-slate-500">Membuat workflow butuh akses Full di Automasi (atau Owner).</p>}
      </section>

      <Dialog open={!!creating} onOpenChange={(o) => !o && setCreating(null)} title={creating ? `Buat: ${creating.name}` : ""} closeLabel="Tutup" width={460}>
        {creating && (
          <DialogBody className="space-y-3">
            <p className="text-[13px] text-slate-600">{creating.description}</p>
            <label className="block text-[13px] font-medium text-slate-700">Nama workflow
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <p className="text-[12.5px] text-slate-500">Workflow dibuat dalam keadaan <b>mati</b>. Atur jadwal dan coba "Jalankan sekarang" dulu, lalu nyalakan Live.</p>
            {error && <p className="text-[13px] text-red-600">{error}</p>}
            <div className="flex justify-end">
              <Button intent="primary" size="sm" loading={pending} onClick={() => start(async () => {
                const r = await createWorkflow(creating.key, name);
                if (!r.ok) return setError(r.error);
                router.push(`/automation/workflows/${r.id}`);
              })}>Buat workflow</Button>
            </div>
          </DialogBody>
        )}
      </Dialog>
    </div>
  );
}

// ── One workflow ─────────────────────────────────────────────────────────────────────────────────────────────
type CanvasNode = Step & { x: number; y: number };
const KIND: Record<Step["kind"], { text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  trigger: { text: "Pemicu", Icon: CalendarClock }, step: { text: "Langkah", Icon: Zap }, action: { text: "Aksi", Icon: Sparkles },
};

export function WorkflowDetail({ wf, runs, canEdit }: { wf: WorkflowRow; runs: RunRow[]; canEdit: boolean }) {
  const template = templateOf(wf.template)!;
  const router = useRouter();
  const [tab, setTab] = useState<"editor" | "runs" | "settings">("editor");
  const [config, setConfig] = useState<WorkflowConfig>(() => cleanConfig(template, wf.config));
  const [name, setName] = useState(wf.name);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [selectedRun, setSelectedRun] = useState<string | null>(runs[0]?.id ?? null);
  const steps = template.steps(config);
  const [nodes, setNodes] = useState<CanvasNode[]>(() => steps.map((s, i) => ({ ...s, x: 40 + i * 290, y: 140 })));
  // Node text follows the settings; positions are the person's own.
  const shown = nodes.map((n) => ({ ...n, ...steps.find((s) => s.id === n.id) }));
  const last = runs[0];
  const lastStatus = (id: string) => (id === "t" ? (last ? "ok" : null) : last?.steps.find((s) => s.id === id)?.status ?? null);
  const dirty = JSON.stringify(config) !== JSON.stringify(cleanConfig(template, wf.config)) || name !== wf.name;
  const schedule = config.schedule;
  const setSchedule = (p: Partial<Schedule>) => setConfig((c) => ({ ...c, schedule: { ...c.schedule, ...p } }));

  const save = () => start(async () => {
    const r = await updateWorkflow(wf.id, { name, config });
    setMessage(r.ok ? { tone: "success", text: "Tersimpan." } : { tone: "danger", text: r.error });
    router.refresh();
  });
  const runNow = () => start(async () => {
    const r = await runWorkflowNow(wf.id);
    setMessage(r.ok ? { tone: "success", text: "Run selesai, lihat tab Runs." } : { tone: "danger", text: r.error });
    if (r.ok && r.id) { setSelectedRun(r.id); setTab("runs"); }
    router.refresh();
  });

  const stats = useMemo(() => {
    const done = runs.filter((r) => r.status === "succeeded").length, failed = runs.filter((r) => r.status === "failed").length;
    const durations = runs.filter((r) => r.finishedAt).map((r) => new Date(r.finishedAt!).getTime() - new Date(r.startedAt).getTime());
    const avg = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 100) / 10 : null;
    return { done, failed, running: runs.filter((r) => r.status === "running").length, avg };
  }, [runs]);
  const run = runs.find((r) => r.id === selectedRun) ?? null;

  return (
    <div className="flex h-full min-h-[70vh] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-2.5">
        <Segmented aria-label="Bagian workflow" value={tab} onValueChange={(v) => setTab(v as typeof tab)}
          options={[{ value: "editor", label: "Editor" }, { value: "runs", label: `Runs ${runs.length}` }, { value: "settings", label: "Pengaturan" }]} />
        <span className="text-[12.5px] text-slate-500">{template.name} · {describeSchedule(schedule)}</span>
        <div className="ml-auto flex items-center gap-3">
          {message && <span className={`text-[12.5px] ${message.tone === "success" ? "text-emerald-700" : "text-red-600"}`}>{message.text}</span>}
          <label className="flex items-center gap-2 text-[13px] text-slate-700">
            <Switch checked={wf.enabled} disabled={!canEdit || pending} aria-label="Live"
              onCheckedChange={(on) => start(async () => { const r = await setWorkflowEnabled(wf.id, on); if (!r.ok) setMessage({ tone: "danger", text: r.error }); router.refresh(); })} />
            {wf.enabled ? <span className="font-medium text-emerald-700">Live</span> : "Mati"}
          </label>
          <Button size="sm" intent="ghost" disabled={!canEdit || pending} loading={pending && tab !== "settings"} onClick={runNow}><Play size={14} /> Jalankan sekarang</Button>
        </div>
      </div>

      {tab === "editor" && (
        <div className="grid flex-1 grid-cols-1 lg:grid-cols-[1fr_320px]">
          <div className="relative min-h-[420px] bg-[radial-gradient(circle,#e5e7eb_1px,transparent_1px)] [background-size:16px_16px]">
            <FlowCanvas
              aria-label="Alur workflow"
              className="h-full min-h-[420px]"
              nodes={shown}
              edges={shown.slice(1).map((n, i) => ({ from: shown[i].id, to: n.id }))}
              onNodesChange={(next) => setNodes(next)}
              nodeWidth={240}
              nodeHeight={72}
              renderNode={(n) => {
                const k = KIND[n.kind];
                const st = lastStatus(n.id);
                return (
                  <div className={`h-[72px] w-[240px] rounded-xl border bg-white px-3 py-2 shadow-sm ${st === "failed" ? "border-red-300" : st === "ok" ? "border-emerald-300" : "border-slate-200"}`}>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500"><k.Icon className="h-3.5 w-3.5" /> {k.text}
                      {st && <span className={`ml-auto rounded px-1 text-[10.5px] ${st === "failed" ? "bg-red-50 text-red-700" : st === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{st === "ok" ? "Selesai" : st === "failed" ? "Gagal" : "Dilewati"}</span>}
                    </div>
                    <p className="truncate text-[13.5px] font-medium text-slate-900">{n.title}</p>
                    <p className="truncate text-[12px] text-slate-500">{n.detail}</p>
                  </div>
                );
              }}
            />
          </div>
          <aside className="space-y-4 border-l border-slate-100 bg-white p-4">
            <div>
              <p className="mb-2 text-[12px] font-medium text-slate-500">Pemicu: jadwal</p>
              <Segmented aria-label="Jadwal" value={schedule.every} onValueChange={(v) => setSchedule({ every: v as Schedule["every"] })}
                options={[{ value: "hours", label: "Per jam" }, { value: "day", label: "Harian" }, { value: "week", label: "Mingguan" }]} />
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                {schedule.every === "hours" && (
                  <label className="col-span-2">Setiap (jam)<Input type="number" min={1} max={24} value={String(schedule.hours ?? 6)} onChange={(e) => setSchedule({ hours: Number(e.target.value) })} /></label>
                )}
                {schedule.every !== "hours" && (
                  <label>Jam (WIB)<Input type="time" value={schedule.at ?? "08:00"} onChange={(e) => setSchedule({ at: e.target.value })} /></label>
                )}
                {schedule.every === "week" && (
                  <label>Hari<Select value={String(schedule.weekday ?? 1)} onValueChange={(v) => setSchedule({ weekday: Number(v) })}
                    options={["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((d, i) => ({ value: String(i), label: d }))} /></label>
                )}
                {schedule.every === "day" && (
                  <label className="col-span-2 flex items-center gap-2"><Switch checked={!!schedule.weekdaysOnly} onCheckedChange={(on) => setSchedule({ weekdaysOnly: on })} /> Hanya hari kerja</label>
                )}
              </div>
            </div>
            {template.fields.map((f) => (
              <label key={f.key} className="block text-[13px]">
                <span className="mb-1 block text-[12px] font-medium text-slate-500">{f.label}</span>
                {f.type === "select"
                  ? <Select value={String(config[f.key] ?? "")} onValueChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))} options={f.options ?? []} />
                  : <Input type="number" min={f.min} max={f.max} value={String(config[f.key] ?? "")} onChange={(e) => setConfig((c) => ({ ...c, [f.key]: Number(e.target.value) }))} />}
              </label>
            ))}
            <Callout tone="neutral">Workflow hanya memberi notifikasi di ERP dan menjalankan import; tidak mengirim email keluar selama pilot.</Callout>
            <Button size="sm" intent="primary" disabled={!canEdit || !dirty} loading={pending} onClick={save}>Simpan</Button>
          </aside>
        </div>
      )}

      {tab === "runs" && (
        <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[320px_1fr]">
          <aside className="border-r border-slate-100 bg-white p-3">
            <div className="mb-3 grid grid-cols-2 gap-2 text-[12.5px]">
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-2"><b className="block text-[16px] text-emerald-800">{stats.done}</b>Selesai</div>
              <div className="rounded-lg border border-red-100 bg-red-50/60 p-2"><b className="block text-[16px] text-red-700">{stats.failed}</b>Gagal</div>
              <div className="rounded-lg border border-slate-200 p-2"><b className="block text-[16px] text-slate-800">{stats.running}</b>Berjalan</div>
              <div className="rounded-lg border border-slate-200 p-2"><b className="block text-[16px] text-slate-800">{stats.avg ?? "—"}{stats.avg !== null && " dtk"}</b>Rata-rata durasi</div>
            </div>
            {runs.length === 0 && <p className="px-1 text-[13px] text-slate-500">Belum ada run. Coba "Jalankan sekarang".</p>}
            <ul className="space-y-0.5">
              {runs.map((r) => {
                const s = STATUS[r.status] ?? STATUS.running;
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => setSelectedRun(r.id)}
                      className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] ${selectedRun === r.id ? "bg-slate-100" : "hover:bg-slate-50"}`}>
                      <s.Icon className={`h-4 w-4 ${r.status === "failed" ? "text-red-600" : r.status === "succeeded" ? "text-emerald-600" : "animate-spin text-slate-500"}`} />
                      <span className="font-medium text-slate-800">Run #{r.number}</span>
                      <span className="text-[11.5px] text-slate-400">{r.trigger === "manual" ? "manual" : "jadwal"}</span>
                      <span className="ml-auto text-[12px] text-slate-500">{when(r.startedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          <section className="p-5">
            {run ? (
              <div className="max-w-[640px] space-y-3">
                <div className="flex items-center gap-2"><h3 className="text-[15px] font-semibold text-slate-900">Run #{run.number}</h3>
                  <Badge size="small" tone={(STATUS[run.status] ?? STATUS.running).tone}>{(STATUS[run.status] ?? STATUS.running).text}</Badge>
                  <span className="text-[12.5px] text-slate-500">{when(run.startedAt)}</span></div>
                {run.summary && <p className="text-[13.5px] text-slate-700">{run.summary}</p>}
                <ol className="space-y-2">
                  {run.steps.map((s) => (
                    <li key={s.id} className="flex gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px]">
                      {s.status === "failed" ? <CircleX className="mt-0.5 h-4 w-4 text-red-600" /> : s.status === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" /> : <Circle className="mt-0.5 h-4 w-4 text-slate-400" />}
                      <span><b className="text-slate-800">{s.title}</b><span className="block text-slate-600">{s.message}</span></span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : <p className="text-[13px] text-slate-500">Pilih run di kiri.</p>}
          </section>
        </div>
      )}

      {tab === "settings" && (
        <div className="max-w-[520px] space-y-4 p-5">
          <label className="block text-[13px]"><span className="mb-1 block text-[12px] font-medium text-slate-500">Nama</span><Input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <p className="text-[13px] text-slate-600">Pemilik: <b>{wf.owner ?? "—"}</b>. Run berjalan dengan akses pemilik saat run itu terjadi.</p>
          <div className="flex gap-2">
            <Button size="sm" intent="primary" disabled={!canEdit || !dirty} loading={pending} onClick={save}>Simpan</Button>
            <Button size="sm" intent="ghost" disabled={!canEdit || pending} onClick={() => start(async () => {
              if (!window.confirm(`Hapus workflow "${wf.name}" beserta riwayat run-nya?`)) return;
              const r = await deleteWorkflow(wf.id);
              if (r.ok) router.push("/automation/workflows"); else setMessage({ tone: "danger", text: r.error });
            })}><span className="text-red-600">Hapus workflow</span></Button>
          </div>
        </div>
      )}
    </div>
  );
}
