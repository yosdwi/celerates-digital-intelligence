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
from cdi.agent.tools import REGISTRY, allowed_tools, register
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


def test_tools_can_read_or_propose_but_never_write():
    assert REGISTRY and {t.risk for t in REGISTRY.values()} == {"read", "propose"}
    assert [t.name for t in REGISTRY.values() if t.risk == "propose"] == ["erp_propose"]
    owner = delegation.DelegatedPrincipal(delegation.verify(mint()), "t")
    assert {t.name for t in allowed_tools(owner)} == set(REGISTRY)
    with pytest.raises(ValueError):
        register("erp_write", "1", "x", risk="write")(lambda ctx: None)
    # The client's only non-read call creates an ERP-held pending proposal; ERP applies nothing without the user.
    public = [n for n in dir(DelegatedERP) if not n.startswith("_")]
    assert not [n for n in public if n.startswith(("post", "put", "patch", "delete", "create", "apply", "confirm"))]
    assert "propose" in public


class FakeERP:
    calls = []

    def __init__(self, principal):
        self.principal = principal

    def signal(self, key, path, items=5):
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


COMMANDS = [
    {
        "kind": "task.create",
        "label": "Buat task tindak lanjut",
        "target": None,
        "params": [
            {"name": "title", "label": "Judul", "kind": "text", "required": True, "aliases": ["judul", "tugas"]},
            {"name": "due_date", "label": "Jatuh tempo", "kind": "date", "required": False, "aliases": ["deadline"]},
        ],
    },
    {
        "kind": "requisition.assign_ta_pic",
        "label": "Tetapkan TA PIC",
        "target": "requisition",
        "params": [{"name": "ta_pic_name", "label": "TA PIC", "kind": "choice", "required": True, "aliases": []}],
    },
    {
        "kind": "requisition.create",
        "label": "Buat Requisition",
        "target": None,
        "params": [
            {"name": "client_name", "label": "Client", "kind": "text", "required": True, "aliases": ["klien"]},
            {"name": "position_name", "label": "Posisi", "kind": "text", "required": True, "aliases": ["jabatan"]},
            {"name": "headcount_target", "label": "Headcount", "kind": "int", "required": False, "aliases": ["jumlah"]},
            {
                "name": "level_code",
                "label": "Level",
                "kind": "enum",
                "required": False,
                "aliases": [],
                "enum": [{"code": "junior", "label": "Junior"}, {"code": "senior", "label": "Senior"}],
            },
            {"name": "opty_request_date", "label": "Tanggal request", "kind": "date", "required": False, "aliases": []},
        ],
    },
]
REQUISITIONS = ["8e3c5f0b-4a5d-4c6e-8f1a-0b9c8d7e6f5a", "9f4d6a1c-5b6e-4d7f-9a2b-1c0d9e8f7a6b"]


class ProposingERP(FakeERP):
    proposed = []

    def signal(self, key, path, items=5):
        base = super().signal(key, path, items)["signal"]
        if key == "unassigned-requisitions":
            base.update(
                key=key,
                title="Requisition tanpa TA PIC",
                count=2,
                entity_type="requisition",
                remedy="requisition.assign_ta_pic",
                items=[{"id": r, "label": f"REQ-{i}", "href": "/ta"} for i, r in enumerate(REQUISITIONS)],
            )
        if key == "missing-invoices":
            base.update(key=key, entity_type=None, remedy="task.create", count=4, items=[])
        return {"signal": base}

    def catalog(self):
        return {"commands": COMMANDS}

    def propose(self, key, title, items, run_id, context_path):
        ProposingERP.proposed.append({"key": key, "title": title, "items": items, "run_id": run_id})
        counts = {"ok": len(items), "warning": 0, "needs_input": 0, "invalid": 0}
        if items and items[0]["kind"] == "requisition.assign_ta_pic":
            counts = {"ok": 0, "warning": 0, "needs_input": len(items), "invalid": 0}
        return {
            "id": str(uuid4()),
            "state": "pending",
            "title": title,
            "counts": counts,
            "items": [{}] * len(items),
            "expires_at": "2026-09-26T02:00:00Z",
        }


