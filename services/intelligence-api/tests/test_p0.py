"""Integration tests exercise the real SQL schema, graph checkpoints and HTTP contracts."""

import hashlib
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from cdi.api import app
from cdi.config import settings
from cdi.db import connect, one
from cdi.documents import retrieve
from cdi.erp import DemoERP, HttpERP
from cdi.intake import FileSource, ingest_source
from cdi.migrate import migrate
from cdi.worker import tick
from cdi.workflow import execute


@pytest.fixture(scope="session", autouse=True)
def database():
    migrate()


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def create(client):
    key = str(uuid4())
    data = {
        "title": "Python ERP service workspace",
        "customer": "Acceptance Test Customer",
        "owner": "Test Pre-Sales",
        "notes": "A test opportunity",
        "timeline": "",
    }
    response = client.post("/api/opportunities", json=data, headers={"Idempotency-Key": key})
    assert response.status_code == 201, response.text
    replay = client.post("/api/opportunities", json=data, headers={"Idempotency-Key": key})
    assert replay.json()["id"] == response.json()["id"]
    return response.json()["id"]


def attach(client, oid, complete=True):
    text = "# Customer brief\nBuild a React workspace using Python ERP integration.\n"
    if complete:
        text += (
            "Acceptance: a signed test matrix.\nTimeline: discovery then a pilot.\n"
            "Integration: ERP REST API.\nBudget: Sales must validate commercial terms.\n"
        )
    result = client.post(f"/api/opportunities/{oid}/documents", json={"name": "brief.md", "text": text})
    assert result.status_code == 201, result.text
    return result.json(), text


def analyze(client, oid):
    result = client.post(f"/api/opportunities/{oid}/analyze")
    assert result.status_code == 202, result.text
    run_id = result.json()["id"]
    assert client.post(f"/api/opportunities/{oid}/analyze").json()["id"] == run_id
    execute(run_id)
    result = client.get(f"/api/opportunities/{oid}").json()
    assert result["run"]["state"] == "REVIEW_REQUIRED", result["run"]
    assert len(result["artifacts"]) == 11
    return result


def review(client, detail):
    return client.post(
        f"/api/runs/{detail['run']['id']}/review",
        json={
            "versions": {a["id"]: a["version"] for a in detail["artifacts"]},
            "note": "Explicit reviewer confirmation of all current source-linked artifacts.",
        },
    )


def test_full_workflow_versions_review_and_erp_closed_loop(client):
    oid = create(client)
    document, text = attach(client, oid)
    assert document["sha256"] == hashlib.sha256(text.encode()).hexdigest()
    assert client.get(f"/api/documents/{document['id']}/download").content == text.encode()
    assert attach(client, oid)[0]["id"] == document["id"]  # content dedupe
    detail = analyze(client, oid)
    aid = next(a for a in detail["artifacts"] if a["kind"] == "solution")
    assert review(client, detail).status_code == 200
    aid["content"]["summary"] = "Human reviewed solution narrative. No price or timeline commitment."
    saved = client.patch(f"/api/artifacts/{aid['id']}", json={"version": 1, "content": aid["content"]})
    assert saved.status_code == 200, saved.text
    assert saved.json()["version"] == 2
    conflict = client.patch(f"/api/artifacts/{aid['id']}", json={"version": 1, "content": aid["content"]})
    assert conflict.status_code == 409
    assert review(client, detail).status_code == 409  # stale pack version
    detail = client.get(f"/api/opportunities/{oid}").json()
    proposal = next(a for a in detail["artifacts"] if a["kind"] == "proposal")
    assert proposal["review_state"] == "DRAFT"
    assert (
        client.post(
            f"/api/runs/{detail['run']['id']}/decision",
            json={"outcome": "READY_FOR_SALES", "note": "Reviewed for discussion"},
        ).status_code
        == 409
    )
    assert review(client, detail).status_code == 200
    result = client.post(
        f"/api/runs/{detail['run']['id']}/decision",
        json={"outcome": "READY_FOR_SALES", "note": "Ready for a Sales discussion; commercials remain unquoted."},
    )
    assert result.status_code == 202, result.text
    execute(detail["run"]["id"])
    # A fresh client simulates browser refresh and uses persisted state only.
    with TestClient(app) as fresh:
        persisted = fresh.get(f"/api/opportunities/{oid}").json()
        assert persisted["opportunity"]["status"] == "READY_FOR_SALES"
        assert persisted["run"]["state"] == "READY_FOR_SALES"
        assert len(persisted["opportunity"]["artifact_references"]) == 11
        assert any(e["type"] == "ERP_ACKNOWLEDGED" for e in persisted["events"])
    with connect() as conn:
        assert one(conn, "SELECT count(*) AS n FROM artifact_versions WHERE artifact_id=%s", (aid["id"],))["n"] == 2
        assert (
            one(
                conn,
                "SELECT count(*) AS n FROM demo_erp.actions WHERE idempotency_key=%s",
                (detail["run"]["id"] + ":outcome",),
            )["n"]
            == 1
        )
    # An approved artifact cannot be mutated outside review.
    assert (
        client.patch(f"/api/artifacts/{aid['id']}", json={"version": 2, "content": aid["content"]}).status_code == 409
    )


