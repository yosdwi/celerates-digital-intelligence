"""Operating Substrate M1: ERP delegation verification, delegated principal scope, persisted AG-UI runs,
resume, isolation between users, and read-only playbooks against a fake delegated ERP."""

import base64
import json
import time
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient

from cdi import delegation
from cdi.agent import playbooks, runs
from cdi.agent.erp_client import DelegatedERP, ERPAgentError
from cdi.agent.tools import REGISTRY, allowed_tools
from cdi.api import app
from cdi.config import settings
from cdi.db import connect, one
from cdi.migrate import migrate

KEY = Ed25519PrivateKey.generate()
OTHER = Ed25519PrivateKey.generate()
USER = "5b0f2c7e-1d2a-4f3b-9c8d-7e6f5a4b3c2d"
SECOND = "6c1a3d8f-2e3b-4a4c-8d9e-8f7a6b5c4d3e"
TRACKER = "7d2b4e9a-3f4c-4b5d-9e0f-9a8b7c6d5e4f"


def b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def mint(key=KEY, kid="k1", **overrides):
    now = int(time.time())
    claims = {
        "iss": "celerates-erp:" + settings().erp_environment,
        "aud": "celerates-intelligence",
        "sub": USER,
        "name": "Synthetic Owner",
        "owner": True,
        "access": [],
        "scope": ["agent"],
        "ctx": {"path": "/sales", "module": "sales"},
        "iat": now,
        "exp": now + 300,
        "jti": str(uuid4()),
    }
    claims.update(overrides)
    header = b64(json.dumps({"alg": "EdDSA", "typ": "JWT", "kid": kid}).encode())
    body = b64(json.dumps(claims).encode())
    return f"{header}.{body}.{b64(key.sign(f'{header}.{body}'.encode()))}"


@pytest.fixture(scope="module", autouse=True)
def schema():
    migrate()


@pytest.fixture(autouse=True)
def keys(monkeypatch):
    pem = KEY.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()
    monkeypatch.setattr(settings(), "erp_delegation_public_keys", json.dumps({"k1": pem}))


def test_delegation_verification_rejects_forgery_and_misuse():
    assert delegation.verify(mint())["sub"] == USER
    bad = [
        mint(key=OTHER),
        mint(kid="unknown"),
        mint(aud="someone-else"),
        mint(iss="celerates-erp:other-environment"),
        mint(exp=int(time.time()) - 120, iat=int(time.time()) - 400),
        mint(exp=int(time.time()) + 3600),
        mint(scope=["workspace"]),
        mint(sub="not-a-uuid"),
    ]
    header, body, sig = mint().split(".")
    claims = json.loads(base64.urlsafe_b64decode(body + "=="))
    claims["owner"] = True
    claims["sub"] = SECOND
    bad.append(f"{header}.{b64(json.dumps(claims).encode())}.{sig}")
    bad.append(f"{b64(json.dumps({'alg': 'none', 'typ': 'JWT', 'kid': 'k1'}).encode())}.{body}.")
    for token in bad:
        with pytest.raises(delegation.DelegationError):
            delegation.verify(token)


def test_delegated_principal_is_scoped_and_cannot_use_workspace_routes(monkeypatch):
    owner = delegation.DelegatedPrincipal(delegation.verify(mint()), "t")
    assert "sales" in owner.divisions and owner.restricted and owner.roles == {"agent"}
    viewer = delegation.DelegatedPrincipal(
        delegation.verify(mint(owner=False, access=[{"division": "ta", "level": "viewer"}, {"division": "hr"}])), "t"
    )
    assert viewer.divisions == {"ta"} and not viewer.restricted
    with pytest.raises(Exception):
        viewer.require("curator")
    monkeypatch.setattr(settings(), "api_access_token", "w" * 40)
    with TestClient(app) as c:
        # A delegation is not a workspace credential, in either header.
        assert c.get("/api/knowledge", headers={"Authorization": "Bearer " + mint()}).status_code == 401
        assert c.get("/api/knowledge", headers={"X-ERP-Delegation": mint()}).status_code == 401
        assert c.post("/api/agent/runs", json={"skill": "search", "args": {"query": "abc"}}).status_code == 401


def test_all_registered_tools_are_read_only():
    assert REGISTRY and all(t.risk == "read" for t in REGISTRY.values())
    owner = delegation.DelegatedPrincipal(delegation.verify(mint()), "t")
    assert {t.name for t in allowed_tools(owner)} == set(REGISTRY)
    assert not [n for n in dir(DelegatedERP) if n.startswith(("post", "put", "patch", "delete", "create", "apply"))]


