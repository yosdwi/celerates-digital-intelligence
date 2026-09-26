// Brain Console · Agent & learning. Read-only views over the Agent's persisted runs, reasoning, the decisions users
// made on its proposals (as ERP reported them) and what it learned. ERP stays the record of truth for effects.
import { useState } from "react";
import { api } from "./api";
import { Badge, ErrorBanner, Loading, Metric, Modal, PageHead, SectionTitle, useResource } from "./ui";

type Count = { runs: number };
type Overview = {
  days: number;
  reasoning: { mode: "model" | "deterministic"; model: string | null; embedding: string };
  runs: { runs: number; succeeded: number; failed: number; users: number; model: number; fallback: number; proposals: number; tokens: number; avg_ms: number };
  skills: ({ skill: string; failed: number; model: number; fallback: number } & Count)[];
  models: { model: string; answers: number; avg_turns: number; avg_tokens: number }[];
  fallbacks: ({ reason: string } & Count)[];
  failures: ({ code: string } & Count)[];
  outcomes: { decided: number; applied: number; rejected: number; items_applied: number; items_edited: number; items_resolved: number };
  learned_mappings: { command: string; uses: number; updated_at: string; mapping: Record<string, string> }[];
  datasets: { items: { kind: string; files: number; bytes: number; oldest: string }[]; retention_days: number };
};
type Run = {
  id: string;
  skill: string;
  state: string;
  principal_name: string;
  created_at: string;
  query: string | null;
  reasoning: string | null;
  proposal: string | null;
  path: string | null;
  decision: string | null;
  error: string | null;
};
type Step = { seq: number; type: string; event: Record<string, unknown> };
type Trace = { run: Run & { result: Record<string, unknown> | null; playbook_version: string }; steps: Step[]; outcomes: { proposal_id: string; state: string; receipts: Record<string, number>; outcome: Record<string, number> | null; edited_items: number }[] };

const SKILL: Record<string, string> = {
  ask: "Tanya",
  explain_signal: "Tanyakan sinyal",
  explain_entity: "Jelaskan record",
  search: "Cari",
  follow_up_signal: "Tindak lanjuti",
  import_dataset: "Impor tabel",
  read_document: "Baca dokumen",
};
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");
const when = (s: string) => new Date(s).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });

function ReasoningBadge({ value }: { value: string | null }) {
  if (value === "model") return <Badge tone="amber">Model · inferensi</Badge>;
  if (value === "fallback") return <Badge tone="red">Fallback deterministik</Badge>;
  return <Badge>Deterministik</Badge>;
}

function TraceView({ id }: { id: string }) {
  const { data, error, loading } = useResource(() => api<Trace>(`/console/agent/runs/${id}`), [id]);
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBanner error={error || "Run not found"} />;
  const events = data.steps.map((s) => s.event);
  const text = events.filter((e) => e.type === "TEXT_MESSAGE_CONTENT").map((e) => String(e.delta)).join("");
  const provenance = events.find((e) => e.type === "CUSTOM" && e.name === "celerates.provenance")?.value as Record<string, unknown> | undefined;
  return (
    <div className="console-trace">
      <p className="muted">
        {data.run.principal_name} · {when(data.run.created_at)} · {data.run.playbook_version} · {data.run.path ?? ""}
      </p>
      <ol className="console-steps">
        {events.map((e, i) => {
          if (e.type === "STEP_STARTED") return <li key={i} className="step">{String(e.stepName)}</li>;
          if (e.type === "TOOL_CALL_START") return <li key={i} className="tool"><code>{String(e.toolCallName)}</code></li>;
          if (e.type === "CUSTOM" && e.name === "celerates.evidence")
            return ((e.value as { items: { type: string; title: string; cite?: string }[] }).items ?? []).map((item, j) => (
              <li key={`${i}-${j}`} className="evidence">
                <Badge tone={item.type === "inference" ? "amber" : item.type === "document" ? "" : "green"}>{item.type}</Badge> {item.cite ? `[${item.cite}] ` : ""}
                {item.title}
              </li>
            ));
          if (e.type === "CUSTOM" && e.name === "celerates.proposal") return <li key={i} className="proposal">Usulan ERP: {String((e.value as { title: string }).title)}</li>;
          if (e.type === "RUN_ERROR") return <li key={i} className="error">Error {String(e.code)}: {String(e.message)}</li>;
          return null;
        })}
      </ol>
      {text && (
        <div className="console-answer">
          <small>{provenance?.mode === "model"
              ? `${provenance.kind === "proposal" ? "USULAN DISUSUN MODEL" : "JAWABAN · INFERENSI MODEL"} (${String(provenance.model)}, ${String(provenance.rounds)} giliran)`
              : "JAWABAN · DETERMINISTIK"}</small>
          <p>{text}</p>
        </div>
      )}
      {data.outcomes.map((o) => (
        <p key={o.proposal_id} className="muted">
          Keputusan pengguna (dilaporkan ERP): <strong>{o.state}</strong> · {o.receipts.applied ?? 0} diterapkan · {o.edited_items} diubah pengguna
          {o.outcome ? ` · ${o.outcome.resolved ?? 0} tuntas` : ""}
        </p>
      ))}
    </div>
  );
}

