import { useState } from "react";
import { Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Layers3,
  LayoutDashboard,
  BriefcaseBusiness,
  ShieldAlert,
  MessagesSquare,
  ChartNoAxesCombined,
  Database,
  Workflow,
  Menu,
  X,
  ChevronRight,
  KeyRound,
  Check,
  Waypoints,
  FileCheck2,
  Users,
  PanelLeftClose,
  BrainCircuit,
} from "lucide-react";
import { Knowledge, Outcomes } from "./Foundation";
import { AgentConsole } from "./Agent";
import { Presales } from "./Presales";
import {
  Overview,
  Exceptions,
  HumanService,
  Management,
  Sources,
  System,
} from "./Support";
import { Modal, Badge } from "./ui";

const nav = [
  ["/app", "Overview", LayoutDashboard],
  ["/app/presales", "Pre-Sales", BriefcaseBusiness],
  ["/app/exceptions", "Exceptions", ShieldAlert],
  ["/app/human-service", "Human Service", MessagesSquare],
  ["/app/management", "Management", ChartNoAxesCombined],
  ["/app/agent", "Agent & learning", BrainCircuit],
  ["/app/knowledge", "Knowledge", FileCheck2],
  ["/app/outcomes", "Outcomes & feedback", Check],
  ["/app/sources", "Sources & Integrations", Database],
  ["/app/system", "System", Workflow],
] as const;
function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-symbol">
        <Layers3 size={23} />
      </span>
      <span>
        celerates<span className="brand-sub">DIGITAL INTELLIGENCE</span>
      </span>
    </Link>
  );
}
function Landing() {
  return (
    <div className="landing">
      <header className="landing-nav">
        <Brand />
        <nav>
          <a href="#applications">Applications</a>
          <a href="#approach">Our approach</a>
          <a href="#foundation">Foundation</a>
        </nav>
        <Link to="/app/presales" className="button small">
          Open workspace <ArrowUpRight size={16} />
        </Link>
      </header>
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="status-dot" /> CONNECTED CONTEXT. CONSIDERED
              ACTION.
            </span>
            <h1>
              Your data.
              <br />A clearer path
              <br />
              to <em>what’s next.</em>
            </h1>
            <p>
              Bring operational knowledge into the decisions that move your
              business. From a first sales brief to the next human service
              action.
            </p>
            <div className="hero-actions">
              <Link to="/app/presales" className="button">
                Explore Pre-Sales <ArrowRight size={18} />
              </Link>
              <a href="#approach" className="text-link">
                See how it works <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="hero-note">
              <span className="tiny-check">
                <Check size={12} />
              </span>{" "}
              Built around your ERP. Guided by your people.
            </div>
          </div>
          <div className="hero-visual">
            <div className="visual-caption">
              <span>THE INTELLIGENCE AT WORK</span>
              <span>01 / PRE-SALES</span>
            </div>
            <div className="sample-source">
              <div className="round-icon">
                <FileCheck2 size={22} />
              </div>
              <div>
                <small>A NEW OPPORTUNITY</small>
                <strong>From a complex brief…</strong>
                <span>Requirements · ERP context · Prior experience</span>
              </div>
              <Badge>Source linked</Badge>
            </div>
            <div className="visual-route">
              <span />
              <Waypoints size={24} />
              <span />
            </div>
            <div className="sample-pack">
              <div className="pack-top">
                <div className="round-icon sage">
                  <Layers3 size={21} />
                </div>
                <Badge tone="green">Human reviewed</Badge>
              </div>
              <h3>…to a useful first move.</h3>
              <p>
                A structured intelligence pack, ready for a considered Sales
                discussion.
              </p>
              <div className="sample-items">
                {[
                  "Requirements understood",
                  "Gaps made visible",
                  "Solution ready for review",
                ].map((x) => (
                  <div key={x}>
                    <Check size={16} />
                    {x}
                    <span>↗</span>
                  </div>
                ))}
              </div>
              <div className="pack-bottom">
                <div className="avatar-stack">
                  <span>PS</span>
                  <span>SL</span>
                </div>
                <span>Pre-Sales + Sales</span>
                <strong>11 artifacts</strong>
              </div>
            </div>
            <div className="visual-foot">
              <span className="status-dot" /> EVIDENCE IN. REVIEWED OUTCOMES
              OUT.
            </div>
          </div>
        </section>
        <section className="architecture-strip">
          <div>
            <small>THE CONNECTED FOUNDATION</small>
            <p>
              One operational truth.
              <br />
              <strong>More useful outcomes.</strong>
            </p>
          </div>
          {[
            ["01", "Your sources"],
            ["02", "Celerates ERP"],
            ["03", "Intelligence layer"],
            ["04", "Business applications"],
          ].map(([n, t], i) => (
            <div className={i === 2 ? "highlight" : ""} key={n}>
              <span>{n}</span>
              <strong>{t}</strong>
              {i < 3 && <ChevronRight size={17} />}
            </div>
          ))}
        </section>
        <section id="applications" className="landing-section">
          <div className="landing-section-head">
            <div>
              <div className="eyebrow">BUILT FOR THE WORK THAT MATTERS</div>
              <h2>
                Intelligence with
                <br />a job to do.
              </h2>
            </div>
            <p>
              Turn fragmented information into clear work products, accountable
              decisions and visible follow-through.
            </p>
          </div>
          <div className="application-grid">
            {[
              {
                icon: BriefcaseBusiness,
                n: "01",
                title: "Pre-Sales Intelligence",
                desc: "Understand the opportunity. Surface the gaps. Build a stronger first proposal.",
                path: "presales",
                tag: "FLAGSHIP WORKFLOW",
              },
              {
                icon: ShieldAlert,
                n: "02",
                title: "Exception Management",
                desc: "Know what is blocked, why it matters, and who needs to act next.",
                path: "exceptions",
                tag: "OPERATIONS",
              },
              {
                icon: Users,
                n: "03",
                title: "Human Service",
                desc: "Give your people a helpful answer or a clear route to the right person.",
                path: "human-service",
                tag: "PEOPLE & SERVICE",
              },
              {
                icon: ChartNoAxesCombined,
                n: "04",
                title: "Management Intelligence",
                desc: "See the few decisions that matter, with the evidence behind each one.",
                path: "management",
                tag: "LEADERSHIP",
              },
            ].map((a) => (
              <Link
                className="application-card"
                to={"/app/" + a.path}
                key={a.n}
              >
                <div className="card-icon-line">
                  <a.icon size={27} />
                  <span>{a.n}</span>
                </div>
                <small>{a.tag}</small>
                <h3>{a.title}</h3>
                <p>{a.desc}</p>
                <div className="card-link">
                  Explore workspace <ArrowUpRight size={18} />
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section id="approach" className="approach">
          <div>
            <div className="eyebrow">THE WAY FROM CONTEXT TO ACTION</div>
            <h2>
              Useful intelligence
              <br />
              keeps people
              <br />
              <em>in the loop.</em>
            </h2>
            <p>
              Reliable facts from your ERP. Relevant evidence from your
              knowledge. Human judgement at the moments that matter.
            </p>
          </div>
          <div className="approach-steps">
            {[
              [
                "01",
                "Bring context together",
                "Connect operational facts, source documents and approved experience.",
              ],
              [
                "02",
                "Make the work clearer",
                "Extract requirements, identify gaps and prepare structured work products.",
              ],
              [
                "03",
                "Review, decide, close the loop",
                "Your people approve the outcome. The status returns to your ERP.",
              ],
            ].map(([n, t, p]) => (
              <div key={n}>
                <span>{n}</span>
                <section>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </section>
              </div>
            ))}
          </div>
        </section>
        <section id="foundation" className="landing-section foundation">
          <div className="eyebrow">A PRACTICAL TECHNOLOGY FOUNDATION</div>
          <h2>
            Connected by design.
            <br />
            Built to grow with you.
          </h2>
          <div className="tech-chips">
            {[
              "Python Integration Core",
              "PostgreSQL + pgvector",
              "FastAPI",
              "LangGraph",
              "LiteLLM",
              "MinIO / S3",
            ].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
          <Link to="/app/system" className="text-link">
            Explore the system boundaries <ArrowUpRight size={17} />
          </Link>
        </section>
        <section className="landing-cta">
          <div>
            <div className="eyebrow">SEE THE COMPLETE WORKFLOW</div>
            <h2>Start with one opportunity.</h2>
            <p>
              Explore a working demo, from source evidence to a reviewed
              Pre-Sales pack.
            </p>
          </div>
          <Link to="/app/presales" className="button light">
            Open Pre-Sales workspace <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <footer>
        <Brand />
        <span>Celerates Digital Intelligence · Functional P0</span>
        <Link to="/app/system">
          System & architecture <ArrowUpRight size={15} />
        </Link>
      </footer>
    </div>
  );
}
function Shell() {
  const location = useLocation();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [access, setAccess] = useState(false);
  const [token, setToken] = useState(sessionStorage.getItem("cdi-token") || "");
  const current =
    nav.find(([path]) => path === location.pathname)?.[1] || "Workspace";
  return (
    <div className={`workspace ${collapsed ? "collapsed" : ""}`}>
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-label">INTELLIGENCE WORKSPACE</div>
        <nav>
          {nav.map(([path, label, Icon]) => (
            <NavLink
              to={path}
              end
              key={path}
              title={label}
              onClick={() => setMobile(false)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {label === "Pre-Sales" && <span className="nav-accent" />}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="status-dot" />
            Connected to context
            <p>
              Evidence. Human review.
              <br />
              Closed-loop outcomes.
            </p>
          </div>
          <button className="profile" onClick={() => setAccess(true)}>
            <span className="avatar">PS</span>
            <span>
              <strong>Pre-Sales workspace</strong>
              <small>Reviewer access</small>
            </span>
            <KeyRound size={16} />
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          className="nav-overlay"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <div className="workspace-body">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button desktop-only"
              onClick={() => setCollapsed(!collapsed)}
              aria-label="Toggle sidebar"
            >
              <PanelLeftClose size={19} />
            </button>
            <button
              className="icon-button mobile-only"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={20} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{current}</strong>
          </div>
          <div className="topbar-right">
            <Link to="/app/system" className="env-badge">
              <span className="status-dot" /> P0 workspace
            </Link>
            <Link to="/" className="topbar-link">
              Product overview <ArrowUpRight size={15} />
            </Link>
          </div>
        </header>
        <main className="app-content">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="presales" element={<Presales />} />
            <Route path="exceptions" element={<Exceptions />} />
            <Route path="human-service" element={<HumanService />} />
            <Route path="management" element={<Management />} />
            <Route path="agent" element={<AgentConsole />} />
            <Route path="knowledge" element={<Knowledge />} />
            <Route path="outcomes" element={<Outcomes />} />
            <Route path="sources" element={<Sources />} />
            <Route path="system" element={<System />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Page not found</h1>
                  <Link to="/app">Back to overview</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>Celerates Digital Intelligence</span>
          <span>Context → Review → Outcome</span>
        </footer>
      </div>
      {access && (
        <Modal title="Workspace access" onClose={() => setAccess(false)}>
          <p className="muted">
            Local demo mode uses a demo reviewer. For a token-protected
            workspace, enter the access token supplied by your administrator.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              token
                ? sessionStorage.setItem("cdi-token", token)
                : sessionStorage.removeItem("cdi-token");
              location.pathname;
              window.location.reload();
            }}
          >
            <label>
              Access token
              <input
                autoComplete="off"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <div className="form-actions">
              <button className="button" type="submit">
                Save access
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app/*" element={<Shell />} />
      <Route path="*" element={<Landing />} />
    </Routes>
  );
}