def test_clarification_gate_and_new_evidence_cycle(client):
    oid = create(client)
    attach(client, oid, complete=False)
    detail = analyze(client, oid)
    run_id = detail["run"]["id"]
    assert review(client, detail).status_code == 200
    blocked = client.post(
        f"/api/runs/{run_id}/decision", json={"outcome": "READY_FOR_SALES", "note": "Try to advance despite gaps"}
    )
    assert blocked.status_code == 409
    result = client.post(
        f"/api/runs/{run_id}/decision",
        json={"outcome": "CLARIFICATION_REQUIRED", "note": "Sales to confirm acceptance, interfaces and timing."},
    )
    assert result.status_code == 202
    execute(run_id)
    assert DemoERP().get("opportunity", oid)["status"] == "CLARIFICATION_REQUIRED"
    attach(client, oid, complete=True)
    current = analyze(client, oid)
    assert current["run"]["id"] != run_id
    assert len(client.get(f"/api/opportunities/{oid}").json()["documents"]) == 2
    assert all(a["version"] == 1 for a in current["artifacts"])


def test_resolved_clarifications_require_answer_and_allow_approval(client):
    oid = create(client)
    attach(client, oid, complete=False)
    detail = analyze(client, oid)
    artifact = next(a for a in detail["artifacts"] if a["kind"] == "clarifications")
    for row in artifact["content"]["rows"]:
        row["state"] = "Resolved"
    path = f"/api/artifacts/{artifact['id']}"
    assert client.patch(path, json={"version": 1, "content": artifact["content"]}).status_code == 409
    for row in artifact["content"]["rows"]:
        row["answer"] = "Sales confirmed this detail in the recorded discovery review."
    assert client.patch(path, json={"version": 1, "content": artifact["content"]}).status_code == 200
    detail = client.get(f"/api/opportunities/{oid}").json()
    assert review(client, detail).status_code == 200
    assert (
        client.post(
            f"/api/runs/{detail['run']['id']}/decision",
            json={"outcome": "READY_FOR_SALES", "note": "Source gaps have been answered."},
        ).status_code
        == 202
    )
    execute(detail["run"]["id"])
    assert DemoERP().get("opportunity", oid)["status"] == "READY_FOR_SALES"


def test_no_documents_and_file_validation(client):
    oid = create(client)
    assert client.post(f"/api/opportunities/{oid}/analyze").status_code == 409
    assert (
        client.post(
            f"/api/opportunities/{oid}/upload", files={"file": ("run.exe", b"bad", "application/octet-stream")}
        ).status_code
        == 409
    )
    assert (
        client.post(f"/api/opportunities/{oid}/upload", files={"file": ("empty.txt", b"", "text/plain")}).status_code
        == 409
    )
    assert (
        client.post(
            f"/api/opportunities/{oid}/upload",
            files={"file": ("large.txt", b"x" * (settings().max_upload_bytes + 1), "text/plain")},
        ).status_code
        == 413
    )
    assert (
        client.post(
            f"/api/opportunities/{oid}/documents",
            json={
                "name": "source.md",
                "text": "A source with at least twenty characters",
                "source_url": "javascript:alert(1)",
            },
        ).status_code
        == 422
    )


def test_source_facts_cannot_be_changed(client):
    oid = create(client)
    attach(client, oid)
    detail = analyze(client, oid)
    brief = next(a for a in detail["artifacts"] if a["kind"] == "brief")
    brief["content"]["rows"][0]["value"] = "Fabricated customer"
    assert (
        client.patch(f"/api/artifacts/{brief['id']}", json={"version": 1, "content": brief["content"]}).status_code
        == 409
    )
    requirement = next(a for a in detail["artifacts"] if a["kind"] == "requirements")
    requirement["content"]["rows"][0]["evidence"] = "Fake source"
    assert (
        client.patch(
            f"/api/artifacts/{requirement['id']}", json={"version": 1, "content": requirement["content"]}
        ).status_code
        == 409
    )


def test_model_failure_retry_resumes_checkpoint(client, monkeypatch):
    from cdi.gateway import ModelGateway

    oid = create(client)
    attach(client, oid)
    original = ModelGateway.narrative

    def fail(*args):
        raise RuntimeError("Model gateway temporarily unavailable")

    monkeypatch.setattr(ModelGateway, "narrative", fail)
    run_id = client.post(f"/api/opportunities/{oid}/analyze").json()["id"]
    execute(run_id)
    detail = client.get(f"/api/opportunities/{oid}").json()
    assert detail["run"]["state"] == "FAILED"
    assert detail["documents"][0]["state"] == "INGESTED"
    monkeypatch.setattr(ModelGateway, "narrative", original)
    assert client.post(f"/api/runs/{run_id}/retry").status_code == 202
    execute(run_id)
    detail = client.get(f"/api/opportunities/{oid}").json()
    assert detail["run"]["state"] == "REVIEW_REQUIRED"
    assert len(detail["artifacts"]) == 11