export function AgentConsole() {
  const [days, setDays] = useState(14);
  const [open, setOpen] = useState<string | null>(null);
  const overview = useResource(() => api<Overview>(`/console/agent?days=${days}`), [days]);
  const runs = useResource(() => api<{ items: Run[] }>("/console/agent/runs?limit=30"), []);
  const d = overview.data;
  return (
    <>
      <PageHead
        eyebrow="BRAIN CONSOLE"
        title="What the Agent did, and what it learned."
        description="Questions asked in ERP, how each answer was produced, what users decided on its proposals and which mappings it now remembers. Effects live in ERP; this is the observation trail."
        action={
          <select aria-label="Periode" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[7, 14, 30, 90].map((n) => (
              <option key={n} value={n}>
                {n} hari terakhir
              </option>
            ))}
          </select>
        }
      />
      <ErrorBanner error={overview.error || runs.error} />
      {overview.loading || !d ? (
        <Loading />
      ) : (
        <>
          <p className="page-note" data-console-reasoning>
            Penalaran: <strong>{d.reasoning.mode === "model" ? `model (${d.reasoning.model})` : "deterministik (tanpa model)"}</strong> · Pencarian pengetahuan:{" "}
            <strong>{d.reasoning.embedding}</strong> · Berkas pengguna dihapus setelah {d.datasets.retention_days} hari.
          </p>
          <div className="metrics-grid">
            <Metric label="Runs Agent" value={d.runs.runs} detail={`${d.runs.users} pengguna · rata-rata ${(d.runs.avg_ms / 1000).toFixed(1)} dtk`} />
            <Metric label="Jawaban model yang lolos bukti" value={pct(d.runs.model, d.runs.model + d.runs.fallback)} detail={`${d.runs.model} lolos · ${d.runs.fallback} kembali ke deterministik`} />
            <Metric label="Usulan diterapkan" value={`${d.outcomes.applied}/${d.outcomes.decided}`} detail={`${d.outcomes.items_applied} item · ${d.outcomes.rejected} ditolak`} />
            <Metric label="Dikoreksi manusia" value={pct(d.outcomes.items_edited, d.outcomes.items_applied)} detail={`${d.outcomes.items_resolved} item sudah tuntas di ERP`} />
          </div>
          <SectionTitle title="Bagaimana pertanyaan dijawab" subtitle="Per kemampuan, dan per model bila penalaran model aktif." />
          <div className="console-grid">
            <div className="artifact-table-wrap">
              <table className="artifact-table">
                <thead>
                  <tr><th>Kemampuan</th><th>Runs</th><th>Model</th><th>Fallback</th><th>Gagal</th></tr>
                </thead>
                <tbody>
                  {d.skills.map((s) => (
                    <tr key={s.skill}><td>{SKILL[s.skill] ?? s.skill}</td><td>{s.runs}</td><td>{s.model}</td><td>{s.fallback}</td><td>{s.failed}</td></tr>
                  ))}
                  {!d.skills.length && <tr><td colSpan={5}>Belum ada run pada periode ini.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="artifact-table-wrap">
              <table className="artifact-table">
                <thead>
                  <tr><th>Model / alasan</th><th>Jumlah</th><th>Detail</th></tr>
                </thead>
                <tbody>
                  {d.models.map((m) => (
                    <tr key={m.model}><td>{m.model}</td><td>{m.answers}</td><td>{m.avg_turns} giliran · {m.avg_tokens} token</td></tr>
                  ))}
                  {d.fallbacks.map((f) => (
                    <tr key={f.reason}><td>Fallback: {f.reason}</td><td>{f.runs}</td><td>jawaban deterministik ditampilkan</td></tr>
                  ))}
                  {d.failures.map((f) => (
                    <tr key={f.code}><td>Gagal: {f.code}</td><td>{f.runs}</td><td>tidak ada jawaban</td></tr>
                  ))}
                  {!d.models.length && !d.fallbacks.length && !d.failures.length && <tr><td colSpan={3}>Tidak ada penalaran model atau kegagalan.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
          <SectionTitle title="Run terbaru" subtitle="Buka jejak untuk melihat langkah, alat, bukti, dan keputusan pengguna." />
          <div className="artifact-table-wrap">
            <table className="artifact-table" data-console-runs>
              <thead>
                <tr><th>Waktu</th><th>Pengguna</th><th>Kemampuan</th><th>Pertanyaan / konteks</th><th>Penalaran</th><th>Keputusan</th><th /></tr>
              </thead>
              <tbody>
                {(runs.data?.items ?? []).map((r) => (
                  <tr key={r.id}>
                    <td>{when(r.created_at)}</td>
                    <td>{r.principal_name}</td>
                    <td>{SKILL[r.skill] ?? r.skill}</td>
                    <td className="break-anywhere">{r.query ?? r.path ?? "—"}</td>
                    <td>{r.state === "failed" ? <Badge tone="red">Gagal</Badge> : <ReasoningBadge value={r.reasoning} />}</td>
                    <td>{r.decision ? <Badge tone={r.decision === "rejected" ? "red" : "green"}>{r.decision}</Badge> : r.proposal ? <Badge tone="amber">menunggu</Badge> : "—"}</td>
                    <td><button className="button secondary small" onClick={() => setOpen(r.id)}>Jejak</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <SectionTitle title="Yang dipelajari" subtitle="Pemetaan kolom yang diingat hanya setelah ERP melaporkan impor diterapkan." />
          <div className="artifact-table-wrap">
            <table className="artifact-table" data-console-learned>
              <thead>
                <tr><th>Perintah ERP</th><th>Pemetaan</th><th>Dipakai</th><th>Diperbarui</th></tr>
              </thead>
              <tbody>
                {d.learned_mappings.map((m, i) => (
                  <tr key={i}>
                    <td>{m.command}</td>
                    <td className="break-anywhere">{Object.entries(m.mapping).map(([p, c]) => `${c} → ${p}`).join(" · ")}</td>
                    <td>{m.uses}×</td>
                    <td>{when(m.updated_at)}</td>
                  </tr>
                ))}
                {!d.learned_mappings.length && <tr><td colSpan={4}>Belum ada pemetaan yang dipelajari.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="page-note">
            Berkas pengguna saat ini:{" "}
            {d.datasets.items.map((x) => `${x.files} ${x.kind === "document" ? "dokumen" : "tabel"} (${(x.bytes / 1024).toFixed(0)} KB)`).join(" · ") || "tidak ada"}. Isi berkas tidak ditampilkan di konsol.
          </p>
        </>
      )}
      {open && (
        <Modal title="Jejak run Agent" onClose={() => setOpen(null)}>
          <TraceView id={open} />
        </Modal>
      )}
    </>
  );
}