def run_skill(monkeypatch, client, token, skill, args):
    monkeypatch.setattr(settings(), "erp_mode", "http")
    monkeypatch.setattr(playbooks, "DelegatedERP", ProposingERP)
    monkeypatch.setattr(playbooks, "start", lambda run, user, a: playbooks.execute(run, user, a))
    run_id = str(uuid4())
    created = client.post(
        "/api/agent/runs", json={"run_id": run_id, "skill": skill, "args": args}, headers={"X-ERP-Delegation": token}
    )
    assert created.status_code == 201, created.text
    return run_id, events(client, run_id, token)


def test_follow_up_signal_proposes_the_erp_declared_remedy_without_applying(monkeypatch):
    ProposingERP.proposed.clear()
    token = mint(ctx={"path": "/ta", "module": "ta"})
    with TestClient(app) as c:
        run_id, stream = run_skill(monkeypatch, c, token, "follow_up_signal", {"signal_key": "unassigned-requisitions"})
        assert stream[-1][1]["type"] == "RUN_FINISHED"
        proposal = ProposingERP.proposed[-1]
        assert proposal["key"] == f"run:{run_id}" and proposal["run_id"] == run_id
        assert [i["kind"] for i in proposal["items"]] == ["requisition.assign_ta_pic"] * 2
        assert [i["target"]["id"] for i in proposal["items"]] == REQUISITIONS
        assert all(i["params"] == {} for i in proposal["items"]), "the PIC is the user's choice, not a guess"
        cards = [e["value"] for _, e in stream if e["type"] == "CUSTOM" and e["name"] == "celerates.proposal"]
        assert len(cards) == 1 and cards[0]["id"]
        text = "".join(e["delta"] for _, e in stream if e["type"] == "TEXT_MESSAGE_CONTENT")
        assert "Belum ada data yang berubah" in text and "2 perlu Anda lengkapi" in text

        _, stream = run_skill(monkeypatch, c, token, "follow_up_signal", {"signal_key": "missing-invoices"})
        items = ProposingERP.proposed[-1]["items"]
        assert len(items) == 1 and items[0]["kind"] == "task.create" and items[0]["target"] is None
        assert items[0]["params"]["due_date"] > "2026-01-01"


CSV = (
    "Kebutuhan kandidat Q4\n"
    "Klien;Jabatan;Jumlah;Level;Tanggal Request;Catatan\n"
    "PT Sintetis;Backend Engineer;2;Senior;03/10/2026;urgent\n"
    "PT Sintetis;QA Engineer;1;junior;4 Okt 2026;\n"
    "\n"
)