class FakeERP:
    calls = []

    def __init__(self, principal):
        self.principal = principal

    def signal(self, key, path):
        FakeERP.calls.append(("signal", key, self.principal.sub))
        if key == "finance-review":
            raise ERPAgentError(403, "FORBIDDEN")
        return {
            "signal": {
                "key": key,
                "module": "sales",
                "title": "Opportunity belum diteruskan",
                "rule": "Sales Qualified, tidak Dropped, belum memiliki Requisition maupun PQ yang terhubung.",
                "source": "Opportunity Tracker → Requisition / PQ",
                "unit": "opportunity tracker",
                "count": 1,
                "href": "/sales/opportunity-tracker",
                "action": "Tinjau Opportunity",
                "entity_type": "sales_opportunity",
                "items": [{"id": TRACKER, "label": "OPTY-1", "href": f"/sales/opportunity-tracker/{TRACKER}/edit"}],
                "as_of": "2026-09-26T00:00:00Z",
            }
        }

    def entity(self, entity_type, entity_id):
        FakeERP.calls.append(("entity", entity_id))
        return {
            "entity": {
                "type": entity_type,
                "type_label": "Opportunity",
                "id": entity_id,
                "label": "OPTY-1 · Synthetic",
                "href": f"/sales/opportunity-tracker/{entity_id}/edit",
                "record_version": 3,
                "as_of": "2026-09-26T00:00:00Z",
                "fields": [{"name": "sales_qualified", "label": "Sales Qualified", "value": "Ya"}],
                "commercial": [{"name": "price_amount", "label": "Harga", "state": "terisi"}],
                "withheld": [],
            }
        }

    def neighbours(self, entity_type, entity_id):
        return {
            "edges": [
                {"name": "requisitions", "label": "Requisition", "kind": "fk", "count": 0, "items": []},
                {"name": "client", "label": "Akun CRM", "kind": "name_match", "count": 1, "items": [{"label": "X"}]},
            ]
        }

    def entity_signals(self, entity_type, entity_id):
        return {"signals": []}

    def search(self, query):
        return {"query": query, "results": [], "truncated": False}


def events(client, run_id, token, last=None):
    headers = {"X-ERP-Delegation": token}
    if last is not None:
        headers["Last-Event-ID"] = str(last)
    with client.stream("GET", f"/api/agent/runs/{run_id}/events", headers=headers) as response:
        assert response.status_code == 200
        assert response.headers["x-accel-buffering"] == "no"
        body = "".join(response.iter_text())
    parsed = []
    for block in body.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines() if not line.startswith(":"))
        if "data" in lines:
            parsed.append((int(lines["id"]), json.loads(lines["data"])))
    return parsed


def test_run_persists_ag_ui_events_resumes_and_is_isolated(monkeypatch):
    monkeypatch.setattr(settings(), "erp_mode", "http")
    monkeypatch.setattr(settings(), "erp_base_url", "http://erp.invalid/api/integration/v1")
    monkeypatch.setattr(settings(), "erp_token", "x" * 40)
    monkeypatch.setattr(settings(), "erp_action_token", "y" * 40)
    monkeypatch.setattr(settings(), "api_access_token", "w" * 40)
    monkeypatch.setattr(playbooks, "DelegatedERP", FakeERP)
    monkeypatch.setattr(playbooks, "start", lambda run, user, args: playbooks.execute(run, user, args))
    token = mint(ctx={"path": "/sales", "module": "sales"})
    run_id = str(uuid4())
    body = {"run_id": run_id, "skill": "explain_signal", "args": {"signal_key": "qualified-trackers"}}
    with TestClient(app) as c:
        assert (
            c.post(
                "/api/agent/runs", json={**body, "modality": "voice"}, headers={"X-ERP-Delegation": token}
            ).status_code
            == 422
        )
        assert (
            c.post(
                "/api/agent/runs",
                json={"skill": "explain_signal", "args": {"signal_key": "x", "sql": "drop"}},
                headers={"X-ERP-Delegation": token},
            ).status_code
            == 422
        )
        created = c.post("/api/agent/runs", json=body, headers={"X-ERP-Delegation": token})
        assert created.status_code == 201 and created.json()["created"] is True
        again = c.post("/api/agent/runs", json=body, headers={"X-ERP-Delegation": mint()})
        assert again.json()["created"] is False, "same user re-attaches, no second execution"
        stranger = mint(sub=SECOND)
        assert c.post("/api/agent/runs", json=body, headers={"X-ERP-Delegation": stranger}).status_code == 409
        assert c.get(f"/api/agent/runs/{run_id}", headers={"X-ERP-Delegation": stranger}).status_code == 404
        stream = events(c, run_id, token)
        types = [e["type"] for _, e in stream]
        assert types[0] == "RUN_STARTED" and types[-1] == "RUN_FINISHED"
        assert {"STEP_STARTED", "TOOL_CALL_START", "TOOL_CALL_RESULT", "CUSTOM", "TEXT_MESSAGE_CONTENT"} <= set(types)
        assert [s for s, _ in stream] == list(range(1, len(stream) + 1))
        tools = [e["toolCallName"] for _, e in stream if e["type"] == "TOOL_CALL_START"]
        assert tools == ["erp_signal_detail", "erp_read_entity", "erp_entity_neighbours", "knowledge_search"]
        evidence = [i for _, e in stream if e["type"] == "CUSTOM" for i in e["value"]["items"]]
        assert {i["type"] for i in evidence} >= {"signal", "erp_fact"}
        assert any("cocok nama" in d for i in evidence for d in i["detail"])
        assert any("Harga: terisi" in d for i in evidence for d in i["detail"]), "commercial presence only"
        text = next(e["delta"] for _, e in stream if e["type"] == "TEXT_MESSAGE_CONTENT")
        assert "1 opportunity tracker" in text and "Requisition: 0" in text
        resumed = events(c, run_id, token, last=stream[3][0])
        assert [s for s, _ in resumed] == [s for s, _ in stream[4:]]
        status = c.get(f"/api/agent/runs/{run_id}", headers={"X-ERP-Delegation": token}).json()
        assert status["state"] == "succeeded" and status["result"]["examined"] == [TRACKER]

        denied = str(uuid4())
        c.post(
            "/api/agent/runs",
            json={"run_id": denied, "skill": "explain_signal", "args": {"signal_key": "finance-review"}},
            headers={"X-ERP-Delegation": token},
        )
        last = events(c, denied, token)[-1][1]
        assert last["type"] == "RUN_ERROR" and last["code"] == "ERP_403"
    with connect() as conn:
        run = one(conn, "SELECT * FROM agent_runs WHERE id=%s", (run_id,))
        assert run["principal_sub"] == USER and run["context"]["path"] == "/sales" and run["modality"] == "text"
        assert "token" not in json.dumps(run["input"])


