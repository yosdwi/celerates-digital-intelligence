from typing import TypedDict
from uuid import uuid4

from langgraph.graph import END, START, StateGraph
from langgraph.types import Command, interrupt

from .artifacts import build_pack
from .db import all_rows, checkpointer, connect, json, one
from .documents import ingest, retrieve
from .erp import erp


class State(TypedDict, total=False):
    run_id: str
    opportunity_id: str
    decision: dict


def event(conn, run, kind, message, actor="system", data=None):
    conn.execute(
        "INSERT INTO events(opportunity_id,run_id,type,message,actor,data) VALUES (%s,%s,%s,%s,%s,%s)",
        (run["opportunity_id"], run["id"], kind, message, actor, json(data or {})),
    )


def progress(state, status, step):
    with connect() as conn:
        run = one(
            conn,
            "UPDATE runs SET state=%s,step=%s,updated_at=now() WHERE id=%s RETURNING *",
            (status, step, state["run_id"]),
        )
        event(conn, run, status, step)


def extract(state):
    progress(state, "INGESTING", "Extracting documents and preserving source evidence")
    ingest(state["opportunity_id"])
    return {}


def analyze(state):
    progress(state, "ANALYZING", "Retrieving evidence and querying ERP capability")
    adapter = erp()
    opportunity = adapter.get("opportunity", state["opportunity_id"])
    with connect() as conn:
        documents = all_rows(
            conn, "SELECT * FROM documents WHERE opportunity_id=%s ORDER BY created_at", (state["opportunity_id"],)
        )
    capabilities, projects = adapter.list("capability"), adapter.list("project")
    retrieved = retrieve(state["opportunity_id"], opportunity["title"])
    pack = build_pack(opportunity, documents, capabilities, projects, retrieved)
    with connect() as conn:
        # Node replay is idempotent. Existing human edits are never overwritten.
        for artifact in pack:
            aid = f"{state['run_id']}:{artifact['kind']}"
            row = one(
                conn,
                "INSERT INTO artifacts(id,run_id,kind,title,content,provenance,generation) "
                "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT(run_id,kind) DO NOTHING RETURNING id",
                (
                    aid,
                    state["run_id"],
                    artifact["kind"],
                    artifact["title"],
                    json(artifact["content"]),
                    json(artifact["provenance"]),
                    json(artifact["generation"]),
                ),
            )
            if row:
                conn.execute(
                    "INSERT INTO artifact_versions(artifact_id,version,content,actor) VALUES (%s,1,%s,%s)",
                    (aid, json(artifact["content"]), "generator"),
                )
        conn.execute(
            "UPDATE runs SET evidence=%s WHERE id=%s",
            (
                json(
                    {
                        "opportunity": opportunity,
                        "capabilities": capabilities,
                        "projects": projects,
                        "retrieved": retrieved,
                    }
                ),
                state["run_id"],
            ),
        )
    return {}


def review(state):
    # This node restarts on resume; no mutable side effects before interrupt.
    decision = interrupt(
        {
            "kind": "presales-review",
            "run_id": state["run_id"],
            "message": "Review the 11 artifacts, then approve or request clarification.",
        }
    )
    return {"decision": decision}


def close_loop(state):
    decision = state["decision"]
    acknowledgement = erp().action(
        "opportunity.outcome", state["opportunity_id"], decision["payload"], state["run_id"] + ":outcome"
    )
    if not isinstance(acknowledgement, dict) or acknowledgement.get("acknowledged") is not True:
        raise RuntimeError("ERP did not acknowledge the outcome; retry after checking the adapter")
    with connect() as conn:
        run = one(
            conn,
            "UPDATE runs SET state=%s,step=%s,error=NULL,lease_until=NULL,updated_at=now() WHERE id=%s RETURNING *",
            (decision["payload"]["status"], "Outcome acknowledged by ERP", state["run_id"]),
        )
        event(
            conn, run, "ERP_ACKNOWLEDGED", "Reviewed outcome and artifact references recorded in ERP", decision["actor"]
        )
    return {}


def graph(saver):
    builder = StateGraph(State)
    builder.add_node("ingest", extract)
    builder.add_node("analyze", analyze)
    builder.add_node("review", review)
    builder.add_node("close_loop", close_loop)
    builder.add_edge(START, "ingest")
    builder.add_edge("ingest", "analyze")
    builder.add_edge("analyze", "review")
    builder.add_edge("review", "close_loop")
    builder.add_edge("close_loop", END)
    return builder.compile(checkpointer=saver)


def execute(run_id):
    with connect() as conn:
        run = one(conn, "SELECT * FROM runs WHERE id=%s", (run_id,))
    config = {"configurable": {"thread_id": run_id}}
    try:
        with checkpointer() as saver:
            app = graph(saver)
            snapshot = app.get_state(config)
            if run["decision"]:
                argument = Command(resume=run["decision"]) if snapshot.next == ("review",) else None
            elif snapshot.values:
                argument = None
            else:
                argument = {"run_id": run_id, "opportunity_id": run["opportunity_id"]}
            result = app.invoke(argument, config)
            if result.get("__interrupt__"):
                progress({"run_id": run_id}, "REVIEW_REQUIRED", "11 artifacts ready for human review")
                with connect() as conn:
                    conn.execute("UPDATE runs SET lease_until=NULL WHERE id=%s", (run_id,))
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception("Workflow failed: %s", run_id)
        # Never persist raw provider/transport errors, which may contain credentials or business payloads.
        message = (
            str(exc)[:300]
            if isinstance(exc, (ValueError, RuntimeError))
            else f"{type(exc).__name__}: service operation failed; inspect server logs"
        )
        with connect() as conn:
            run = one(
                conn,
                "UPDATE runs SET state='FAILED',error=%s,lease_until=NULL,updated_at=now() WHERE id=%s RETURNING *",
                (message, run_id),
            )
            event(conn, run, "FAILED", message)


def enqueue(opportunity_id):
    erp().get("opportunity", opportunity_id)
    with connect() as conn:
        conn.execute("INSERT INTO workspaces(opportunity_id) VALUES (%s) ON CONFLICT DO NOTHING", (opportunity_id,))
        one(conn, "SELECT * FROM workspaces WHERE opportunity_id=%s FOR UPDATE", (opportunity_id,))
        active = one(
            conn,
            "SELECT * FROM runs WHERE opportunity_id=%s AND state IN ('QUEUED','INGESTING','ANALYZING','REVIEW_REQUIRED','RESUMING')",
            (opportunity_id,),
        )
        if active:
            return active
        if not one(conn, "SELECT 1 FROM documents WHERE opportunity_id=%s", (opportunity_id,)):
            raise ValueError("Attach a document before starting analysis")
        run = one(
            conn,
            "INSERT INTO runs(id,opportunity_id,state) VALUES (%s,%s,'QUEUED') RETURNING *",
            (str(uuid4()), opportunity_id),
        )
        event(conn, run, "QUEUED", "Analysis requested", "Pre-Sales reviewer")
        return run