def test_dataset_import_maps_columns_from_erp_specs_and_learns_only_from_applied_outcomes(monkeypatch):
    ProposingERP.proposed.clear()
    with connect() as conn:
        conn.execute("DELETE FROM agent_mapping_templates")  # test database: start without learned mappings
    token = mint(ctx={"path": "/ta", "module": "ta"})
    with TestClient(app) as c:
        files = {"file": ("kebutuhan.csv", CSV.encode(), "text/csv")}
        uploaded = c.post("/api/agent/datasets", files=files, headers={"X-ERP-Delegation": token})
        assert uploaded.status_code == 201, uploaded.text
        profile = uploaded.json()["profile"]
        assert profile["rows"] == 2 and profile["header_row"] == 2
        dataset_id = uploaded.json()["id"]
        bad = c.post(
            "/api/agent/datasets",
            files={"file": ("x.exe", b"MZ", "application/octet-stream")},
            headers={"X-ERP-Delegation": token},
        )
        assert bad.status_code == 422

        run_id, stream = run_skill(monkeypatch, c, token, "import_dataset", {"dataset_id": dataset_id})
        assert stream[-1][1]["type"] == "RUN_FINISHED", stream[-1]
        items = ProposingERP.proposed[-1]["items"]
        assert {i["kind"] for i in items} == {"requisition.create"}
        assert items[0]["params"] == {
            "client_name": "PT Sintetis",
            "position_name": "Backend Engineer",
            "headcount_target": "2",
            "level_code": "Senior",
            "opty_request_date": "2026-10-03",
        }
        assert items[1]["params"]["opty_request_date"] == "2026-10-04"
        evidence = [
            i
            for _, e in stream
            if e["type"] == "CUSTOM" and e["name"] == "celerates.evidence"
            for i in e["value"]["items"]
        ]
        assert [i["type"] for i in evidence] == ["document", "inference"], "a fresh mapping is an inference"
        assert "Tidak dipakai: Catatan" in evidence[1]["detail"]

        # Another user can neither use the dataset nor report outcomes for this run.
        stranger = mint(sub=SECOND)
        _, other = run_skill(monkeypatch, c, stranger, "import_dataset", {"dataset_id": dataset_id})
        assert other[-1][1]["type"] == "RUN_ERROR" and other[-1][1]["code"] == "POLICY"
        outcome = {"proposal_id": str(uuid4()), "state": "applied", "counts": {"ok": 2}, "receipts": {"applied": 2}}
        assert (
            c.post(
                f"/api/agent/runs/{run_id}/outcomes", json=outcome, headers={"X-ERP-Delegation": stranger}
            ).status_code
            == 404
        )

        # A rejected proposal teaches nothing; an applied one teaches the mapping for this header set.
        rejected = {**outcome, "state": "rejected"}
        r = c.post(f"/api/agent/runs/{run_id}/outcomes", json=rejected, headers={"X-ERP-Delegation": token})
        assert r.json() == {"recorded": True, "learned": False}
        r = c.post(f"/api/agent/runs/{run_id}/outcomes", json=outcome, headers={"X-ERP-Delegation": token})
        assert r.json() == {"recorded": True, "learned": True}
        again = c.post("/api/agent/datasets", files=files, headers={"X-ERP-Delegation": token}).json()
        _, stream = run_skill(monkeypatch, c, token, "import_dataset", {"dataset_id": again["id"]})
        evidence = [
            i
            for _, e in stream
            if e["type"] == "CUSTOM" and e["name"] == "celerates.evidence"
            for i in e["value"]["items"]
        ]
        assert evidence[1]["type"] == "observation", "a mapping used in an applied import is an observation"
    with connect() as conn:
        row = one(conn, "SELECT state FROM agent_outcomes WHERE run_id=%s", (run_id,))
        assert row["state"] == "applied"


def test_dataset_import_without_required_columns_proposes_nothing(monkeypatch):
    ProposingERP.proposed.clear()
    token = mint()
    with TestClient(app) as c:
        files = {"file": ("catatan.csv", b"Nama Kandidat,Nilai\nA,90\nB,80\n", "text/csv")}
        dataset_id = c.post("/api/agent/datasets", files=files, headers={"X-ERP-Delegation": token}).json()["id"]
        _, stream = run_skill(monkeypatch, c, token, "import_dataset", {"dataset_id": dataset_id})
        assert stream[-1][1]["type"] == "RUN_FINISHED" and not ProposingERP.proposed
        text = "".join(e["delta"] for _, e in stream if e["type"] == "TEXT_MESSAGE_CONTENT")
        assert "kolom wajib belum ditemukan" in text
        card = next(e["value"] for _, e in stream if e["type"] == "CUSTOM" and e["name"] == "celerates.mapping")
        assert card["open"] is True and card["columns"] == ["Nama Kandidat", "Nilai"]
        assert {c["kind"] for c in card["commands"]} == {"task.create", "requisition.create"}, (
            "targeted commands excluded"
        )

        # The user corrects the mapping in the card: a new run, validated against ERP specs and the file's headers.
        fixed = {"dataset_id": dataset_id, "command": "task.create", "mapping": {"title": "Nama Kandidat"}}
        _, stream = run_skill(monkeypatch, c, token, "import_dataset", fixed)
        assert stream[-1][1]["result"]["mapping"] == {"title": "Nama Kandidat"}
        assert ProposingERP.proposed[-1]["items"][0] == {"kind": "task.create", "params": {"title": "A"}}
        evidence = [
            i
            for _, e in stream
            if e["type"] == "CUSTOM" and e["name"] == "celerates.evidence"
            for i in e["value"]["items"]
        ]
        assert evidence[1]["type"] == "observation" and "dipilih Anda" in evidence[1]["title"]
        for bad in (
            {"dataset_id": dataset_id, "command": "task.create", "mapping": {"title": "Kolom Palsu"}},
            {
                "dataset_id": dataset_id,
                "command": "requisition.assign_ta_pic",
                "mapping": {"ta_pic_name": "Nama Kandidat"},
            },
            {"dataset_id": dataset_id, "command": "task.create", "mapping": {"title": "Nilai", "due_date": "Nilai"}},
        ):
            _, stream = run_skill(monkeypatch, c, token, "import_dataset", bad)
            assert stream[-1][1]["type"] == "RUN_ERROR" and stream[-1][1]["code"] == "POLICY"


