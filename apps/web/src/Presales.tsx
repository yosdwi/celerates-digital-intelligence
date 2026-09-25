import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Plus,
  Search,
  FileText,
  Upload,
  Play,
  Check,
  CheckCheck,
  RefreshCw,
  ExternalLink,
  Download,
  ChevronRight,
  Clock3,
  BookOpen,
  PenLine,
  Save,
  MessagesSquare,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import { api, post, downloadDocument } from "./api";
import type { Artifact, ArtifactContent, Detail, Opportunity } from "./types";
import {
  Badge,
  Status,
  ErrorBanner,
  Loading,
  Empty,
  Metric,
  PageHead,
  SectionTitle,
  Modal,
  human,
} from "./ui";
const short: Record<string, string> = {
  brief: "Brief",
  requirements: "Requirements",
  clarifications: "Clarifications",
  experience: "Experience",
  capability: "Capability Fit",
  risks: "Risks & Assumptions",
  solution: "Solution",
  scope: "Scope",
  effort: "BOQ / Effort",
  proposal: "Proposal",
  actions: "Next Actions",
};
const busyStates = ["QUEUED", "INGESTING", "ANALYZING", "RESUMING"];
const displayDate = (date: string) =>
  new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export function Presales() {
  const [searchParams, setSearchParams] = useSearchParams();
  const oid = searchParams.get("opportunity");
  const [system,setSystem]=useState<{demo:boolean;erp_review_url:string|null}>();
  useEffect(()=>{api<{demo:boolean;erp_review_url:string|null}>("/system").then(setSystem).catch(()=>{});},[]);
  const [items, setItems] = useState<Opportunity[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All opportunities");
  const [tab, setTab] = useState("brief");
  const [modal, setModal] = useState<
    "create" | "source" | "review" | "decision" | "context" | null
  >(null);
  const [decision, setDecision] = useState("READY_FOR_SALES");
  const requestSequence = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++requestSequence.current;
    const next = await api<{ items: Opportunity[] }>("/opportunities");
    const d = oid
      ? await api<Detail>(`/opportunities/${encodeURIComponent(oid)}`)
      : null;
    if (seq === requestSequence.current) {
      setItems(next.items);
      setDetail(d);
    }
  }, [oid]);
  useEffect(() => {
    setLoading(true);
    setError("");
    setDetail(null);
    reload()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    return () => {
      requestSequence.current++;
    };
  }, [reload]);
  useEffect(() => {
    if (!detail?.run || !busyStates.includes(detail.run.state)) return;
    const id = setInterval(
      () => reload().catch((e) => setError(e.message)),
      1200,
    );
    return () => clearInterval(id);
  }, [detail?.run?.state, reload]);
  const act = async (fn: () => Promise<unknown>, message = "") => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await reload();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const open = (id: string) => {
    setSearchParams({ opportunity: id });
    setTab("brief");
    setNotice("");
    setError("");
  };
  const run = detail?.run;
  const active = run && busyStates.includes(run.state);
  const artifact = detail?.artifacts.find((a) => a.kind === tab);
  const reviewed =
    detail?.artifacts.filter((a) => a.review_state === "APPROVED").length || 0;
  const matching = items.filter(
    (o) =>
      (o.title + " " + o.customer + " " + o.owner)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All opportunities" ||
        (o.latest_run?.state || o.status) === filter),
  );
  const exportPack = () => {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.opportunity.id}-intelligence-pack.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <>
      <ErrorBanner error={error} />
      {notice && (
        <div className="success-banner" role="status">
          <Check size={17} />
          {notice}
        </div>
      )}
      {!oid ? (
        <>
          <PageHead
            eyebrow="PRE-SALES INTELLIGENCE"
            title="Make the next move clearer."
            description="Turn opportunity context into a structured, evidence-backed first proposal."
            action={
              <button className="button" disabled={!system?.demo} title={system?.demo ? "Create demo opportunity" : "Create opportunity in ERP and grant access in Intelligence Review"} onClick={() => setModal("create")}>
                <Plus size={17} />
                New opportunity
              </button>
            }
          />
          {system&&!system.demo&&<p className="muted">Live ERP: only explicitly granted Sales Opportunities are visible. <a className="text-link" href={system.erp_review_url||undefined} target="_blank" rel="noreferrer">Manage ERP access and reviews →</a></p>}
          <div className="metrics-grid">
            <Metric
              label="Opportunities"
              value={items.length.toString().padStart(2, "0")}
              detail="In your connected workspace"
            />
            <Metric
              label="Needs review"
              value={items
                .filter((o) => o.latest_run?.state === "REVIEW_REQUIRED")
                .length.toString()
                .padStart(2, "0")}
              detail="Waiting on human judgement"
            />
            <Metric
              label="Clarification required"
              value={items
                .filter(
                  (o) =>
                    (o.latest_run?.state || o.status) ===
                    "CLARIFICATION_REQUIRED",
                )
                .length.toString()
                .padStart(2, "0")}
              detail="Gaps to resolve with Sales"
            />
            <Metric
              label="Ready for Sales"
              value={items
                .filter((o) => o.status === "READY_FOR_SALES")
                .length.toString()
                .padStart(2, "0")}
              detail="Reviewed, with ERP outcome"
            />
          </div>
          <div className="workflow-intro">
            <div className="round-icon sage">
              <BookOpen size={21} />
            </div>
            <div>
              <strong>
                From source documents to a Pre-Sales Intelligence Pack
              </strong>
              <p>
                11 connected artifacts. Source-linked context. A clear human
                review checkpoint.
              </p>
            </div>
            <div className="mini-process">
              <span>Understand</span>
              <ChevronRight size={14} />
              <span>Review</span>
              <ChevronRight size={14} />
              <span>Advance</span>
            </div>
          </div>
          <section className="panel">
            <SectionTitle
              title="Opportunity workspace"
              subtitle="Keep the evidence, decisions and next actions together."
            />
            <div className="table-toolbar">
              <label className="search-input">
                <Search size={17} />
                <input
                  aria-label="Search opportunities"
                  placeholder="Search opportunity, customer or owner"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <select
                aria-label="Filter opportunities"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                {[
                  "All opportunities",
                  "NEW",
                  "REVIEW_REQUIRED",
                  "CLARIFICATION_REQUIRED",
                  "READY_FOR_SALES",
                  "FAILED",
                ].map((v) => (
                  <option value={v} key={v}>
                    {human(v)}
                  </option>
                ))}
              </select>
            </div>
            {loading ? (
              <Loading />
            ) : matching.length === 0 ? (
              <Empty title="No opportunities found">
                Adjust your filters or create a new opportunity.
              </Empty>
            ) : (
              <div className="opportunity-list">
                <div className="list-header">
                  <span>OPPORTUNITY / CUSTOMER</span>
                  <span>OWNER</span>
                  <span>READINESS</span>
                  <span>STATE</span>
                  <span />
                </div>
                {matching.map((o) => (
                  <button
                    className="opportunity-row"
                    key={o.id}
                    onClick={() => open(o.id)}
                  >
                    <div>
                      <small>
                        {o.id} <span>· {o.stage}</span>
                      </small>
                      <strong>{o.title}</strong>
                      <p>{o.customer}</p>
                    </div>
                    <div className="owner-cell">
                      <span className="avatar small">
                        {o.owner.slice(0, 2).toUpperCase()}
                      </span>
                      <span>{o.owner}</span>
                    </div>
                    <div className="readiness">
                      <span>
                        {o.latest_run
                          ? `${o.completeness}% source completeness`
                          : "Not analyzed"}
                      </span>
                      <div className="progress-track">
                        <i style={{ width: `${o.completeness || 0}%` }} />
                      </div>
                      <small>
                        {o.document_count} source
                        {o.document_count === 1 ? "" : "s"} ·{" "}
                        {o.clarification_count || 0} open gaps
                      </small>
                    </div>
                    <div>
                      <Status value={o.latest_run?.state || o.status} />
                      {o.latest_run && (
                        <small className="row-updated">
                          {displayDate(o.latest_run.updated_at)}
                        </small>
                      )}
                    </div>
                    <ArrowRight size={19} />
                  </button>
                ))}
              </div>
            )}
          </section>
          <p className="page-note">
            <ShieldCheck size={16} />
            ERP facts remain authoritative. No price, availability or business
            commitment is invented.
          </p>
        </>
      ) : loading && !detail ? (
        <Loading />
      ) : detail ? (
        <>
          <button
            className="back-link"
            onClick={() => {
              setSearchParams({});
              setNotice("");
            }}
          >
            <ArrowLeft size={16} /> All opportunities
          </button>
          <PageHead
            eyebrow={`${detail.opportunity.id} / ${detail.opportunity.customer}`}
            title={detail.opportunity.title}
            description={`${detail.opportunity.owner} · ${detail.opportunity.stage}`}
            action={
              <div className="head-actions">
                <Status value={run?.state || detail.opportunity.status} />
                {detail.artifacts.length > 0 && (
                  <button
                    className="button secondary small"
                    onClick={exportPack}
                  >
                    <Download size={16} />
                    Export pack
                  </button>
                )}
              </div>
            }
          />
          <div className="detail-summary">
            <div>
              <small>ERP STATUS</small>
              <strong>{human(detail.opportunity.status)}</strong>
            </div>
            <div>
              <small>SOURCE DOCUMENTS</small>
              <strong>
                {detail.documents.length.toString().padStart(2, "0")}{" "}
                <span>registered</span>
              </strong>
            </div>
            <div>
              <small>INTELLIGENCE PACK</small>
              <strong>
                {detail.artifacts.length.toString().padStart(2, "0")}{" "}
                <span>artifacts</span>
              </strong>
            </div>
            <div>
              <small>HUMAN REVIEW</small>
              <strong>
                {reviewed}/11 <span>approved</span>
              </strong>
            </div>
          </div>
          {active && (
            <div className="run-banner" role="status">
              <LoaderCircle className="spin" size={20} />
              <div>
                <strong>{human(run.state)}</strong>
                <p>
                  {run.step}. You can leave this page; the worker continues.
                </p>
              </div>
            </div>
          )}
          {run?.state === "ERP_REVIEW_REQUIRED" && <div className="run-banner"><div><strong>ERP approval required</strong><p>The exact reviewed package is waiting for an Owner in ERP. Saving its reference does not send a proposal or change commercial status.</p>{system?.erp_review_url&&<a className="text-link" href={system.erp_review_url} target="_blank" rel="noreferrer">Open ERP review →</a>}</div><button className="button secondary" disabled={busy} onClick={()=>act(()=>post(`/runs/${run.id}/retry`),"Checking ERP approval…")}>Check approval</button></div>}
          {run?.state === "FAILED" && (
            <div className="run-failed">
              <div>
                <strong>Analysis needs attention</strong>
                <p>{run.error}</p>
              </div>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  act(() => post(`/runs/${run.id}/retry`), "Retry queued.")
                }
              >
                <RefreshCw size={16} />
                Retry run
              </button>
            </div>
          )}
          <div className="workbench">
            <div className="artifact-panel">
              <div className="artifact-head">
                <div className="eyebrow">PRE-SALES INTELLIGENCE PACK</div>
                <button
                  className="text-link"
                  onClick={() => setModal("context")}
                  disabled={!detail.artifacts.length}
                >
                  <Search size={15} />
                  Find evidence
                </button>
              </div>
              {detail.artifacts.length > 0 ? (
                <>
                  <div
                    className="artifact-tabs"
                    role="tablist"
                    aria-label="Intelligence pack artifacts"
                  >
                    {detail.artifacts.map((a) => (
                      <button
                        role="tab"
                        aria-selected={tab === a.kind}
                        key={a.kind}
                        onClick={() => setTab(a.kind)}
                        className={tab === a.kind ? "active" : ""}
                      >
                        {short[a.kind]}
                        {a.review_state === "APPROVED" && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                  {artifact && (
                    <ArtifactView
                      key={`${artifact.id}:${artifact.version}`}
                      artifact={artifact}
                      editable={run?.state === "REVIEW_REQUIRED"}
                      busy={busy}
                      onSave={async (content) => {
                        let success = false;
                        await act(async () => {
                          await api(`/artifacts/${artifact.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({
                              version: artifact.version,
                              content,
                            }),
                          });
                          success = true;
                        }, "Artifact saved. Its approval and the proposal approval were reset.");
                        return success;
                      }}
                    />
                  )}
                </>
              ) : (
                <div className="analysis-empty">
                  <div className="analysis-art">
                    <FileText size={42} />
                    <span>
                      <LayersIcon />
                    </span>
                  </div>
                  <div className="eyebrow">READY WHEN YOU ARE</div>
                  <h2>
                    Start with the source.
                    <br />
                    Build a clearer picture.
                  </h2>
                  <p>
                    Attach a TOR, RFP or Sales brief. The workflow will prepare
                    requirements, gaps, a solution outline and 8 more structured
                    artifacts.
                  </p>
                  <button
                    className="button"
                    disabled={busy || !!active || !detail.documents.length}
                    onClick={() =>
                      act(
                        () => post(`/opportunities/${oid}/analyze`),
                        "Analysis queued. Progress will update automatically.",
                      )
                    }
                  >
                    <Play size={16} />
                    {active ? "Analysis running" : "Start analysis"}
                  </button>
                  {!detail.documents.length && (
                    <small>Add a source document to begin.</small>
                  )}
                </div>
              )}
            </div>
            <aside className="context-panel">
              <section className="context-section">
                <SectionTitle
                  title="Source evidence"
                  action={
                    <button
                      className="icon-button"
                      aria-label="Add source document"
                      disabled={
                        busy || !!active || run?.state === "REVIEW_REQUIRED"
                      }
                      onClick={() => setModal("source")}
                    >
                      <Plus size={18} />
                    </button>
                  }
                />
                {detail.documents.map((d) => (
                  <div className="source-document" key={d.id}>
                    <div className="document-icon">
                      <FileText size={19} />
                    </div>
                    <div>
                      <button
                        className="source-name"
                        onClick={() =>
                          act(() => downloadDocument(d.id, d.name))
                        }
                      >
                        {d.name}
                      </button>
                      <small>
                        {(d.size_bytes / 1024).toFixed(1)} KB ·{" "}
                        {d.parser || "Awaiting ingestion"}
                      </small>
                      <Status value={d.state} />
                      {d.error && <p className="text-error">{d.error}</p>}
                      {d.source_url && (
                        <a
                          className="source-ref"
                          href={d.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Original reference <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                {!detail.documents.length && (
                  <p className="muted">No documents registered yet.</p>
                )}
                {run?.state === "REVIEW_REQUIRED" && (
                  <p className="context-hint">
                    Need new evidence? Request clarification first, then add the
                    source and run a new analysis.
                  </p>
                )}
              </section>
              <section className="context-section erp-context">
                <div className="eyebrow">AUTHORITATIVE CONTEXT</div>
                <h3>Celerates ERP</h3>
                <p>
                  Customer, opportunity and capability are read through the ERP
                  adapter.
                </p>
                <div>
                  <span className="status-dot" /> Outcome:{" "}
                  {human(detail.opportunity.status)}
                </div>
              </section>
              <section className="context-section">
                <h2>Workflow history</h2>
                <div className="timeline">
                  {detail.events.length ? (
                    detail.events.slice(0, 9).map((e) => (
                      <div key={e.id}>
                        <span className="timeline-dot" />
                        <strong>{human(e.type)}</strong>
                        <p>{e.message}</p>
                        <small>
                          {displayDate(e.created_at)} · {e.actor}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">
                      Your workflow history will appear here.
                    </p>
                  )}
                </div>
              </section>
            </aside>
          </div>
          <div className="review-bar">
            <div>
              <ShieldCheck size={22} />
              <span>
                <strong>
                  {run?.state === "READY_FOR_SALES"
                    ? "Ready for a Sales discussion"
                    : run?.state === "CLARIFICATION_REQUIRED"
                      ? "Clarification requested"
                      : run?.state === "REVIEW_REQUIRED"
                        ? "Your judgement completes the pack"
                        : "A clear path from evidence to outcome"}
                </strong>
                <small>
                  {run?.state === "REVIEW_REQUIRED"
                    ? `${reviewed} of 11 artifacts approved. Resolve source gaps before advancing.`
                    : "Approved outcomes are recorded through the ERP adapter."}
                </small>
              </span>
            </div>
            <div className="review-actions">
              {run?.state === "REVIEW_REQUIRED" ? (
                <>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => {
                      setDecision("CLARIFICATION_REQUIRED");
                      setModal("decision");
                    }}
                  >
                    <MessagesSquare size={16} />
                    Request clarification
                  </button>
                  {reviewed < 11 ? (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => setModal("review")}
                    >
                      <CheckCheck size={17} />
                      Review & approve pack
                    </button>
                  ) : (
                    <button
                      className="button"
                      disabled={busy}
                      onClick={() => {
                        setDecision("READY_FOR_SALES");
                        setModal("decision");
                      }}
                    >
                      Ready for Sales <ArrowRight size={16} />
                    </button>
                  )}
                </>
              ) : (
                !active && (
                  <button
                    className="button"
                    disabled={busy || !detail.documents.length}
                    onClick={() =>
                      act(
                        () => post(`/opportunities/${oid}/analyze`),
                        "New analysis queued.",
                      )
                    }
                  >
                    <Play size={16} />
                    {run ? "Run new analysis" : "Start analysis"}
                  </button>
                )
              )}
            </div>
          </div>
        </>
      ) : (
        <Empty title="Opportunity unavailable">
          Return to the opportunity list or retry.
        </Empty>
      )}
      {modal === "create" && (
        <CreateModal
          onClose={() => setModal(null)}
          onCreated={(id) => {
            setModal(null);
            open(id);
          }}
        />
      )}
      {modal === "source" && oid && (
        <SourceModal
          oid={oid}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
            setNotice(
              "Source registered. Start analysis to extract and index its content.",
            );
          }}
        />
      )}
      {modal === "review" && detail && run && (
        <ReviewModal
          artifacts={detail.artifacts}
          runId={run.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
            setNotice(
              "All current artifact versions are approved. You can now record the outcome.",
            );
          }}
        />
      )}
      {modal === "decision" && run && (
        <DecisionModal
          outcome={decision}
          runId={run.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            reload();
            setNotice(
              "Decision recorded. The workflow is sending the outcome to ERP.",
            );
          }}
        />
      )}
      {modal === "context" && oid && (
        <ContextModal oid={oid} onClose={() => setModal(null)} />
      )}
    </>
  );
}
function LayersIcon() {
  return <Check size={17} />;
}
function ArtifactView({
  artifact,
  editable,
  busy,
  onSave,
}: {
  artifact: Artifact;
  editable: boolean;
  busy: boolean;
  onSave: (content: ArtifactContent) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState<ArtifactContent>(
    structuredClone(artifact.content),
  );
  const columns = Object.keys(content.rows[0] || {});
  const sourceOwned = ["brief", "capability", "experience"].includes(
    artifact.kind,
  );
  const readonly = [
    "evidence",
    "source",
    "observed_at",
    "available_capacity",
    "pricing_source",
  ];
  const update = (index: number, key: string, value: string) =>
    setContent((c) => ({
      ...c,
      rows: c.rows.map((r, i) => (i === index ? { ...r, [key]: value } : r)),
    }));
  return (
    <div className="artifact-content">
      <div className="artifact-title">
        <div>
          <div className="artifact-meta">
            <Badge>Version {artifact.version}</Badge>
            <Status value={artifact.review_state} />
          </div>
          <h2>{artifact.title}</h2>
        </div>
        {editable && (
          <button
            className="button secondary small"
            disabled={busy}
            onClick={() => {
              setEditing(!editing);
              setContent(structuredClone(artifact.content));
            }}
          >
            <PenLine size={15} />
            {editing ? "Cancel edit" : "Edit artifact"}
          </button>
        )}
      </div>
      <div className="content-origin">
        <span className="status-dot" />
        {artifact.generation.content_mode}{" "}
        <span>· {artifact.generation.provider}</span>
      </div>
      {editing ? (
        <label className="editor-summary">
          Summary / reviewer annotation
          <textarea
            rows={4}
            value={content.summary}
            onChange={(e) =>
              setContent({ ...content, summary: e.target.value })
            }
          />
        </label>
      ) : (
        <p className="artifact-summary">{content.summary}</p>
      )}
      {editing && sourceOwned && (
        <p className="context-hint">
          ERP facts remain read-only. Add your reviewer annotation in the
          summary.
        </p>
      )}
      {content.rows.length ? (
        <div className={`artifact-table-wrap ${editing ? "editing" : ""}`}>
          <table className="artifact-table">
            <thead>
              <tr>
                {columns.map((key) => (
                  <th key={key}>{human(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {content.rows.map((row, index) => (
                <tr key={index}>
                  {columns.map((key) => (
                    <td key={key}>
                      {editing && !sourceOwned && !readonly.includes(key) ? (
                        artifact.kind === "clarifications" &&
                        key === "state" ? (
                          <select
                            aria-label={`Row ${index + 1} ${human(key)}`}
                            value={row[key]}
                            onChange={(e) => update(index, key, e.target.value)}
                          >
                            <option>Open</option>
                            <option>Resolved</option>
                          </select>
                        ) : (
                          <textarea
                            aria-label={`Row ${index + 1} ${human(key)}`}
                            rows={3}
                            value={row[key]}
                            onChange={(e) => update(index, key, e.target.value)}
                          />
                        )
                      ) : key === "state" ? (
                        <Status value={row[key]} />
                      ) : (
                        row[key] || <span className="muted">—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="no-gaps">
          <CheckCheck size={24} />
          <div>
            <strong>No missing fields detected</strong>
            <p>
              Human review is still required to validate the source and
              interpretation.
            </p>
          </div>
        </div>
      )}
      {editing && (
        <div className="form-actions">
          <button
            className="button"
            disabled={busy}
            onClick={async () => {
              if (await onSave(content)) setEditing(false);
            }}
          >
            <Save size={16} />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      )}
      <details className="provenance">
        <summary>
          <BookOpen size={16} /> Evidence & provenance{" "}
          <span>{artifact.provenance.length} references</span>
        </summary>
        <div>
          {artifact.provenance.map((p) => (
            <div key={p.type + p.id}>
              <Badge>{p.type.toUpperCase()}</Badge>
              <strong>{p.name}</strong>
              <code>
                {p.sha256 ? "SHA-256 " + p.sha256.slice(0, 16) + "…" : p.id}
              </code>
            </div>
          ))}
        </div>
      </details>
      {artifact.reviewed_by && (
        <p className="review-signature">
          <ShieldCheck size={15} />
          Reviewed by {artifact.reviewed_by}
        </p>
      )}
    </div>
  );
}
function CreateModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const key = useRef(crypto.randomUUID());
  return (
    <Modal title="Create an opportunity" onClose={onClose}>
      <p className="muted">
        Start with the business context. You can attach the brief next.
      </p>
      <ErrorBanner error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const data = Object.fromEntries(new FormData(e.currentTarget));
          try {
            const result = await api<Opportunity>("/opportunities", {
              method: "POST",
              headers: { "Idempotency-Key": key.current },
              body: JSON.stringify(data),
            });
            onCreated(result.id);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Opportunity name
          <input
            name="title"
            minLength={3}
            maxLength={180}
            required
            placeholder="e.g. Digital operations workspace"
          />
        </label>
        <div className="form-grid">
          <label>
            Customer
            <input
              name="customer"
              minLength={2}
              maxLength={140}
              required
              placeholder="Customer name"
            />
          </label>
          <label>
            Owner
            <input
              name="owner"
              minLength={2}
              maxLength={100}
              required
              placeholder="Pre-Sales owner"
            />
          </label>
        </div>
        <label>
          Expected timeline
          <input
            name="timeline"
            maxLength={160}
            placeholder="Leave blank if unconfirmed"
          />
        </label>
        <label>
          Sales notes
          <textarea
            name="notes"
            maxLength={5000}
            rows={3}
            placeholder="What is the customer trying to achieve?"
          />
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Creating…" : "Create opportunity"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function SourceModal({
  oid,
  onClose,
  onSaved,
}: {
  oid: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState("upload");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData(e.currentTarget);
      if (mode === "upload") {
        const file = form.get("file") as File;
        if (file.size > 10 * 1024 * 1024)
          throw new Error("Maximum document size is 10 MB");
        await api(`/opportunities/${oid}/upload`, {
          method: "POST",
          body: form,
        });
      } else {
        await post(`/opportunities/${oid}/documents`, {
          name: form.get("name"),
          text: form.get("text"),
          source_url: form.get("source_url") || null,
        });
      }
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Add source evidence" onClose={onClose}>
      <div className="segmented">
        <button
          className={mode === "upload" ? "active" : ""}
          onClick={() => setMode("upload")}
        >
          <Upload size={16} />
          Upload a document
        </button>
        <button
          className={mode === "text" ? "active" : ""}
          onClick={() => setMode("text")}
        >
          <FileText size={16} />
          Register source text
        </button>
      </div>
      <ErrorBanner error={error} />
      <form key={mode} onSubmit={submit}>
        {mode === "upload" ? (
          <label className="upload-zone">
            <Upload size={28} />
            <strong>Select a TOR, RFP or Sales brief</strong>
            <span>TXT, Markdown, CSV, PDF, DOCX or XLSX · up to 10 MB</span>
            <input
              type="file"
              name="file"
              accept=".txt,.md,.csv,.pdf,.docx,.xlsx"
              required
            />
          </label>
        ) : (
          <>
            <label>
              Source filename
              <input
                name="name"
                placeholder="customer-brief.md"
                pattern=".+\.(txt|md|csv)"
                required
              />
            </label>
            <label>
              Original reference URL (optional)
              <input type="url" name="source_url" placeholder="https://…" />
            </label>
            <label>
              Source text
              <textarea
                name="text"
                minLength={20}
                rows={9}
                required
                placeholder="Paste the actual brief or source content. Missing details will remain unconfirmed."
              />
            </label>
          </>
        )}
        <p className="context-hint">
          The original document and checksum are retained. A reference URL is
          recorded as provenance; it is not fetched automatically.
        </p>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Registering…" : "Add source"}
            <Plus size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ReviewModal({
  artifacts,
  runId,
  onClose,
  onSaved,
}: {
  artifacts: Artifact[];
  runId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal title="Review & approve the current pack" onClose={onClose}>
      <p className="muted">
        This records your approval of these exact versions. Editing an artifact
        will invalidate its approval and the proposal approval.
      </p>
      <div className="review-checklist">
        {artifacts.map((a) => (
          <div key={a.id}>
            <FileText size={15} />
            <span>{a.title}</span>
            <Badge>v{a.version}</Badge>
          </div>
        ))}
      </div>
      <ErrorBanner error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const form = new FormData(e.currentTarget);
            await post(`/runs/${runId}/review`, {
              versions: Object.fromEntries(
                artifacts.map((a) => [a.id, a.version]),
              ),
              note: form.get("note"),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Review note
          <textarea
            name="note"
            minLength={5}
            maxLength={2000}
            rows={2}
            required
            placeholder="Summarize your review and any remaining commercial conditions."
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            required
          />
          I have reviewed all 11 artifacts and their supporting sources.
        </label>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Back to pack
          </button>
          <button className="button" disabled={busy || !checked}>
            <CheckCheck size={17} />
            {busy ? "Approving…" : "Approve current versions"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function DecisionModal({
  outcome,
  runId,
  onClose,
  onSaved,
}: {
  outcome: string;
  runId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      title={
        outcome === "READY_FOR_SALES"
          ? "Record Ready for Sales"
          : "Request clarification"
      }
      onClose={onClose}
    >
      <p className="muted">
        {outcome === "READY_FOR_SALES"
          ? "The reviewed pack references and outcome will be recorded in ERP. This is approval for Sales discussion, not a pricing or delivery commitment."
          : "Record what Sales needs to clarify. The ERP opportunity status will update; no external message is sent."}
      </p>
      <ErrorBanner error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const form = new FormData(e.currentTarget);
            await post(`/runs/${runId}/decision`, {
              outcome,
              note: form.get("note"),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Decision / handoff note
          <textarea
            name="note"
            minLength={5}
            maxLength={2000}
            rows={4}
            required
            placeholder="Capture the decision and the next action for Sales."
          />
        </label>
        <div className="form-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button" disabled={busy}>
            {busy ? "Recording…" : "Record outcome"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ContextModal({ oid, onClose }: { oid: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    matches: { id: string; name: string; text: string }[];
  } | null>(null);
  return (
    <Modal title="Find evidence in this opportunity" onClose={onClose}>
      <p className="muted">
        Search only the indexed sources for this opportunity. Results retain
        their document references.
      </p>
      <ErrorBanner error={error} />
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const form = new FormData(e.currentTarget);
            setResult(
              await post(`/opportunities/${oid}/context`, {
                question: form.get("question"),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          What are you looking for?
          <input
            name="question"
            minLength={3}
            maxLength={1000}
            placeholder="e.g. acceptance criteria or ERP integration"
            required
          />
        </label>
        <button className="button" disabled={busy}>
          <Search size={16} />
          {busy ? "Searching…" : "Search evidence"}
        </button>
      </form>
      {result && (
        <div className="evidence-results">
          <p>{result.answer}</p>
          {result.matches.length ? (
            result.matches.map((m) => (
              <article key={m.id}>
                <Badge>{m.name}</Badge>
                <p>{m.text}</p>
              </article>
            ))
          ) : (
            <Empty title="No evidence found">
              Run analysis to index the documents first.
            </Empty>
          )}
        </div>
      )}
    </Modal>
  );
}
