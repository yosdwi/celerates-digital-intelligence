import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  BriefcaseBusiness,
  ShieldAlert,
  MessagesSquare,
  ChartNoAxesCombined,
  FileCheck2,
  Database,
  Layers3,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  Clock3,
  Info,
  Search,
} from "lucide-react";
import { api } from "./api";
import type {
  Opportunity,
  Support,
  ExceptionRecord,
  CaseRecord,
} from "./types";
import {
  useResource,
  PageHead,
  Metric,
  SectionTitle,
  Status,
  Badge,
  ErrorBanner,
  Loading,
  Modal,
  Empty,
  human,
} from "./ui";
const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
function SupportNote() {
  return (
    <p className="page-note">
      <Info size={16} />
      P0 supporting surface · seeded read models. Operational actions remain
      with the named owner in ERP.
    </p>
  );
}
export function Overview() {
  const { data, error, loading } = useResource(() =>
    Promise.all([
      api<Support>("/support"),
      api<{ items: Opportunity[] }>("/opportunities"),
    ]),
  );
  if (loading) return <Loading />;
  if (!data) return <ErrorBanner error={error} />;
  const [support, opps] = data;
  const needs = opps.items.filter((o) =>
    ["REVIEW_REQUIRED", "CLARIFICATION_REQUIRED", "FAILED"].includes(
      o.latest_run?.state || o.status,
    ),
  );
  return (
    <>
      <PageHead
        eyebrow="YOUR INTELLIGENCE WORKSPACE"
        title="Context for the decisions ahead."
        description="The work that needs attention, and the evidence to move it forward."
        action={
          <Link className="button" to="/app/presales">
            Open Pre-Sales <ArrowUpRight size={17} />
          </Link>
        }
      />
      <div className="metrics-grid">
        <Metric
          label="Active opportunities"
          value={opps.items.length.toString().padStart(2, "0")}
          detail="Connected opportunity context"
        />
        <Metric
          label="Needs your attention"
          value={(needs.length + support.metrics.open_exceptions)
            .toString()
            .padStart(2, "0")}
          detail="Opportunity reviews + exceptions"
        />
        <Metric
          label="Service cases"
          value={support.metrics.service_cases.toString().padStart(2, "0")}
          detail="Waiting for a human PIC"
        />
        <Metric
          label="Invoice value pending"
          value={
            "Rp" +
            (support.metrics.pending_invoice_value / 1e6).toFixed(0) +
            "m"
          }
          detail="Derived from open ERP exceptions"
        />
      </div>
      <div className="overview-grid">
        <section className="panel">
          <SectionTitle
            title="Needs your attention"
            subtitle="A clear next action, with an accountable owner."
          />
          <div className="attention-list">
            {needs.map((o) => (
              <Link to={`/app/presales?opportunity=${o.id}`} key={o.id}>
                <span className="round-icon sage">
                  <BriefcaseBusiness size={20} />
                </span>
                <div>
                  <small>PRE-SALES · {o.id}</small>
                  <strong>{o.title}</strong>
                  <p>{o.owner}</p>
                </div>
                <Status value={o.latest_run?.state || o.status} />
                <ChevronRight size={18} />
              </Link>
            ))}
            {support.exceptions.slice(0, 2).map((e) => (
              <Link to={`/app/exceptions?case=${e.id}`} key={e.id}>
                <span className="round-icon amber-bg">
                  <ShieldAlert size={20} />
                </span>
                <div>
                  <small>OPERATIONS · {e.id}</small>
                  <strong>{e.title}</strong>
                  <p>{e.owner}</p>
                </div>
                <Status value={e.state} />
                <ChevronRight size={18} />
              </Link>
            ))}
          </div>
        </section>
        <section className="executive-card">
          <div className="eyebrow">EXECUTIVE ACTION BRIEF</div>
          <div className="executive-icon">
            <ChartNoAxesCombined size={29} />
          </div>
          <h2>
            What matters
            <br />
            before the next move.
          </h2>
          <p>{support.briefs[0]?.why}</p>
          <div className="executive-owner">
            <span>OWNER</span>
            <strong>{support.briefs[0]?.owner}</strong>
          </div>
          <Link to="/app/management">
            Read the brief <ArrowRight size={17} />
          </Link>
        </section>
      </div>
      <SectionTitle
        title="Your business workspaces"
        subtitle="One shared intelligence layer. Four practical capabilities."
      />
      <div className="workspace-cards">
        {[
          [
            BriefcaseBusiness,
            "Pre-Sales",
            "From brief to reviewed proposal",
            "presales",
          ],
          [
            ShieldAlert,
            "Exceptions",
            "From blocker to accountable action",
            "exceptions",
          ],
          [
            MessagesSquare,
            "Human Service",
            "From question to helpful resolution",
            "human-service",
          ],
          [
            ChartNoAxesCombined,
            "Management",
            "From metrics to considered decisions",
            "management",
          ],
        ].map(([Icon, title, desc, path]) => {
          const C = Icon as typeof BriefcaseBusiness;
          return (
            <Link key={String(path)} to={"/app/" + path}>
              <C size={25} />
              <h3>{String(title)}</h3>
              <p>{String(desc)}</p>
              <ArrowUpRight size={18} />
            </Link>
          );
        })}
      </div>
      <SupportNote />
    </>
  );
}
export function Exceptions() {
  const { data, error, loading } = useResource(() => api<Support>("/support"));
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("All");
  const selected = data?.exceptions.find((e) => e.id === params.get("case"));
  return (
    <>
      <PageHead
        eyebrow="EXCEPTION ACTION CENTER"
        title="Make the blockers visible."
        description="Trusted trigger facts, business impact and the next accountable action."
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics-grid three">
              <Metric
                label="Open exceptions"
                value={data.metrics.open_exceptions}
                detail="Deterministic ERP rules"
              />
              <Metric
                label="Escalation due"
                value={
                  data.exceptions.filter((e) => e.state === "Escalation due")
                    .length
                }
                detail="Requires owner attention"
              />
              <Metric
                label="Potential invoice delay"
                value={money(data.metrics.pending_invoice_value)}
                detail="Affected BAST value; not total revenue"
              />
            </div>
            <div className="table-toolbar">
              <h2>Action queue</h2>
              <select
                aria-label="Filter exception severity"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option>All</option>
                <option>High</option>
                <option>Medium</option>
              </select>
            </div>
            <div className="exception-grid">
              {data.exceptions
                .filter((e) => filter === "All" || e.severity === filter)
                .map((e) => (
                  <button
                    className="exception-card"
                    key={e.id}
                    onClick={() => setParams({ case: e.id })}
                  >
                    <div className="card-icon-line">
                      <span className="round-icon amber-bg">
                        <ShieldAlert size={22} />
                      </span>
                      <Status value={e.state} />
                    </div>
                    <small>
                      {e.id} · {e.object}
                    </small>
                    <h2>{e.title}</h2>
                    <p>{e.impact}</p>
                    <div className="fact-strip">
                      <div>
                        <small>OWNER</small>
                        <strong>{e.owner}</strong>
                      </div>
                      <Badge tone={e.severity === "High" ? "red" : "amber"}>
                        {e.severity} priority
                      </Badge>
                    </div>
                    <div className="next-action">
                      <small>NEXT ACTION</small>
                      <p>{e.next_action}</p>
                    </div>
                    <div className="card-link">
                      Open context & evidence <ArrowUpRight size={18} />
                    </div>
                  </button>
                ))}
            </div>
            <SupportNote />
          </>
        )
      )}
      {selected && (
        <ExceptionModal item={selected} onClose={() => setParams({})} />
      )}
    </>
  );
}
function ExceptionModal({
  item: e,
  onClose,
}: {
  item: ExceptionRecord;
  onClose: () => void;
}) {
  return (
    <Modal title={e.title} onClose={onClose}>
      <div className="artifact-meta">
        <Badge>{e.id}</Badge>
        <Status value={e.state} />
      </div>
      <p>{e.object}</p>
      <dl className="context-dl">
        <dt>Trusted trigger facts</dt>
        <dd>{e.evidence}</dd>
        <dt>Why it matters</dt>
        <dd>{e.impact}</dd>
        <dt>Current blocker</dt>
        <dd>{e.blocker}</dd>
        <dt>Owner</dt>
        <dd>{e.owner}</dd>
        <dt>Suggested next action</dt>
        <dd>{e.next_action}</dd>
        <dt>Escalation</dt>
        <dd>{e.escalation}</dd>
      </dl>
      <h3>Action history</h3>
      <div className="simple-history">
        {e.history.map((h) => (
          <p key={h}>
            <Clock3 size={15} />
            {h}
          </p>
        ))}
      </div>
      <SupportNote />
    </Modal>
  );
}
export function HumanService() {
  const { data, error, loading } = useResource(() => api<Support>("/support"));
  const [selected, setSelected] = useState("HS-001");
  const item = data?.cases.find((c) => c.id === selected);
  return (
    <>
      <PageHead
        eyebrow="HUMAN SERVICE"
        title="Helpful context. A human connection."
        description="Give every request a clear answer, a responsible PIC and a visible next step."
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics-grid three">
              <Metric
                label="Incoming cases"
                value={data.cases.length}
                detail="Canonical service case records"
              />
              <Metric
                label="Human review"
                value={
                  data.cases.filter((c) => c.route === "Human review").length
                }
                detail="Context prepared for a PIC"
              />
              <Metric
                label="Routine resolutions"
                value={data.cases.filter((c) => c.status === "Resolved").length}
                detail="Answers retain policy evidence"
              />
            </div>
            <div className="inbox-layout">
              <div className="case-list">
                <SectionTitle title="Service inbox" />
                {data.cases.map((c) => (
                  <button
                    key={c.id}
                    className={selected === c.id ? "active" : ""}
                    onClick={() => setSelected(c.id)}
                  >
                    <div>
                      <span className="avatar">
                        {c.requester.slice(0, 2).toUpperCase()}
                      </span>
                      <Status value={c.status} />
                    </div>
                    <small>
                      {c.category} · {c.id}
                    </small>
                    <strong>{c.question}</strong>
                    <p>{c.requester}</p>
                  </button>
                ))}
              </div>
              {item && <CaseDetail item={item} />}
            </div>
            <SupportNote />
          </>
        )
      )}
    </>
  );
}
function CaseDetail({ item: c }: { item: CaseRecord }) {
  return (
    <section className="case-detail">
      <div className="eyebrow">
        {c.id} / {c.category.toUpperCase()}
      </div>
      <h2>{c.question}</h2>
      <div className="case-person">
        <span className="avatar">{c.requester.slice(0, 2).toUpperCase()}</span>
        <div>
          <strong>{c.requester}</strong>
          <small>{c.route}</small>
        </div>
        <Status value={c.status} />
      </div>
      <dl className="context-dl">
        <dt>Relevant context</dt>
        <dd>{c.context}</dd>
        <dt>ERP / knowledge evidence</dt>
        <dd className="evidence-box">
          <Database size={17} />
          {c.evidence}
        </dd>
        <dt>Policy reference</dt>
        <dd>{c.policy}</dd>
      </dl>
      <div className="response-draft">
        <div className="eyebrow">
          {c.status === "Resolved"
            ? "RECORDED ANSWER"
            : "RESPONSE DRAFT · PIC REVIEW REQUIRED"}
        </div>
        <p>{c.draft}</p>
      </div>
      <div className="case-next">
        <span className="round-icon sage">
          <MessagesSquare size={20} />
        </span>
        <div>
          <small>RESPONSIBLE PIC · {c.pic}</small>
          <strong>{c.next_action}</strong>
        </div>
      </div>
    </section>
  );
}
export function Management() {
  const { data, error, loading } = useResource(() => api<Support>("/support"));
  return (
    <>
      <PageHead
        eyebrow="MANAGEMENT INTELLIGENCE"
        title="The few things that need a decision."
        description="An executive action brief grounded in operational facts, with evidence one step away."
        action={<Badge>ERP-derived metrics</Badge>}
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="metrics-grid">
              <Metric
                label="Active opportunities"
                value={data.metrics.active_opportunities}
                detail="Current ERP opportunity count"
              />
              <Metric
                label="Operational exceptions"
                value={data.metrics.open_exceptions}
                detail="Open exception records"
              />
              <Metric
                label="Value awaiting BAST"
                value={
                  "Rp" +
                  (data.metrics.pending_invoice_value / 1e6).toFixed(0) +
                  "m"
                }
                detail="Sum of affected invoice values"
              />
              <Metric
                label="Cases awaiting PIC"
                value={data.metrics.service_cases}
                detail="Human service backlog"
              />
            </div>
            <SectionTitle
              title="Executive Action Brief"
              subtitle="What happened. Why it matters. Who owns it. What comes next."
            />
            <div className="brief-list">
              {data.briefs.map((b, i) => (
                <article className="brief-card" key={b.id}>
                  <div className="brief-number">0{i + 1}</div>
                  <div>
                    <div className="eyebrow">
                      {i === 0 ? "PRIORITY DECISION" : "REQUIRES ATTENTION"}
                    </div>
                    <h2>{b.what}</h2>
                    <p>{b.why}</p>
                    <div className="brief-bottom">
                      <div>
                        <small>ACCOUNTABLE OWNER</small>
                        <strong>{b.owner}</strong>
                      </div>
                      <div>
                        <small>RECOMMENDED ACTION</small>
                        <strong>{b.action}</strong>
                      </div>
                    </div>
                    <Link
                      className="text-link"
                      to={`/app/exceptions?case=${b.id}`}
                    >
                      Inspect underlying evidence <ArrowUpRight size={16} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
            <SupportNote />
          </>
        )
      )}
    </>
  );
}
type SourceData = {
  items: {
    id: string;
    source: string;
    connector: string;
    state: string;
    accepted: number;
    rejected: number;
    created_at: string;
    detail: Record<string, unknown>;
  }[];
  connectors: { name: string; state: string; boundary: string }[];
};
export function Sources() {
  const { data, error, loading } = useResource(() =>
    api<SourceData>("/sources"),
  );
  const [audit, setAudit] = useState<SourceData["items"][number] | null>(null);
  return (
    <>
      <PageHead
        eyebrow="SOURCES & INTEGRATIONS"
        title="Know where the context comes from."
        description="Visible ingestion, validation and provenance across your source boundaries."
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="connector-grid">
              {data.connectors.map((c) => (
                <div className="connector-card" key={c.name}>
                  <Database size={24} />
                  <Status value={c.state} />
                  <h3>{c.name}</h3>
                  <p>{c.boundary}</p>
                </div>
              ))}
            </div>
            <section className="panel">
              <SectionTitle
                title="Ingestion audit"
                subtitle="Each intake records its origin, validation result and processing outcome."
              />
              <div className="source-audit">
                {data.items.map((s) => (
                  <button key={s.id} onClick={() => setAudit(s)}>
                    <span className="round-icon sage">
                      <FileCheck2 size={19} />
                    </span>
                    <div>
                      <strong>{s.source}</strong>
                      <p>
                        {s.connector} ·{" "}
                        {new Date(s.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div>
                      <strong>{s.accepted} accepted</strong>
                      <small>{s.rejected} rejected</small>
                    </div>
                    <Status value={s.state} />
                    <ArrowUpRight size={17} />
                  </button>
                ))}
              </div>
            </section>
            <p className="page-note">
              <Info size={16} />
              Source adapters validate in Python before approved operational
              state is loaded through the ERP boundary.
            </p>
          </>
        )
      )}
      {audit && (
        <Modal title="Ingestion audit detail" onClose={() => setAudit(null)}>
          <Badge>{audit.id}</Badge>
          <h3>{audit.source}</h3>
          <dl className="context-dl">
            {Object.entries(audit.detail).map(([k, v]) => (
              <div key={k}>
                <dt>{human(k)}</dt>
                <dd className="break-anywhere">
                  {typeof v === "string" ? v : JSON.stringify(v, null, 2)}
                </dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </>
  );
}
type SystemData = {
  demo: boolean;
  erp: string;
  database: string;
  pgvector: string;
  storage: string;
  storage_status: string;
  model_mode: string;
  model_alias: string;
  embedding: string;
  langgraph: string;
  queued_runs: number;
  langfuse: string;
  n8n: string;
  access: string;
};
export function System() {
  const { data, error, loading } = useResource(() =>
    api<SystemData>("/system"),
  );
  return (
    <>
      <PageHead
        eyebrow="SYSTEM & ARCHITECTURE"
        title="A clear foundation behind the work."
        description="Understand the live implementation boundaries and the path to connected operation."
      />
      <ErrorBanner error={error} />
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="environment-panel">
              <div className="round-icon sage">
                <Layers3 size={25} />
              </div>
              <div>
                <h2>
                  {data.demo
                    ? "Demo ERP environment"
                    : "Connected ERP environment"}
                </h2>
                <p>
                  {data.demo
                    ? "Synthetic operational data, persistent workflow state and explicit human review."
                    : "Operational context is read and updated through the configured HTTP adapter."}
                </p>
              </div>
              <Badge tone="green">{data.access}</Badge>
            </div>
            <div className="system-grid">
              {[
                [
                  "Operational truth",
                  "ERP adapter",
                  data.erp === "demo" ? "Local demo ERP" : "HTTP ERP boundary",
                  "Customer, opportunity, capability and approved outcome actions.",
                ],
                [
                  "Intelligence store",
                  data.database,
                  "pgvector " + data.pgvector,
                  "Documents, full-text search, vector retrieval, artifacts and audit.",
                ],
                [
                  "Source objects",
                  "Object storage",
                  data.storage + " · " + data.storage_status,
                  "Original documents remain source-linked and checksum verified.",
                ],
                [
                  "Stateful execution",
                  "LangGraph",
                  data.langgraph,
                  `${data.queued_runs} queued or active runs. Human review resumes from persistent state.`,
                ],
                [
                  "Model gateway",
                  "LiteLLM boundary",
                  data.model_mode === "demo"
                    ? "Deterministic demo"
                    : data.model_alias,
                  `Embedding: ${data.embedding}. Provider failures remain visible.`,
                ],
                [
                  "Optional integrations",
                  "Tracing & automation",
                  `Langfuse: ${data.langfuse}`,
                  `n8n: ${data.n8n}. Critical domain logic stays in Python and Git.`,
                ],
              ].map(([tag, title, state, description]) => (
                <article className="system-card" key={title}>
                  <div className="eyebrow">{tag}</div>
                  <h2>{title}</h2>
                  <Badge>{state}</Badge>
                  <p>{description}</p>
                </article>
              ))}
            </div>
            <section className="panel architecture-panel">
              <SectionTitle
                title="Architecture source of truth"
                subtitle="Mermaid diagrams and decisions remain versioned alongside the implementation."
              />
              <div className="boundary-flow">
                {[
                  "Raw sources",
                  "Celerates ERP",
                  "Intelligence layer",
                  "Business applications",
                  "Human review → ERP outcome",
                ].map((b, i) => (
                  <div key={b}>
                    <span>0{i + 1}</span>
                    <strong>{b}</strong>
                  </div>
                ))}
              </div>
              <div className="architecture-links">
                <a
                  href="https://github.com/yosdwi/celerates-digital-intelligence/tree/feat/issue-1-functional-p0/docs/architecture"
                  target="_blank"
                  rel="noreferrer"
                >
                  View canonical diagrams <ExternalLink size={16} />
                </a>
                <a
                  href="https://github.com/yosdwi/celerates-digital-intelligence/tree/feat/issue-1-functional-p0/docs/adr"
                  target="_blank"
                  rel="noreferrer"
                >
                  Architecture decisions <ExternalLink size={16} />
                </a>
              </div>
            </section>
          </>
        )
      )}
    </>
  );
}