SIGNALS = [
    {
        "key": "qualified-trackers",
        "module": "sales",
        "title": "Opportunity belum diteruskan",
        "rule": "Sales Qualified, tidak Dropped, belum memiliki Requisition maupun PQ yang terhubung.",
        "unit": "opportunity tracker",
        "source": "Opportunity Tracker",
        "count": 0,
        "href": "/sales",
        "action": "Tinjau",
        "items": [],
    },
    {
        "key": "unassigned-requisitions",
        "module": "ta",
        "title": "Requisition belum memiliki TA PIC",
        "rule": "TA PIC kosong atau Belum ditentukan.",
        "unit": "requisition",
        "source": "Requisition",
        "count": 2,
        "href": "/ta",
        "action": "Tetapkan TA PIC",
        "items": [{"id": REQUISITIONS[0], "label": "REQ-7 · Engineer"}],
    },
]


class AskingERP(ProposingERP):
    searches = []

    def signals(self):
        return {"signals": SIGNALS}

    def search(self, query, mode="all"):
        AskingERP.searches.append((query, mode))
        query = query.lower()
        rows = [
            {"type": "requisition", "type_label": "Requisition", "id": REQUISITIONS[0], "label": "REQ-7 · Engineer"},
            {"type": "requisition", "type_label": "Requisition", "id": REQUISITIONS[1], "label": "REQ-8 · Analyst"},
        ]
        if "req-7" in query:
            rows = rows[:1]
        elif "astra" not in query or (mode == "all" and "zzz" in query):
            rows = []
        for r in rows:
            r.update(href="/ta", matched_field="Nomor", score=1)
        return {"query": query, "results": rows, "truncated": False, "as_of": "2026-09-26T00:00:00Z"}


def test_ask_routes_questions_to_rules_records_and_knowledge_without_a_model(monkeypatch):
    AskingERP.searches.clear()
    token = mint(ctx={"path": "/ta", "module": "ta"})
    with TestClient(app) as c:
        monkeypatch.setattr(settings(), "erp_mode", "http")
        monkeypatch.setattr(playbooks, "DelegatedERP", AskingERP)
        monkeypatch.setattr(playbooks, "start", lambda run, user, a: playbooks.execute(run, user, a))

        def ask(q):
            run_id = str(uuid4())
            c.post(
                "/api/agent/runs",
                json={"run_id": run_id, "skill": "ask", "args": {"query": q}},
                headers={"X-ERP-Delegation": token},
            )
            stream = events(c, run_id, token)
            assert stream[-1][1]["type"] == "RUN_FINISHED", stream[-1]
            text = "".join(e["delta"] for _, e in stream if e["type"] == "TEXT_MESSAGE_CONTENT")
            custom = [e for _, e in stream if e["type"] == "CUSTOM"]
            return stream[-1][1]["result"], text, custom

        result, text, custom = ask("Berapa requisition yang belum punya TA PIC?")
        assert result["signals"] == ["unassigned-requisitions"] and result["terms"] == [
            "requisition",
            "belum",
            "ta",
            "pic",
        ]
        assert "Requisition belum memiliki TA PIC: 2 requisition saat ini" in text
        actions = [e["value"]["items"] for e in custom if e["name"] == "celerates.actions"]
        assert actions == [
            [
                {
                    "label": "Tindak lanjuti: Requisition belum memiliki TA PIC",
                    "skill": "follow_up_signal",
                    "args": {"signal_key": "unassigned-requisitions"},
                }
            ]
        ]
        assert AskingERP.searches[-1] == ("requisition belum ta pic", "all"), "no loose fallback when a rule answered"

        result, text, _ = ask("status REQ-7")
        assert result["examined"] == f"requisition/{REQUISITIONS[0]}" and "Relasi:" in text

        result, text, _ = ask("astra zzz")
        assert result["partial"] is True and "cocok sebagian" in text and "• Requisition (2)" in text

        result, text, custom = ask("apa itu qwertyuiop")
        assert result["erp_results"] == 0 and "Belum ada aturan ERP, record, atau pengetahuan" in text
        assert not [e for e in custom if e["name"] == "celerates.actions"]