def test_erp_failure_is_not_reported_as_success(client, monkeypatch):
    oid = create(client)
    attach(client, oid)
    detail = analyze(client, oid)
    assert review(client, detail).status_code == 200
    run_id = detail["run"]["id"]
    client.post(
        f"/api/runs/{run_id}/decision", json={"outcome": "READY_FOR_SALES", "note": "Approved for Sales discussion"}
    )
    original = DemoERP.action

    def fail(*args):
        raise RuntimeError("ERP temporarily unavailable")

    monkeypatch.setattr(DemoERP, "action", fail)
    execute(run_id)
    assert client.get(f"/api/opportunities/{oid}").json()["run"]["state"] == "FAILED"
    assert DemoERP().get("opportunity", oid)["status"] == "NEW"
    monkeypatch.setattr(DemoERP, "action", original)
    assert client.post(f"/api/runs/{run_id}/retry").status_code == 202
    execute(run_id)
    assert DemoERP().get("opportunity", oid)["status"] == "READY_FOR_SALES"


def test_hybrid_retrieval_is_scoped(client):
    oid = create(client)
    attach(client, oid)
    detail = analyze(client, oid)
    matches = retrieve(oid, "Python ERP integration")
    assert matches
    assert all(m["document_id"] in {d["id"] for d in detail["documents"]} for m in matches)
    other = create(client)
    assert retrieve(other, "Python ERP integration") == []


def test_intake_validation_approval_and_replay(tmp_path):
    file = tmp_path / "customers.csv"
    file.write_text("id,name\nC-TEST,Test customer\nC-TEST,Duplicate customer\n")
    rejected = ingest_source(FileSource(file), "customer", approved=True)
    assert rejected["state"] == "REJECTED" and rejected["rejected"] == 1
    file.write_text("id,name\nC-TEST,Test customer\n")
    assert ingest_source(FileSource(file), "customer")["state"] == "VALIDATED"
    assert ingest_source(FileSource(file), "customer", approved=True)["state"] == "LOADED"
    assert ingest_source(FileSource(file), "customer", approved=True)["state"] == "LOADED"
    assert DemoERP().get("customer", "C-TEST")["name"] == "Test customer"


def test_http_erp_adapter_contract(monkeypatch):
    calls = []

    def request(self, method, path, payload=None, key=None):
        calls.append((method, path, payload, key))
        return {"items": []} if path.startswith("read/") else {"acknowledged": True}

    monkeypatch.setattr(HttpERP, "request", request)
    adapter = HttpERP()
    assert adapter.list("capability") == []
    adapter.action("opportunity.outcome", "OPP-1", {"status": "READY_FOR_SALES"}, "key-1")
    assert calls[-1][1] == "actions" and calls[-1][-1] == "key-1"


def test_workspace_access_token(client, monkeypatch):
    monkeypatch.setattr(settings(), "api_access_token", "test-token-value")
    assert client.get("/api/opportunities").status_code == 401
    assert client.get("/api/opportunities", headers={"Authorization": "Bearer test-token-value"}).status_code == 200
    assert client.get("/health").status_code == 200


def test_queue_claim_and_persistence(client):
    oid = create(client)
    attach(client, oid)
    run_id = client.post(f"/api/opportunities/{oid}/analyze").json()["id"]
    assert tick()
    with connect() as conn:
        run = one(conn, "SELECT * FROM runs WHERE id=%s", (run_id,))
        assert run["state"] == "REVIEW_REQUIRED"
        assert run["attempt"] == 1
        assert run["lease_until"] is None


def test_negative_erp_acknowledgement_is_retryable(client, monkeypatch):
    oid = create(client)
    attach(client, oid)
    detail = analyze(client, oid)
    assert review(client, detail).status_code == 200
    run_id = detail["run"]["id"]
    client.post(
        f"/api/runs/{run_id}/decision", json={"outcome": "READY_FOR_SALES", "note": "Reviewer approved for discussion"}
    )
    monkeypatch.setattr(DemoERP, "action", lambda *args: {"acknowledged": False})
    execute(run_id)
    assert client.get(f"/api/opportunities/{oid}").json()["run"]["state"] == "FAILED"
    assert DemoERP().get("opportunity", oid)["status"] == "NEW"


def test_docling_docx_upload_and_extraction(client):
    pytest.importorskip("docling")
    import io
    import zipfile

    from cdi.documents import parse_document

    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )
        archive.writestr(
            "word/document.xml",
            '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Customer requires an evidence-backed ERP service workspace.</w:t></w:r></w:p></w:body></w:document>',
        )
    oid = create(client)
    response = client.post(
        f"/api/opportunities/{oid}/upload",
        files={
            "file": (
                "tor.docx",
                data.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 201
    text, parser = parse_document(response.json())
    assert "evidence-backed ERP service workspace" in text
    assert parser == "docling-v2"
