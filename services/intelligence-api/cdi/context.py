"""Reusable, versioned context: operational facts, governed knowledge, and observations stay distinct."""

import hashlib
import json as stdjson
from uuid import uuid4

from .db import all_rows, connect, json, one
from .documents import retrieve as retrieve_documents
from .erp import erp
from .identity import resolve
from .knowledge import retrieve as retrieve_knowledge
from .knowledge import source_access

POLICY_VERSION = "context-scope-v1"
WORKFLOW_VERSION = "presales-closed-loop-v2"


def digest(value):
    return hashlib.sha256(
        stdjson.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str).encode()
    ).hexdigest()


def build_context(opportunity_id, query, actor, run_id=None):
    actor.require("reviewer")
    operational = erp().get("opportunity", opportunity_id)
    with connect() as conn:
        observations = all_rows(
            conn,
            "SELECT o.id,o.run_id,o.outcome,o.checks,o.created_at FROM workflow_outcomes o JOIN runs r ON r.id=o.run_id WHERE r.opportunity_id=%s ORDER BY o.created_at DESC LIMIT 5",
            (opportunity_id,),
        )
    body = {
        "operational": operational,
        "source_evidence": retrieve_documents(opportunity_id, query),
        "knowledge": retrieve_knowledge(opportunity_id, query, actor),
        "observations": observations,
        "policy_version": POLICY_VERSION,
        "workflow_version": WORKFLOW_VERSION,
    }
    snapshot = {"id": str(uuid4()), "sha256": digest(body), "body": body}
    if run_id:
        with connect() as conn:
            old = one(conn, "SELECT * FROM context_snapshots WHERE run_id=%s", (run_id,))
            if old:
                return old
            conn.execute(
                "INSERT INTO context_snapshots(id,run_id,opportunity_id,actor,policy_version,workflow_version,sha256,body) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
                (
                    snapshot["id"],
                    run_id,
                    opportunity_id,
                    str(actor),
                    POLICY_VERSION,
                    WORKFLOW_VERSION,
                    snapshot["sha256"],
                    json(stdjson.loads(stdjson.dumps(body, default=str))),
                ),
            )
            conn.execute("UPDATE runs SET context_id=%s WHERE id=%s", (snapshot["id"], run_id))
    return snapshot


def validate_knowledge(snapshot, actor):
    for ref in snapshot["body"]["knowledge"]:
        with connect() as conn:
            doc = one(
                conn,
                "SELECT d.*,s.scope_type,s.scope_id,s.classification FROM documents d JOIN knowledge_sources s ON s.id=d.source_id WHERE d.id=%s",
                (ref["document_id"],),
            )
        if not doc or doc["lifecycle"] != "active" or doc["sha256"] != ref["sha256"]:
            raise ValueError("Knowledge context changed; start a new analysis and review")
        source_access(doc, actor)


def run_context(run_id):
    with connect() as conn:
        run = one(conn, "SELECT * FROM runs WHERE id=%s", (run_id,))
        snapshot = one(conn, "SELECT * FROM context_snapshots WHERE run_id=%s", (run_id,))
    actor = resolve(run["requested_by"]).require("reviewer")
    if not snapshot:
        raise ValueError("Run has no governed context; start a new analysis")
    return run, snapshot, actor


def authorize_run(conn, run, actor):
    erp().get("opportunity", run["opportunity_id"])
    snapshot = one(conn, "SELECT body FROM context_snapshots WHERE run_id=%s", (run["id"],))
    if snapshot:
        from fastapi import HTTPException

        from .knowledge import allowed

        for ref in snapshot["body"]["knowledge"]:
            if not allowed(ref, actor, run["opportunity_id"], "sales"):
                raise HTTPException(403, "Run contains knowledge outside your current access")