def test_dataset_retention_purges_rows_and_files(monkeypatch):
    from cdi.agent import datasets
    from cdi.storage import storage

    principal = delegation.DelegatedPrincipal(delegation.verify(mint()), "t")
    old = datasets.store(principal, "lama.csv", b"Client,Position\nA,B\n")
    fresh = datasets.store(principal, "baru.csv", b"Client,Position\nC,D\n")
    with connect() as conn:
        conn.execute("UPDATE agent_datasets SET created_at=now()-interval '31 days' WHERE id=%s", (old["id"],))
        key = one(conn, "SELECT object_key FROM agent_datasets WHERE id=%s", (old["id"],))["object_key"]
    assert storage().get(key)
    assert datasets.purge() >= 1
    assert datasets.load(principal, old["id"]) is None and datasets.load(principal, fresh["id"]) is not None
    with pytest.raises(FileNotFoundError):
        storage().get(key)


class ScriptedModel:
    """Stands in for `litellm` (sys.modules) so the real gateway code path runs without a provider."""

    def __init__(self, replies):
        self.replies, self.calls = list(replies), []

    def completion(self, model, messages, **kwargs):
        import types

        self.calls.append({"model": model, "messages": [dict(m) for m in messages], **kwargs})
        if not self.replies:
            raise RuntimeError("provider down")
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        message = types.SimpleNamespace(content=json.dumps(reply) if not isinstance(reply, str) else reply)
        return types.SimpleNamespace(
            choices=[types.SimpleNamespace(message=message)], usage=types.SimpleNamespace(total_tokens=42)
        )


