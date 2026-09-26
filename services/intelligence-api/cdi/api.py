import json as stdjson
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import Response

from .agent.api import router as agent_router
from .artifacts import KINDS
from .config import settings
from .context import authorize_run
from .contracts import ArtifactEdit, ContextQuery, Decision, DocumentRegister, OpportunityCreate, ReviewPack
from .db import all_rows, connect, json, one
from .documents import register, retrieve
from .erp import erp
from .foundation_api import router as foundation_router
from .identity import actor
from .storage import storage
from .workflow import enqueue, event


@asynccontextmanager
async def lifespan(app):
    settings().validate_modes()
    yield


app = FastAPI(title="Celerates Digital Intelligence", version="0.1.0", lifespan=lifespan)


app.include_router(foundation_router)
app.include_router(agent_router)


@app.exception_handler(KeyError)
async def missing(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ValueError)
async def invalid(request, exc):
    from fastapi.responses import JSONResponse

    return JSONResponse(status_code=409, content={"detail": str(exc)})


@app.get("/health")
def health():
    return {"status": "ok", "service": "intelligence-api"}


@app.get("/ready")
def ready():
    try:
        with connect() as conn:
            one(conn, "SELECT 1 FROM schema_migrations LIMIT 1")
            vector = one(conn, "SELECT extversion FROM pg_extension WHERE extname='vector'")
            if not vector:
                raise RuntimeError("pgvector missing")
        storage().healthy()
        return {"status": "ready", "pgvector": vector["extversion"]}
    except Exception:
        raise HTTPException(503, "Database, migrations or object storage is not ready")


@app.get("/api/opportunities", dependencies=[Depends(actor)])
def opportunities():
    items = erp().list("opportunity")
    with connect() as conn:
        for item in items:
            run = one(
                conn,
                "SELECT id,state,step,error,created_at,updated_at FROM runs WHERE opportunity_id=%s ORDER BY created_at DESC LIMIT 1",
                (item["id"],),
            )
            item["latest_run"] = run
            item["document_count"] = one(
                conn, "SELECT count(*) AS n FROM documents WHERE opportunity_id=%s", (item["id"],)
            )["n"]
            item["clarification_count"] = 0
            item["completeness"] = 0
            if run:
                clarification = one(
                    conn, "SELECT content FROM artifacts WHERE run_id=%s AND kind='clarifications'", (run["id"],)
                )
                if clarification:
                    item["clarification_count"] = sum(
                        r.get("state") != "Resolved" for r in clarification["content"]["rows"]
                    )
                    item["completeness"] = max(0, 100 - item["clarification_count"] * 25)
    return {"items": items}


@app.post("/api/opportunities", status_code=201)
def create_opportunity(
    body: OpportunityCreate,
    user=Depends(actor),
    idempotency_key: Annotated[str, Header(min_length=8, max_length=160)] = "",
):
    if len(idempotency_key) < 8:
        raise HTTPException(400, "Idempotency-Key header is required")
    value = erp().create_opportunity(body.model_dump(), idempotency_key)
    with connect() as conn:
        conn.execute("INSERT INTO workspaces(opportunity_id) VALUES (%s) ON CONFLICT DO NOTHING", (value["id"],))
    return value


@app.get("/api/opportunities/{oid}", dependencies=[Depends(actor)])
def detail(oid: str, user=Depends(actor)):
    opportunity = erp().get("opportunity", oid)
    with connect() as conn:
        run = one(conn, "SELECT * FROM runs WHERE opportunity_id=%s ORDER BY created_at DESC LIMIT 1", (oid,))
        if run:
            authorize_run(conn, run, user)
        artifacts = all_rows(conn, "SELECT * FROM artifacts WHERE run_id=%s", (run["id"],)) if run else []
        ordering = {kind: i for i, (kind, _) in enumerate(KINDS)}
        artifacts.sort(key=lambda a: ordering[a["kind"]])
        return {
            "opportunity": opportunity,
            "run": run,
            "artifacts": artifacts,
            "documents": all_rows(
                conn,
                "SELECT id,name,state,error,parser,sha256,size_bytes,source_url,created_at FROM documents WHERE opportunity_id=%s ORDER BY created_at",
                (oid,),
            ),
            "events": all_rows(conn, "SELECT * FROM events WHERE opportunity_id=%s ORDER BY id DESC LIMIT 40", (oid,)),
        }


