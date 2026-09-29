from typing import Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, ConfigDict, Field

from . import knowledge
from .config import settings
from .context import authorize_run, build_context
from .db import all_rows, connect, one
from .erp import erp
from .identity import actor

router = APIRouter(prefix="/api")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Source(Strict):
    source_key: str = Field(min_length=3, max_length=160, pattern=r"^[a-zA-Z0-9_.:-]+$")
    title: str = Field(min_length=3, max_length=200)
    scope_type: Literal["company", "division", "opportunity"]
    scope_id: str = Field(min_length=1, max_length=100)
    classification: Literal["internal", "restricted"] = "internal"
    source_kind: Literal["policy", "playbook", "reference", "lesson"] = "reference"


class Transition(Strict):
    action: Literal["approve", "deprecate", "retry"]


class ContextRequest(Strict):
    opportunity_id: str = Field(min_length=1, max_length=100)
    query: str = Field(min_length=3, max_length=1000)


class Feedback(Strict):
    rating: int = Field(ge=1, le=5)
    correction: str = Field(min_length=3, max_length=10000)
    request_key: str = Field(min_length=8, max_length=160)


@router.get("/knowledge")
def list_knowledge(user=Depends(actor)):
    with connect() as conn:
        sources = all_rows(conn, "SELECT * FROM knowledge_sources ORDER BY created_at DESC LIMIT 500")
        items = []
        for source in sources:
            try:
                knowledge.source_access(source, user)
            except (HTTPException, RuntimeError, ValueError):
                continue
            versions = all_rows(
                conn,
                "SELECT id,name,source_version,sha256,state,error,lifecycle,approved_by,created_at FROM documents WHERE source_id=%s ORDER BY source_version DESC",
                (source["id"],),
            )
            items.append({**source, "versions": versions})
        return {"items": items, "can_curate": "curator" in user.roles}


@router.post("/knowledge/sources", status_code=201)
def create_source(body: Source, user=Depends(actor)):
    return knowledge.register_source(body, user)


@router.post("/knowledge/sources/{sid}/versions", status_code=201)
def upload_version(sid: str, version: int = Query(ge=1, le=100000), file: UploadFile = File(...), user=Depends(actor)):
    body = file.file.read(settings().max_upload_bytes + 1)
    return knowledge.register_version(
        sid, version, file.filename or "document.txt", body, file.content_type or "application/octet-stream", user
    )


@router.post("/knowledge/versions/{did}/lifecycle")
def lifecycle(did: str, body: Transition, user=Depends(actor)):
    return knowledge.transition(did, body.action, user)


@router.post("/contexts/build")
def context(body: ContextRequest, user=Depends(actor)):
    return build_context(body.opportunity_id, body.query, user)


@router.get("/outcomes")
def outcomes(user=Depends(actor)):
    allowed = {o["id"] for o in erp().list("opportunity")}
    with connect() as conn:
        rows = all_rows(
            conn,
            "SELECT o.*,r.opportunity_id,c.sha256 AS context_sha256,c.workflow_version FROM workflow_outcomes o JOIN runs r ON r.id=o.run_id LEFT JOIN context_snapshots c ON c.id=o.context_id WHERE r.opportunity_id=ANY(%s) ORDER BY o.created_at DESC LIMIT 100",
            (list(allowed),),
        )
        permitted = []
        for row in rows:
            try:
                authorize_run(conn, {"id": row["run_id"], "opportunity_id": row["opportunity_id"]}, user)
            except HTTPException:
                continue
            permitted.append(row)
            row["feedback"] = all_rows(
                conn, "SELECT * FROM outcome_feedback WHERE outcome_id=%s ORDER BY created_at DESC", (row["id"],)
            )
    return {"items": permitted}


def outcome_access(conn, oid, user):
    row = one(
        conn, "SELECT o.*,r.opportunity_id FROM workflow_outcomes o JOIN runs r ON r.id=o.run_id WHERE o.id=%s", (oid,)
    )
    if not row:
        raise HTTPException(404, "Outcome not found")
    authorize_run(conn, {"id": row["run_id"], "opportunity_id": row["opportunity_id"]}, user)
    return row


@router.post("/outcomes/{oid}/feedback", status_code=201)
def feedback(oid: str, body: Feedback, user=Depends(actor)):
    with connect() as conn:
        outcome_access(conn, oid, user)
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (str(user) + body.request_key,))
        old = one(
            conn, "SELECT * FROM outcome_feedback WHERE actor=%s AND request_key=%s", (str(user), body.request_key)
        )
        if old:
            if old["outcome_id"] != oid or old["rating"] != body.rating or old["correction"] != body.correction:
                raise ValueError("Feedback key was used with different content")
            return old
        return one(
            conn,
            "INSERT INTO outcome_feedback(id,outcome_id,actor,rating,correction,request_key) VALUES (%s,%s,%s,%s,%s,%s) RETURNING *",
            (str(uuid4()), oid, str(user), body.rating, body.correction, body.request_key),
        )


@router.post("/feedback/{fid}/promote", status_code=201)
def promote(fid: str, user=Depends(actor)):
    user.require("curator")
    with connect() as conn:
        f = one(conn, "SELECT * FROM outcome_feedback WHERE id=%s", (fid,))
        if not f:
            raise HTTPException(404, "Feedback not found")
        outcome = outcome_access(conn, f["outcome_id"], user)
    source = knowledge.register_source(
        Source(
            source_key="feedback:" + fid,
            title="Reviewed lesson " + fid[:8],
            scope_type="opportunity",
            scope_id=outcome["opportunity_id"],
            source_kind="lesson",
            classification="restricted",
        ),
        user,
    )
    content = f"Outcome observation (not ERP truth).\nRun: {outcome['run_id']}\nReviewer: {f['actor']}\nCorrection / lesson:\n{f['correction']}"
    return knowledge.register_version(source["id"], 1, "lesson.md", content.encode(), "text/markdown", user)


@router.get("/contexts/{cid}")
def get_context(cid: str, user=Depends(actor)):
    with connect() as conn:
        row = one(conn, "SELECT * FROM context_snapshots WHERE id=%s", (cid,))
    if not row:
        raise HTTPException(404, "Context not found")
    erp().get("opportunity", row["opportunity_id"])
    # Historical content remains protected even after scope access is revoked.
    for ref in row["body"]["knowledge"]:
        if not knowledge.allowed(ref, user, row["opportunity_id"], "sales"):
            raise HTTPException(403, "Context contains knowledge outside your current access")
    return row