def test_model_reasoning_is_bounded_grounded_and_falls_back(monkeypatch):
    token = mint(ctx={"path": "/ta", "module": "ta"})
    original = playbooks.DelegatedERP
    monkeypatch.setattr(playbooks, "DelegatedERP", AskingERP)
    with TestClient(app) as c:

        def run(query, replies):
            monkeypatch.setattr(settings(), "erp_mode", "http")
            monkeypatch.setattr(playbooks, "start", lambda r, u, a: playbooks.execute(r, u, a))
            import sys
            import types

            model = ScriptedModel(replies)
            monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=model.completion))
            monkeypatch.setattr(settings(), "generation_mode", "litellm")
            monkeypatch.setattr(settings(), "agent_model", "openai/scripted")
            run_id = str(uuid4())
            c.post(
                "/api/agent/runs",
                json={"run_id": run_id, "skill": "ask", "args": {"query": query}},
                headers={"X-ERP-Delegation": token},
            )
            stream = events(c, run_id, token)
            text = "".join(e["delta"] for _, e in stream if e["type"] == "TEXT_MESSAGE_CONTENT")
            custom = {}
            for _, e in stream:
                if e["type"] == "CUSTOM":
                    custom.setdefault(e["name"], []).append(e["value"])
            return stream[-1][1], text, custom, model

        # 1. Plan → read → grounded answer. The prompt carries rules and commands; evidence follows the reads.
        end, text, custom, model = run(
            "siapa yang memegang REQ-7 dan apa aturannya?",
            [
                {"calls": [{"tool": "erp_search", "args": {"query": "REQ-7"}}]},
                {
                    "answer": "REQ-7 · Engineer ada di ERP [E1]; 2 requisition belum punya TA PIC [S2].",
                    "cite": ["E1", "S2"],
                },
            ],
        )
        assert end["type"] == "RUN_FINISHED" and end["result"]["reasoning"] == "model", end
        assert text == "REQ-7 · Engineer ada di ERP [E1]; 2 requisition belum punya TA PIC [S2]."
        prov = custom["celerates.provenance"][0]
        assert prov["mode"] == "model" and prov["model"] == "openai/scripted" and prov["cited"] == ["E1", "S2"]
        assert prov["rounds"] == 2 and prov["tokens"] == 84
        cards = [i for v in custom["celerates.evidence"] for i in v["items"]]
        assert [c["type"] for c in cards] == ["erp_fact", "signal"], "facts from tools; cited rule card"
        assert custom["celerates.actions"][0]["items"][0]["args"] == {"signal_key": "unassigned-requisitions"}
        first = json.loads(model.calls[0]["messages"][1]["content"])
        assert "S2: rule unassigned-requisitions" in first["rules"] and first["commands"][0]["kind"] == "task.create"
        assert model.calls[0]["response_format"] == {"type": "json_object"} and model.calls[0]["temperature"] == 0
        assert "search hit: requisition id=" in model.calls[1]["messages"][-1]["content"]

        # 2. An ungrounded number is rejected, repaired once, then the run falls back to the deterministic router.
        end, text, custom, _ = run(
            "berapa requisition tanpa TA PIC?",
            [{"answer": "Ada 17 requisition [S2].", "cite": ["S2"]}, {"answer": "Ada 17 requisition.", "cite": []}],
        )
        assert end["result"]["reasoning"] == "fallback" and end["result"]["fallback_reason"] == "ReasoningFailed"
        assert "17" not in text and "2 requisition saat ini" in text and "disusun tanpa model" in text
        assert custom["celerates.provenance"][-1] == {"mode": "deterministic", "fallback": True}

        # 3. The model cannot reach tools outside the planner allowlist (e.g. proposals, datasets) through calls.
        for bad in ({"tool": "erp_propose", "args": {"title": "x", "items": []}}, {"tool": "dataset_read", "args": {}}):
            end, _, _, _ = run("apa saja?", [{"calls": [bad]}])
            assert end["result"]["reasoning"] == "fallback", bad

        # 4. Provider down → deterministic, never a fabricated answer.
        end, text, _, _ = run("requisition belum ada PIC", [RuntimeError("503")])
        assert end["result"]["reasoning"] == "fallback" and end["result"]["fallback_reason"] == "ModelUnavailable"

        # 5. Natural-language action → ERP-held proposal (pending), never an applied change.
        ProposingERP.proposed.clear()
        end, text, custom, _ = run(
            "buatkan task follow up REQ-7 besok",
            [
                {"calls": [{"tool": "erp_search", "args": {"query": "REQ-7"}}]},
                {
                    "proposal": {
                        "title": "Follow up REQ-7",
                        "items": [
                            {
                                "kind": "task.create",
                                "target": {"type": "requisition", "id": REQUISITIONS[0]},
                                "params": {"title": "Follow up REQ-7", "due_date": "2026-09-27"},
                            }
                        ],
                    }
                },
            ],
        )
        assert end["result"]["reasoning"] == "model" and end["result"]["proposal"]
        assert ProposingERP.proposed[-1]["items"][0]["target"]["id"] == REQUISITIONS[0]
        assert custom["celerates.proposal"] and "Belum ada data yang berubah" in text
        end, _, _, _ = run("hapus semua", [{"proposal": {"title": "x", "items": [{"kind": "requisition.delete"}]}}])
        assert end["result"]["reasoning"] == "fallback", "unknown commands never reach ERP"
    monkeypatch.setattr(playbooks, "DelegatedERP", original)
