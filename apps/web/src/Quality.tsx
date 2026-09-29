// Brain Console · quality loop (ADR-015): user feedback on answers, evaluation cases chosen from real runs, and
// replay evaluation of allowlisted models against the same frozen evidence (no ERP call, nothing is applied).
import { useEffect, useState } from "react";
import { api, post } from "./api";
import { Badge, ErrorBanner, SectionTitle } from "./ui";

export type Feedback = {
  helpful: number;
  not_helpful: number;
  model_helpful: number;
  model_rated: number;
  recent_negative: { run_id: string; reason: string | null; comment: string | null; updated_at: string; query: string | null; skill: string; reasoning: string | null }[];
};
export type Turn = { turn: number; model: string; verdict: string; tokens: number; latency_ms: number };
export type Candidates = { question: string; shape: "answer" | "proposal"; kinds: string[]; refs: { key: string; ref: string; text: string; cited: boolean }[]; turns: number } | null;
type Case = { id: string; run_id: string; question: string; expect: { shape: string; refs: string[]; kinds: string[] }; note: string | null; created_by: string; created_at: string };
type Summary = { cases: number; skipped?: number; plan_valid_pct?: number; shape_ok_pct?: number; grounded_pct?: number; recall_avg?: number; latency_ms_median?: number; tokens_avg?: number; errors?: number };
type EvalRun = { id: string; model: string; state: string; created_by: string; created_at: string; finished_at: string | null; summary: Summary | null };
type EvalDetail = EvalRun & { results: { case_id: string; question: string; plan_valid?: boolean; shape_ok?: boolean; grounded?: boolean; recall?: number; problem?: string; error?: string; skipped?: string; answer?: string; latency_ms?: number }[] };