@app.post("/api/opportunities/{oid}/documents", status_code=201, dependencies=[Depends(actor)])
def register_document(oid: str, body: DocumentRegister):
    erp().get("opportunity", oid)
    if Path(body.name).suffix.lower() not in {".txt", ".md", ".csv"}:
        raise HTTPException(422, "Pasted source text must use a .txt, .md or .csv filename")
    return register(oid, body.name, body.text.encode(), "text/plain", body.source_url)


@app.post("/api/opportunities/{oid}/upload", status_code=201, dependencies=[Depends(actor)])
async def upload_document(oid: str, file: UploadFile = File(...)):
    erp().get("opportunity", oid)
    body = await file.read(settings().max_upload_bytes + 1)
    await file.close()
    if len(body) > settings().max_upload_bytes:
        raise HTTPException(413, "Maximum document size is 10 MB")
    # Offload parsing/storage I/O from the ASGI event loop.
    from starlette.concurrency import run_in_threadpool

    return await run_in_threadpool(
        register, oid, file.filename or "document.txt", body, file.content_type or "application/octet-stream"
    )


@app.get("/api/documents/{document_id}/download", dependencies=[Depends(actor)])
def download_document(document_id: str, user=Depends(actor)):
    with connect() as conn:
        doc = one(conn, "SELECT * FROM documents WHERE id=%s", (document_id,))
    if not doc:
        raise HTTPException(404, "Document not found")
    if doc["source_id"]:
        from .knowledge import source_access

        with connect() as conn:
            source = one(conn, "SELECT * FROM knowledge_sources WHERE id=%s", (doc["source_id"],))
        source_access(source, user)
    else:
        erp().get("opportunity", doc["opportunity_id"])
    from urllib.parse import quote

    return Response(
        storage().get(doc["object_key"]),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": "attachment; filename*=UTF-8''" + quote(doc["name"]),
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.post("/api/opportunities/{oid}/analyze", status_code=202, dependencies=[Depends(actor)])
def start_analysis(oid: str, user=Depends(actor)):
    return enqueue(oid, user)


def locked_run(conn, run_id, user):
    run = one(conn, "SELECT * FROM runs WHERE id=%s FOR UPDATE", (run_id,))
    if not run:
        raise HTTPException(404, "Run not found")
    authorize_run(conn, run, user)
    return run


@app.post("/api/runs/{run_id}/retry", status_code=202)
def retry(run_id: str, user=Depends(actor)):
    with connect() as conn:
        run = locked_run(conn, run_id, user)
        if run["state"] not in {"FAILED", "ERP_REVIEW_REQUIRED"}:
            raise ValueError("Only failed runs or pending ERP approvals can be retried")
        # A newer run invalidates retry of this historical run.
        latest = one(
            conn,
            "SELECT id FROM runs WHERE opportunity_id=%s ORDER BY created_at DESC LIMIT 1",
            (run["opportunity_id"],),
        )
        if latest["id"] != run_id:
            raise ValueError("A newer analysis exists; open the latest run")
        state = "RESUMING" if run["decision"] else "QUEUED"
        conn.execute(
            "UPDATE runs SET state=%s,error=NULL,lease_until=NULL,updated_at=now() WHERE id=%s", (state, run_id)
        )
        event(conn, run, "RETRY", "Retry queued from durable checkpoint", user)
    return {"state": state}


@app.patch("/api/artifacts/{aid}")
def edit_artifact(aid: str, body: ArtifactEdit, user=Depends(actor)):
    with connect() as conn:
        artifact = one(conn, "SELECT * FROM artifacts WHERE id=%s", (aid,))
        if not artifact:
            raise HTTPException(404, "Artifact not found")
        run = locked_run(conn, artifact["run_id"], user)
        artifact = one(conn, "SELECT * FROM artifacts WHERE id=%s FOR UPDATE", (aid,))
        if run["state"] != "REVIEW_REQUIRED":
            raise ValueError("Artifacts are editable only during human review")
        if body.version != artifact["version"]:
            raise ValueError("Artifact changed in another session. Refresh before saving.")
        content = body.content.model_dump()
        # Preserve table schema and immutable source columns; facts remain source-owned.
        if len(content["rows"]) != len(artifact["content"]["rows"]):
            raise ValueError("Keep the existing artifact row structure")
        immutable = {"evidence", "source", "observed_at", "available_capacity", "pricing_source"}
        for old, new in zip(artifact["content"]["rows"], content["rows"]):
            if set(old) != set(new) or any(new[k] != old[k] for k in immutable & old.keys()):
                raise ValueError("Source references and authoritative ERP facts cannot be edited")
        if artifact["kind"] in {"brief", "capability", "experience"} and content["rows"] != artifact["content"]["rows"]:
            raise ValueError("ERP facts are read-only; annotate the summary or correct the source")
        if artifact["kind"] == "clarifications":
            for row in content["rows"]:
                if row["state"] not in {"Open", "Resolved"}:
                    raise ValueError("Clarification state must be Open or Resolved")
                if row["state"] == "Resolved" and not row["answer"].strip():
                    raise ValueError("A resolved clarification requires an answer")
        updated = one(
            conn,
            "UPDATE artifacts SET content=%s,version=version+1,review_state='DRAFT',reviewed_by=NULL,reviewed_at=NULL,updated_at=now() WHERE id=%s RETURNING *",
            (json(content), aid),
        )
        conn.execute(
            "INSERT INTO artifact_versions(artifact_id,version,content,actor) VALUES (%s,%s,%s,%s)",
            (aid, updated["version"], json(content), user),
        )
        # Proposal approval depends on the current versions of upstream artifacts.
        conn.execute(
            "UPDATE artifacts SET review_state='DRAFT',reviewed_by=NULL,reviewed_at=NULL WHERE run_id=%s AND kind='proposal'",
            (run["id"],),
        )
        event(conn, run, "ARTIFACT_EDITED", f"{artifact['title']} saved as version {updated['version']}", user)
        return updated


@app.post("/api/runs/{run_id}/review")
def review_pack(run_id: str, body: ReviewPack, user=Depends(actor)):
    with connect() as conn:
        run = locked_run(conn, run_id, user)
        if run["state"] != "REVIEW_REQUIRED":
            raise ValueError("Run is not awaiting review")
        artifacts = all_rows(conn, "SELECT * FROM artifacts WHERE run_id=%s", (run_id,))
        expected = {a["id"]: a["version"] for a in artifacts}
        if len(artifacts) != 11 or body.versions != expected:
            raise ValueError("Review must include all 11 current artifact versions. Refresh and review again.")
        conn.execute(
            "UPDATE artifacts SET review_state='APPROVED',reviewed_by=%s,reviewed_at=now() WHERE run_id=%s",
            (user, run_id),
        )
        conn.execute(
            "UPDATE artifacts SET generation=generation || %s WHERE run_id=%s AND kind='proposal'",
            (json({"approved_dependency_versions": expected}), run_id),
        )
        event(conn, run, "PACK_REVIEWED", body.note, user, {"versions": expected})
    return {"review_state": "APPROVED"}


@app.post("/api/runs/{run_id}/decision", status_code=202)
def decide(run_id: str, body: Decision, user=Depends(actor)):
    with connect() as conn:
        run = locked_run(conn, run_id, user)
        if run["state"] != "REVIEW_REQUIRED":
            raise ValueError("Run is not awaiting a decision")
        artifacts = all_rows(conn, "SELECT * FROM artifacts WHERE run_id=%s", (run_id,))
        if settings().erp_mode == "http" and (
            len(artifacts) != 11 or any(a["review_state"] != "APPROVED" for a in artifacts)
        ):
            raise ValueError("Review all current artifacts before requesting an ERP action")
        if body.outcome == "READY_FOR_SALES":
            if len(artifacts) != 11 or any(a["review_state"] != "APPROVED" for a in artifacts):
                raise ValueError("Explicitly review and approve all current artifact versions first")
            clarification = next(a for a in artifacts if a["kind"] == "clarifications")
            if any(r["state"] != "Resolved" or not r["answer"].strip() for r in clarification["content"]["rows"]):
                raise ValueError("Resolve all open clarifications before marking Ready for Sales")
        payload = {
            "status": body.outcome,
            "note": body.note,
            "artifacts": [
                {"id": a["id"], "version": a["version"], "review_state": a["review_state"]} for a in artifacts
            ],
        }
        decision = {"actor": user, "payload": payload}
        conn.execute(
            "UPDATE runs SET state='RESUMING',decision=%s,lease_until=NULL,updated_at=now() WHERE id=%s",
            (json(decision), run_id),
        )
        event(conn, run, "DECISION", body.note, user, {"outcome": body.outcome})
    return {"state": "RESUMING"}


@app.post("/api/opportunities/{oid}/context", dependencies=[Depends(actor)])
def context(oid: str, body: ContextQuery):
    erp().get("opportunity", oid)
    return {
        "answer": "Matching evidence from this opportunity. Validate source context before making a decision.",
        "matches": retrieve(oid, body.question),
    }


@app.get("/api/support", dependencies=[Depends(actor)])
def support():
    adapter = erp()
    exceptions, cases = adapter.list("exception"), adapter.list("case")
    opportunities = adapter.list("opportunity")
    blocked = [e for e in exceptions if e["state"] != "Resolved"]
    return {
        "availability": "demo fixtures"
        if settings().erp_mode == "demo"
        else "Exceptions and service cases are outside the live ERP contract",
        "exceptions": exceptions,
        "cases": cases,
        "metrics": {
            "active_opportunities": len(opportunities),
            "open_exceptions": len(blocked),
            "pending_invoice_value": sum(e.get("invoice_value", 0) for e in blocked),
            "service_cases": sum(c["status"] != "Resolved" for c in cases),
        },
        "briefs": [
            {
                "id": e["id"],
                "what": e["title"],
                "why": e["impact"],
                "owner": e["owner"],
                "action": e["next_action"],
                "evidence": e["evidence"],
            }
            for e in blocked
        ],
    }


@app.get("/api/sources", dependencies=[Depends(actor)])
def sources():
    with connect() as conn:
        return {
            "items": all_rows(conn, "SELECT * FROM ingestion_audit ORDER BY created_at DESC LIMIT 100"),
            "connectors": [
                {"name": "Document intake", "state": "Active", "boundary": "Object storage → parser → retrieval index"},
                {"name": "CSV / Excel", "state": "Available", "boundary": "Python validation → ERP adapter"},
                {"name": "Generic REST / PostgreSQL", "state": "Configurable", "boundary": "Python source adapters"},
                {
                    "name": "SQL Server / Jira",
                    "state": "Interface only",
                    "boundary": "Connector implementation deferred",
                },
                {"name": "n8n", "state": "Optional", "boundary": "Triggers and notification support"},
            ],
        }


@app.get("/api/system", dependencies=[Depends(actor)])
def system():
    cfg = settings()
    with connect() as conn:
        extension = one(conn, "SELECT extversion FROM pg_extension WHERE extname='vector'")
        queue = one(conn, "SELECT count(*) AS n FROM runs WHERE state IN ('QUEUED','INGESTING','ANALYZING','RESUMING')")
    try:
        storage().healthy()
        object_state = "Healthy"
    except Exception:
        object_state = "Unavailable"
    return {
        "demo": cfg.erp_mode == "demo",
        "erp": cfg.erp_mode,
        "database": "PostgreSQL",
        "pgvector": extension["extversion"] if extension else "Missing",
        "storage": cfg.storage_backend,
        "storage_status": object_state,
        "model_mode": cfg.model_mode,
        "model_alias": "reasoning-strong",
        "embedding": "demo-hash-64-v1 (deterministic token similarity)"
        if cfg.model_mode == "demo"
        else cfg.embedding_model,
        "langgraph": "PostgreSQL checkpoints + human interrupt",
        "queued_runs": queue["n"],
        "langfuse": "Configured" if cfg.langfuse_enabled else "Optional / not configured",
        "n8n": "Configured" if cfg.n8n_enabled else "Optional / not configured",
        "access": "Named token protected"
        if cfg.api_access_token or cfg.intelligence_principals_json != "[]"
        else "Local demo reviewer",
        "erp_review_url": cfg.erp_base_url.split("/api/")[0] + "/intelligence" if cfg.erp_mode == "http" else None,
        "contract_resources": ["sales_opportunity"] if cfg.erp_mode == "http" else ["demo fixtures"],
        "unsupported_live_resources": ["capacity", "project_history", "exceptions", "service_cases"],
        "agent": {
            "delegation_keys": len(stdjson.loads(cfg.erp_delegation_public_keys or "{}")),
            "playbooks": "m1-playbooks-v1",
            "model": "none (deterministic playbooks)",
        },
    }
