import hashlib
import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from cdi.api import app
from cdi.config import settings
from cdi.db import connect, one
from cdi.knowledge import tick
from cdi.migrate import migrate
from cdi.workflow import execute


@pytest.fixture(scope="module", autouse=True)
def schema():
    migrate()


def test_governed_source_lifecycle_permissions_and_feedback(monkeypatch):
    with TestClient(app) as c:
        oid = c.post(
            "/api/opportunities",
            json={"title": "Governed Python integration", "customer": "Synthetic", "owner": "Test"},
            headers={"Idempotency-Key": str(uuid4())},
        ).json()["id"]
        source = c.post(
            "/api/knowledge/sources",
            json={
                "source_key": str(uuid4()),
                "title": "Delivery playbook",
                "scope_type": "division",
                "scope_id": "sales",
                "source_kind": "playbook",
                "classification": "restricted",
            },
        ).json()
        path = f"/api/knowledge/sources/{source['id']}/versions?version=1"
        files = {
            "file": ("playbook.md", b"Confirm an acceptance owner before a Python integration pilot.", "text/markdown")
        }
        doc = c.post(path, files=files).json()
        assert c.post(path, files=files).json()["id"] == doc["id"]
        assert c.post(path, files={"file": ("changed.md", b"changed", "text/markdown")}).status_code == 409
        lifecycle = f"/api/knowledge/versions/{doc['id']}/lifecycle"
        assert c.post(lifecycle, json={"action": "approve"}).status_code == 409
        assert tick()
        assert not c.post("/api/contexts/build", json={"opportunity_id": oid, "query": "Python integration"}).json()[
            "body"
        ]["knowledge"]
        assert c.post(lifecycle, json={"action": "approve"}).status_code == 200
        ctx = c.post("/api/contexts/build", json={"opportunity_id": oid, "query": "Python integration"}).json()
        assert any(r["document_id"] == doc["id"] for r in ctx["body"]["knowledge"])
        token = "synthetic-limited-reviewer"
        principals = [
            {
                "id": "limited",
                "token_sha256": hashlib.sha256(token.encode()).hexdigest(),
                "roles": ["reviewer"],
                "divisions": ["sales"],
                "restricted": False,
            }
        ]
        monkeypatch.setattr(settings(), "intelligence_principals_json", json.dumps(principals))
        headers = {"Authorization": "Bearer " + token}
        assert c.get("/api/knowledge").status_code == 401
        limited = c.post(
            "/api/contexts/build", json={"opportunity_id": oid, "query": "Python integration"}, headers=headers
        )
        assert limited.status_code == 200 and limited.json()["body"]["knowledge"] == []
        assert c.get(f"/api/documents/{doc['id']}/download", headers=headers).status_code == 403
        assert c.post(lifecycle, json={"action": "deprecate"}, headers=headers).status_code == 403
        monkeypatch.setattr(settings(), "intelligence_principals_json", "[]")
        brief = "Build a Python integration.\nAcceptance: signed test.\nTimeline: confirm pilot.\nIntegration: ERP API.\nBudget: separately approved."
        assert (
            c.post(f"/api/opportunities/{oid}/documents", json={"name": "brief.md", "text": brief}).status_code == 201
        )
        rid = c.post(f"/api/opportunities/{oid}/analyze").json()["id"]
        execute(rid)
        detail = c.get(f"/api/opportunities/{oid}").json()
        assert detail["run"]["state"] == "REVIEW_REQUIRED", detail["run"]
        solution = next(a for a in detail["artifacts"] if a["kind"] == "solution")
        assert any("acceptance owner" in r.get("approach", "") for r in solution["content"]["rows"])
        assert (
            c.post(
                f"/api/runs/{rid}/review",
                json={
                    "versions": {a["id"]: a["version"] for a in detail["artifacts"]},
                    "note": "Reviewed exact versions",
                },
            ).status_code
            == 200
        )
        c.post(f"/api/runs/{rid}/decision", json={"outcome": "READY_FOR_SALES", "note": "Reviewed for discussion only"})
        execute(rid)
        outcomes = c.get("/api/outcomes").json()["items"]
        outcome = next(o for o in outcomes if o["run_id"] == rid)
        feedback = {
            "rating": 4,
            "correction": "Confirm named acceptance owner before scope approval.",
            "request_key": str(uuid4()),
        }
        f = c.post(f"/api/outcomes/{outcome['id']}/feedback", json=feedback).json()
        assert c.post(f"/api/outcomes/{outcome['id']}/feedback", json=feedback).json()["id"] == f["id"]
        lesson = c.post(f"/api/feedback/{f['id']}/promote").json()
        assert lesson["lifecycle"] == "draft"
        assert tick()
        assert (
            c.post(f"/api/knowledge/versions/{lesson['id']}/lifecycle", json={"action": "approve"}).status_code == 200
        )
        c.post(lifecycle, json={"action": "deprecate"})
        next_ctx = c.post("/api/contexts/build", json={"opportunity_id": oid, "query": "acceptance owner"}).json()
        assert any(r["document_id"] == lesson["id"] for r in next_ctx["body"]["knowledge"])
        assert not any(r["document_id"] == doc["id"] for r in next_ctx["body"]["knowledge"])
        with connect() as conn:
            assert one(conn, "SELECT count(*) AS n FROM workflow_outcomes WHERE run_id=%s", (rid,))["n"] == 1