const REASON: Record<string, string> = { wrong: "Salah", incomplete: "Kurang lengkap", irrelevant: "Tidak relevan", other: "Lainnya" };
const when = (s: string) => new Date(s).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", dateStyle: "medium", timeStyle: "short" });
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export function FeedbackSection({ feedback, onOpen }: { feedback: Feedback; onOpen: (runId: string) => void }) {
  const total = feedback.helpful + feedback.not_helpful;
  return (
    <>
      <SectionTitle
        title="Umpan balik pengguna"
        subtitle={`${pct(feedback.helpful, total)} jawaban dinilai membantu (${total} penilaian) · jawaban model: ${pct(feedback.model_helpful, feedback.model_rated)}. Umpan balik adalah observasi; tidak mengubah ERP atau pengetahuan.`}
      />
      <div className="artifact-table-wrap">
        <table className="artifact-table" data-console-feedback>
          <thead>
            <tr><th>Waktu</th><th>Pertanyaan</th><th>Alasan</th><th>Catatan</th><th /></tr>
          </thead>
          <tbody>
            {feedback.recent_negative.map((f) => (
              <tr key={f.run_id + f.updated_at}>
                <td>{when(f.updated_at)}</td>
                <td className="break-anywhere">{f.query ?? f.skill}</td>
                <td><Badge tone="red">{REASON[f.reason ?? "other"] ?? f.reason}</Badge></td>
                <td className="break-anywhere">{f.comment ?? "—"}</td>
                <td><button className="button secondary small" onClick={() => onOpen(f.run_id)}>Jejak</button></td>
              </tr>
            ))}
            {!feedback.recent_negative.length && <tr><td colSpan={5}>Belum ada jawaban yang dinilai kurang membantu.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TurnsList({ turns }: { turns: Turn[] }) {
  if (!turns.length) return null;
  return (
    <div className="console-turns" data-console-turns>
      <small>GILIRAN MODEL (DISIMPAN UNTUK AUDIT DAN EVALUASI ULANG)</small>
      <ol>
        {turns.map((t) => (
          <li key={t.turn}>
            <strong>#{t.turn}</strong> {t.model} · <Badge tone={t.verdict.startsWith("answer") || t.verdict === "calls" || t.verdict === "proposal" ? "green" : "red"}>{t.verdict}</Badge> · {t.tokens} token · {t.latency_ms} ms
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CaseForm({ runId, candidates, existing, onSaved }: { runId: string; candidates: Candidates; existing: { expect: { refs: string[] }; note: string | null } | null; onSaved: () => void }) {
  const [refs, setRefs] = useState<string[]>(existing?.expect.refs ?? (candidates?.refs.filter((r) => r.cited).map((r) => r.ref) ?? []));
  const [note, setNote] = useState(existing?.note ?? "");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(!!existing);
  if (!candidates) return <p className="muted">Run ini dijawab tanpa model, jadi tidak dapat diputar ulang sebagai kasus evaluasi.</p>;
  return (
    <form
      className="console-case"
      data-console-case
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        post("/console/agent/cases", { run_id: runId, refs, note: note || null })
          .then(() => {
            setSaved(true);
            onSaved();
          })
          .catch((err) => setError((err as Error).message));
      }}
    >
      <small>{saved ? "KASUS EVALUASI · SUMBER YANG DIHARAPKAN" : "JADIKAN KASUS EVALUASI · PILIH SUMBER YANG HARUS DIKUTIP"}</small>
      <ErrorBanner error={error} />
      <ul>
        {candidates.refs.map((r) => (
          <li key={r.key}>
            <label>
              <input type="checkbox" checked={refs.includes(r.ref)} onChange={(e) => setRefs(e.target.checked ? [...refs, r.ref] : refs.filter((x) => x !== r.ref))} /> [{r.key}] {r.text}
            </label>
          </li>
        ))}
      </ul>
      <label>
        Catatan
        <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="Apa yang harus benar pada jawaban ini?" />
      </label>
      <button className="button small" type="submit">{saved ? "Perbarui kasus" : "Simpan sebagai kasus uji"}</button>
      {saved && <span className="muted"> Tersimpan.</span>}
    </form>
  );
}

export function EvaluationSection() {
  const [data, setData] = useState<{ models: string[]; cases: Case[]; runs: EvalRun[] }>();
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState<EvalDetail | null>(null);
  const load = () => api<{ models: string[]; cases: Case[]; runs: EvalRun[] }>("/console/agent/evals").then((d) => { setData(d); setModel((m) => m || d.models[0] || ""); });
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const running = data?.runs.some((r) => r.state === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => load().catch(() => undefined), 2000);
    return () => clearInterval(t);
  }, [running]);
  if (!data) return null;
  return (
    <>
      <SectionTitle
        title="Evaluasi model"
        subtitle="Putar ulang kasus uji dengan bukti yang sama terhadap model yang diizinkan. Tidak memanggil ERP dan tidak menerapkan apa pun."
        action={
          data.models.length ? (
            <form
              className="console-eval-form"
              onSubmit={(e) => {
                e.preventDefault();
                setError("");
                post("/console/agent/evals", { model }).then(() => load()).catch((err) => setError((err as Error).message));
              }}
            >
              <select aria-label="Model untuk dievaluasi" value={model} onChange={(e) => setModel(e.target.value)}>
                {data.models.map((m) => <option key={m}>{m}</option>)}
              </select>
              <button className="button small" disabled={!data.cases.length || running}>{running ? "Berjalan…" : "Jalankan evaluasi"}</button>
            </form>
          ) : (
            <Badge>Model belum dikonfigurasi</Badge>
          )
        }
      />
      <ErrorBanner error={error} />
      <div className="console-grid">
        <div className="artifact-table-wrap">
          <table className="artifact-table" data-console-cases>
            <thead><tr><th>Kasus uji ({data.cases.length})</th><th>Diharapkan</th><th /></tr></thead>
            <tbody>
              {data.cases.map((c) => (
                <tr key={c.id}>
                  <td className="break-anywhere">{c.question}{c.note ? <><br /><small>{c.note}</small></> : null}</td>
                  <td>{c.expect.shape === "proposal" ? `usulan ${c.expect.kinds.join(", ")}` : `${c.expect.refs.length} sumber`}</td>
                  <td><button className="button secondary small" onClick={() => api(`/console/agent/cases/${c.id}`, { method: "DELETE" }).then(load)}>Hapus</button></td>
                </tr>
              ))}
              {!data.cases.length && <tr><td colSpan={3}>Belum ada kasus. Buka jejak jawaban model dan simpan sebagai kasus uji.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="artifact-table-wrap">
          <table className="artifact-table" data-console-evals>
            <thead><tr><th>Model</th><th>Rencana valid</th><th>Berbukti</th><th>Sumber tepat</th><th>Latensi</th><th /></tr></thead>
            <tbody>
              {data.runs.map((r) => (
                <tr key={r.id}>
                  <td>{r.model}<br /><small>{when(r.created_at)}</small></td>
                  {r.state === "succeeded" && r.summary ? (
                    <>
                      <td>{r.summary.plan_valid_pct ?? "—"}%</td>
                      <td>{r.summary.grounded_pct ?? "—"}%</td>
                      <td>{r.summary.recall_avg ?? "—"}</td>
                      <td>{r.summary.latency_ms_median ?? "—"} ms</td>
                    </>
                  ) : (
                    <td colSpan={4}><Badge tone={r.state === "failed" ? "red" : "amber"}>{r.state}</Badge></td>
                  )}
                  <td>{r.state === "succeeded" && <button className="button secondary small" onClick={() => api<EvalDetail>(`/console/agent/evals/${r.id}`).then(setOpen)}>Rinci</button>}</td>
                </tr>
              ))}
              {!data.runs.length && <tr><td colSpan={6}>Belum ada evaluasi.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {open && (
        <div className="artifact-table-wrap" data-console-eval-detail>
          <table className="artifact-table">
            <thead><tr><th>Kasus · {open.model}</th><th>Rencana</th><th>Berbukti</th><th>Sumber</th><th>Catatan</th></tr></thead>
            <tbody>
              {open.results.map((r) => (
                <tr key={r.case_id}>
                  <td className="break-anywhere">{r.question}</td>
                  <td>{r.skipped ? "—" : r.plan_valid ? "✓" : "✗"}</td>
                  <td>{r.skipped ? "—" : r.grounded ? "✓" : "✗"}</td>
                  <td>{r.recall ?? "—"}</td>
                  <td className="break-anywhere">{r.skipped ?? r.error ?? r.problem ?? r.answer ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ── Masukan understood from the one Agent surface (ADR-017) ─────────────────────────────────────────────────────────
export type Intents = { items: { intent: string; chosen_by: string; runs: number; drafted: number }[]; waiting_review: number };
type SubmissionRow = {
  id: string;
  run_id: string;
  principal_name: string;
  intent: "knowledge_correction" | "agent_feedback";
  state: "submitted" | "promoted" | "closed";
  title: string;
  body: string;
  refs: { label: string }[];
  subject_run_id: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  review_note: string | null;
};
const INTENT: Record<string, string> = {
  feature_request: "Feature Request",
  data_correction: "Koreksi data",
  knowledge_correction: "Koreksi pengetahuan",
  agent_feedback: "Umpan balik Agent",
};
const STATE: Record<string, { label: string; tone: "amber" | "green" | undefined }> = {
  submitted: { label: "menunggu kurator", tone: "amber" },
  promoted: { label: "jadi draf pengetahuan", tone: "green" },
  closed: { label: "ditutup", tone: undefined },
};

export function SubmissionsSection({ intents, onOpen }: { intents: Intents; onOpen: (runId: string) => void }) {
  const [items, setItems] = useState<SubmissionRow[]>();
  const [error, setError] = useState("");
  const load = () => api<{ items: SubmissionRow[] }>("/console/agent/submissions").then((d) => setItems(d.items));
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  const review = (id: string, action: "promote" | "close") =>
    post(`/console/agent/submissions/${id}`, { action }).then(load).catch((e) => setError((e as Error).message));
  const routed = intents.items.map((i) => `${INTENT[i.intent] ?? i.intent} ${i.runs}× (${i.chosen_by === "model" ? "model" : "dipilih pengguna"})`).join(" · ");
  return (
    <>
      <SectionTitle
        title="Masukan dari percakapan"
        subtitle={`Pesan yang dipahami sebagai masukan, bukan pertanyaan: ${routed || "belum ada"}. Feature Request dan koreksi data menjadi usulan di ERP; koreksi pengetahuan menunggu kurator di sini.`}
      />
      <ErrorBanner error={error} />
      <div className="artifact-table-wrap">
        <table className="artifact-table" data-console-submissions>
          <thead>
            <tr><th>Masukan</th><th>Tentang</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {(items ?? []).map((s) => (
              <tr key={s.id} data-console-submission={s.state}>
                <td className="break-anywhere">
                  <Badge>{INTENT[s.intent]}</Badge> <strong>{s.title}</strong>
                  <br />
                  <small>{s.body}</small>
                  <br />
                  <small>{s.principal_name} · {when(s.submitted_at)}</small>
                </td>
                <td className="break-anywhere">{s.refs.map((r) => r.label).join("; ") || (s.subject_run_id ? "jawaban sebelumnya" : "—")}</td>
                <td><Badge tone={STATE[s.state].tone}>{STATE[s.state].label}</Badge></td>
                <td>
                  {s.state === "submitted" && s.intent === "knowledge_correction" && (
                    <button className="button small" onClick={() => void review(s.id, "promote")}>Jadikan draf pengetahuan</button>
                  )}{" "}
                  {s.state === "submitted" && <button className="button secondary small" onClick={() => void review(s.id, "close")}>Tutup</button>}{" "}
                  <button className="button secondary small" onClick={() => onOpen(s.subject_run_id ?? s.run_id)}>Jejak</button>
                </td>
              </tr>
            ))}
            {items && !items.length && <tr><td colSpan={4}>Belum ada masukan yang dikirim.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="page-note">Draf pengetahuan dari koreksi disetujui terpisah di halaman Knowledge oleh kurator dengan token workspace; sebelum itu Agent tidak memakainya.</p>
    </>
  );
}

// ── Company Files (ADR-018): ingestion health, identity-pattern holds, and who opened what ─────────────────────────
type FilesOverview = {
  files: { origin: string; access_class: string; state: string; n: number }[];
  ingestion: { ingest_state: string; n: number; ocr_pages: number }[];
  failures: { file_id: string; version: number; title: string; kind: string; origin: string; attempts: number; error: string | null; created_at: string }[];
  holds: { id: string; title: string; kind: string; access_class: string; owner_division: string | null; created_by_name: string | null; created_at: string; pii: string[] | null }[];
  access: { at: string; action: string; via: string; principal_name: string | null; title: string; access_class: string }[];
};

export function FilesSection() {
  const [data, setData] = useState<FilesOverview>();
  const [error, setError] = useState("");
  const load = () => api<FilesOverview>("/console/files").then(setData).catch((e) => setError(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (!data) return error ? <ErrorBanner error={error} /> : null;
  const total = data.files.reduce((n, f) => n + f.n, 0);
  const by = (key: "origin" | "access_class") =>
    Object.entries(data.files.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f[key]]: (acc[f[key]] ?? 0) + f.n }), {}))
      .map(([k, n]) => `${k} ${n}`)
      .join(" · ");
  return (
    <>
      <SectionTitle
        title="Company Files"
        subtitle={`${total} berkas terdaftar (${by("origin")}; kelas: ${by("access_class")}). Pembacaan: ${data.ingestion.map((i) => `${i.ingest_state} ${i.n}`).join(" · ") || "—"}; OCR ${data.ingestion.reduce((n, i) => n + i.ocr_pages, 0)} halaman.`}
      />
      <ErrorBanner error={error} />
      <div className="console-grid">
        <div className="artifact-table-wrap">
          <table className="artifact-table" data-console-file-holds>
            <thead><tr><th>Ditahan (pola dokumen identitas)</th><th>Kelas</th><th /></tr></thead>
            <tbody>
              {data.holds.map((h) => (
                <tr key={h.id}>
                  <td className="break-anywhere">{h.title}<br /><small>{h.created_by_name ?? "—"} · {when(h.created_at)} · {(h.pii ?? []).join(", ")}</small></td>
                  <td><Badge tone="red">{h.access_class}</Badge></td>
                  <td><button className="button secondary small" onClick={() => post(`/console/files/${h.id}/withdraw`).then(load).catch((e) => setError((e as Error).message))}>Tarik</button></td>
                </tr>
              ))}
              {!data.holds.length && <tr><td colSpan={3}>Tidak ada berkas yang ditahan.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="artifact-table-wrap">
          <table className="artifact-table" data-console-file-failures>
            <thead><tr><th>Gagal dibaca</th><th>Percobaan</th><th /></tr></thead>
            <tbody>
              {data.failures.map((f) => (
                <tr key={f.file_id + f.version}>
                  <td className="break-anywhere">{f.title} (v{f.version}, {f.origin})<br /><small>{f.error}</small></td>
                  <td>{f.attempts}</td>
                  <td><button className="button secondary small" onClick={() => post(`/console/files/${f.file_id}/versions/${f.version}/retry`).then(load).catch((e) => setError((e as Error).message))}>Ulangi</button></td>
                </tr>
              ))}
              {!data.failures.length && <tr><td colSpan={3}>Tidak ada kegagalan.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <div className="artifact-table-wrap">
        <table className="artifact-table" data-console-file-access>
          <thead><tr><th>Waktu</th><th>Siapa</th><th>Berkas</th><th>Aksi</th></tr></thead>
          <tbody>
            {data.access.map((a, i) => (
              <tr key={i}><td>{when(a.at)}</td><td>{a.principal_name ?? "—"}</td><td className="break-anywhere">{a.title} <Badge>{a.access_class}</Badge></td><td>{a.action} · {a.via}</td></tr>
            ))}
            {!data.access.length && <tr><td colSpan={4}>Belum ada pembukaan berkas.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