def test_stale_running_run_is_closed_once(monkeypatch):
    principal = delegation.DelegatedPrincipal(delegation.verify(mint()), "t")
    run, _ = runs.create(str(uuid4()), "thread-stale-test", principal, "search", {"query": "x"}, "v")
    with connect() as conn:
        conn.execute("UPDATE agent_runs SET created_at=now()-interval '10 minutes' WHERE id=%s", (run["id"],))
    assert runs.mark_stale(run["id"]) is True
    assert runs.mark_stale(run["id"]) is False
    rows = runs.events_after(run["id"], 0)
    assert [r["type"] for r in rows] == ["RUN_ERROR"]


def test_agent_knowledge_search_is_scoped_and_not_padded_with_unrelated_sources():
    from cdi import knowledge
    from cdi.foundation_api import Source
    from cdi.identity import Principal

    marker = uuid4().hex[:8]
    curator = Principal("curator-test", ["reviewer", "curator"], ["sales", "hr"], True)
    docs = []

    def approved(key, scope_type, scope_id, text, classification="internal"):
        source = knowledge.register_source(
            Source(
                source_key=f"{key}-{marker}",
                title=f"{key} {marker}",
                scope_type=scope_type,
                scope_id=scope_id,
                classification=classification,
                source_kind="policy",
            ),
            curator,
        )
        doc = knowledge.register_version(source["id"], 1, "k.md", text.encode(), "text/markdown", curator)
        while knowledge.tick():
            pass
        knowledge.transition(doc["id"], "approve", curator)
        docs.append(doc["id"])
        return source["id"]

    try:
        sop = approved("ta-sop", "company", "company", f"Setiap requisition wajib memiliki TA PIC {marker}.")
        unrelated = approved("delivery", "company", "company", "Name an acceptance owner before integration handover.")
        hr_only = approved("hr-policy", "division", "hr", f"Kebijakan requisition internal HR {marker}.")
        secret = approved("secret", "company", "company", f"Rahasia requisition {marker}.", "restricted")
        owner = delegation.DelegatedPrincipal(delegation.verify(mint()), "t")
        sales = delegation.DelegatedPrincipal(
            delegation.verify(mint(owner=False, access=[{"division": "sales", "level": "viewer"}])), "t"
        )
        query = f"Requisition belum memiliki TA PIC {marker}"
        found = {r["source_id"] for r in knowledge.search_for_principal(query, owner, limit=20)}
        assert {sop, hr_only, secret} <= found and unrelated not in found
        scoped = {r["source_id"] for r in knowledge.search_for_principal(query, sales, limit=20)}
        assert sop in scoped and hr_only not in scoped and secret not in scoped
    finally:
        # Leave no approved company knowledge behind for other tests' context builds.
        for doc in docs:
            knowledge.transition(doc, "deprecate", curator)
