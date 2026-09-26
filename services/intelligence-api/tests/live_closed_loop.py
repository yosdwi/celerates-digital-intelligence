"""Cross-stack acceptance: real Next ERP HTTP, real PostgreSQL/pgvector, FastAPI, graph and worker.
Synthetic Owner cookie is passed only by the disposable localhost harness; never production.
"""

import os
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from cdi.api import app
from cdi.config import settings
from cdi.db import connect, one
from cdi.erp import HttpERP
from cdi.knowledge import tick as ingest_tick
from cdi.migrate import migrate
from cdi.worker import tick
from cdi.workflow import execute

cfg = settings()
assert cfg.erp_base_url == "http://127.0.0.1:3310/api/integration/v1", "Local synthetic harness only"
migrate()
oid = os.environ["ERP_TEST_OPPORTUNITY"]
headers = {"Authorization": "Bearer " + cfg.api_access_token}
with TestClient(app, headers=headers) as c:
    assert TestClient(app).get("/api/opportunities").status_code == 401
    assert any(o["id"] == oid for o in c.get("/api/opportunities").json()["items"])
    source = c.post(
        "/api/knowledge/sources",
        json={
            "source_key": "cross-stack-playbook",
            "title": "Delivery acceptance playbook",
            "scope_type": "division",
            "scope_id": "sales",
            "source_kind": "playbook",
        },
    ).json()
    doc = c.post(
        f"/api/knowledge/sources/{source['id']}/versions?version=1",
        files={
            "file": (
                "playbook.md",
                b"Name an acceptance owner and preserve the signed test matrix before integration handover.",
                "text/markdown",
            )
        },
    ).json()
    assert ingest_tick()
    assert c.post(f"/api/knowledge/versions/{doc['id']}/lifecycle", json={"action": "approve"}).status_code == 200
    brief = "Build a Python ERP integration.\nAcceptance: signed matrix.\nTimeline: pilot after discovery.\nIntegration: controlled API.\nBudget: confirm separately."
    assert c.post(f"/api/opportunities/{oid}/documents", json={"name": "tor.md", "text": brief}).status_code == 201
    rid = c.post(f"/api/opportunities/{oid}/analyze").json()["id"]
    assert tick()
    detail = c.get(f"/api/opportunities/{oid}").json()
    assert detail["run"]["state"] == "REVIEW_REQUIRED", detail["run"]
    assert detail["run"]["evidence"]["opportunity"]["source"] == "Celerates ERP"
    assert any(p["type"] == "knowledge" for a in detail["artifacts"] for p in a["provenance"])
    assert (
        c.post(
            f"/api/runs/{rid}/decision", json={"outcome": "CLARIFICATION_REQUIRED", "note": "Must not bypass review"}
        ).status_code
        == 409
    )
    assert (
        c.post(
            f"/api/runs/{rid}/review",
            json={
                "versions": {a["id"]: a["version"] for a in detail["artifacts"]},
                "note": "Reviewed all exact versions",
            },
        ).status_code
        == 200
    )
    response = c.post(
        f"/api/runs/{rid}/decision",
        json={"outcome": "READY_FOR_SALES", "note": "Ready for discussion, no commercial commitment"},
    )
    assert response.status_code == 202, response.text
    assert tick()
    detail = c.get(f"/api/opportunities/{oid}").json()
    assert detail["run"]["state"] == "ERP_REVIEW_REQUIRED", detail["run"]
    review = detail["run"]["erp_review"]
    # Human browser-session approval is independent of service credentials.
    human_headers = {"Cookie": os.environ["ERP_TEST_COOKIE"], "Origin": "http://127.0.0.1:3310"}
    with httpx.Client(base_url="http://127.0.0.1:3310", headers=human_headers) as human:
        response = human.post(
            "/api/intelligence/reviews",
            json={
                "review_id": review["id"],
                "decision": "approved",
                "manifest_sha256": review["manifest_sha256"],
                "expected_version": detail["run"]["evidence"]["opportunity"]["record_version"],
                "note": "Synthetic Owner verified exact package",
            },
        )
        assert response.status_code == 200, response.text
    assert c.post(f"/api/runs/{rid}/retry").status_code == 202
    assert tick()
    result = c.get(f"/api/opportunities/{oid}").json()
    assert result["run"]["state"] == "READY_FOR_SALES", result["run"]
    assert any(r["run_id"] == rid for r in result["opportunity"]["artifact_references"])
    with connect() as conn:
        run = one(conn, "SELECT * FROM runs WHERE id=%s", (rid,))
    # Simulate response loss/retry after ERP commit: identical receipt, no second action.
    replay = HttpERP().action("opportunity.outcome", oid, run["decision"]["payload"], rid + ":outcome")
    assert replay == run["erp_receipt"]
    execute(rid)
    outcomes = c.get("/api/outcomes").json()["items"]
    outcome = next(o for o in outcomes if o["run_id"] == rid)
    assert outcome["checks"]["receipt_readback"] is True
    feedback = c.post(
        f"/api/outcomes/{outcome['id']}/feedback",
        json={
            "rating": 4,
            "correction": "For ERP integration, record the named acceptance owner before discussing final scope.",
            "request_key": str(uuid4()),
        },
    ).json()
    lesson = c.post(f"/api/feedback/{feedback['id']}/promote").json()
    assert lesson["lifecycle"] == "draft"
    assert ingest_tick()
    assert c.post(f"/api/knowledge/versions/{lesson['id']}/lifecycle", json={"action": "approve"}).status_code == 200
    next_run = c.post(f"/api/opportunities/{oid}/analyze").json()["id"]
    assert next_run != rid
    assert tick()
    second = c.get(f"/api/opportunities/{oid}").json()
    assert second["run"]["state"] == "REVIEW_REQUIRED", second["run"]
    assert any(r.get("document_id") == lesson["id"] for r in second["run"]["evidence"]["retrieved"])
    # Fresh knowledge deprecation invalidates a reviewed action before external commit.
    assert c.post(f"/api/knowledge/versions/{lesson['id']}/lifecycle", json={"action": "deprecate"}).status_code == 200
    from cdi.context import run_context, validate_knowledge

    _, snapshot, actor = run_context(next_run)
    try:
        validate_knowledge(snapshot, actor)
    except ValueError:
        pass
    else:
        raise AssertionError("Deprecated evidence must invalidate new action")
    with connect() as conn:
        assert one(conn, "SELECT count(*) AS n FROM workflow_outcomes WHERE run_id=%s", (rid,))["n"] == 1
print(
    "PASS: real ERP read → governed knowledge → reviewed pack → ERP human approval → idempotent action/read-back → outcome/feedback → approved lesson retrieved by next run"
)
