"""Doc 22 P4: a policy PDF in Company Files answers cuti questions with page citations; implicit feedback is routed by
the model without keywords; the model path tolerates harmless output variations but stays grounded. The provider is
stubbed (ScriptedModel); the cases in eval_cases_p4.json are saved as evaluation cases and replayed."""

import json
import sys
import types
from pathlib import Path
from uuid import uuid4

import pytest
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
from test_agent import KEY, AskingERP, ProposingERP, ScriptedModel, events, mint

from cdi import delegation, files, gateway, knowledge
from cdi.agent import intents, playbooks, quality, reasoning
from cdi.api import app
from cdi.config import settings
from cdi.db import all_rows, connect
from cdi.migrate import migrate

ROOT = Path(__file__).resolve().parents[3]
POLICY_PDF = ROOT / "samples/policies/kebijakan-cuti-karyawan-contoh.pdf"
CASES = json.loads((Path(__file__).with_name("eval_cases_p4.json")).read_text())["cases"]


@pytest.fixture(scope="module", autouse=True)
def schema():
    migrate()


@pytest.fixture(autouse=True)
def env(monkeypatch):
    pem = KEY.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode()
    monkeypatch.setattr(settings(), "erp_delegation_public_keys", json.dumps({"k1": pem}))
    monkeypatch.setattr(settings(), "generation_mode", "demo")
    monkeypatch.setattr(settings(), "embedding_mode", "demo")
    monkeypatch.setattr(files, "catalog", lambda: files.DEFAULT_CATALOG)
    monkeypatch.setattr(files, "_erp", lambda principal: AskingERP(principal))
    monkeypatch.setattr(playbooks, "DelegatedERP", AskingERP)
    monkeypatch.setattr(playbooks, "start", lambda r, u, a: playbooks.execute(r, u, a))
    with connect() as conn:
        conn.execute("DELETE FROM files")
        conn.execute("DELETE FROM agent_eval_cases")


@pytest.fixture
def client(monkeypatch):
    with TestClient(app) as c:
        monkeypatch.setattr(settings(), "erp_mode", "http")  # after startup validation, as in test_agent
        yield c


@pytest.fixture
def policy():
    """The sample policy uploaded as kind `policy` with its default class (general: content shared with the model)."""
    principal = delegation.DelegatedPrincipal(delegation.verify(mint(owner=False)), "t")
    saved = files.create_managed(
        principal, POLICY_PDF.name, POLICY_PDF.read_bytes(), kind="policy", title="Kebijakan Cuti Karyawan (Contoh)"
    )
    while files.tick():
        pass
    assert saved["access_class"] == "general"
    assert files.detail(principal, saved["id"])["versions"][0]["ingest_state"] == "indexed"
    return principal, saved


def use_model(monkeypatch, replies):
    model = ScriptedModel(replies)
    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(completion=model.completion))
    monkeypatch.setattr(settings(), "generation_mode", "litellm")
    monkeypatch.setattr(settings(), "agent_model", "openai/scripted")
    return model


def run(client, query, path="/", thread=None):
    token = mint(ctx={"path": path, "module": path.strip("/").split("/")[0] or "sales"})
    run_id = str(uuid4())
    body = {"run_id": run_id, "skill": "ask", "args": {"query": query}}
    if thread:
        body["thread_id"] = thread
    assert client.post("/api/agent/runs", json=body, headers={"X-ERP-Delegation": token}).status_code == 201
    stream = events(client, run_id, token)
    assert stream[-1][1]["type"] == "RUN_FINISHED", stream[-1]
    custom = {}
    for _, e in stream:
        if e["type"] == "CUSTOM":
            custom.setdefault(e["name"], []).append(e["value"])
    text = "".join(e["delta"] for _, e in stream if e["type"] == "TEXT_MESSAGE_CONTENT")
    return run_id, stream[-1][1]["result"], text, custom


def fill(value, file_id):
    return json.loads(json.dumps(value).replace("{policy}", file_id))


# ── Company Files: extraction and Indonesian lexical retrieval ─────────────────────────────────────────────────────
def test_policy_pdf_is_indexed_by_section_and_found_for_cuti_questions(policy):
    principal, saved = policy
    # Text PDFs are split by their numbered headings, not cut mid-sentence: each chunk is one section.
    with connect() as conn:
        chunks = all_rows(
            conn,
            "SELECT page_from, heading, length(text) AS n FROM chunks WHERE file_id=%s ORDER BY ordinal",
            (saved["id"],),
        )
    headings = [c["heading"] for c in chunks if c["heading"]]
    assert "3. Cuti Tahunan" in headings and "9. Sisa Cuti dan Carry-over" in headings
    assert max(c["n"] for c in chunks) <= reasoning.PASSAGE_CHARS, "a whole chunk fits in one evidence item"

    hit = files.search(principal, "berapa jatah cuti tahunan?", purpose="agent")[0]
    assert hit["id"] == saved["id"] and hit["page"] == 1 and "12 hari kerja" in hit["snippet"]
    read = files.read(principal, saved["id"], "berapa jatah cuti tahunan?", purpose="agent")
    assert {p["heading"] for p in read["passages"][:2]} == {"2. Jenis Cuti", "3. Cuti Tahunan"}
    carry = files.search(principal, "apakah cuti tahunan bisa dibawa ke tahun berikutnya?", purpose="agent")[0]
    assert carry["page"] == 3 and carry["heading"] == "9. Sisa Cuti dan Carry-over"
    assert "5 hari kerja" in carry["snippet"] and "31 Maret" in carry["snippet"]


def test_retrieval_falls_back_to_lexical_when_the_embedding_provider_fails(policy, monkeypatch):
    principal, saved = policy

    def broken(**kwargs):
        raise RuntimeError("401 Authentication error")

    monkeypatch.setitem(sys.modules, "litellm", types.SimpleNamespace(embedding=broken))
    monkeypatch.setattr(settings(), "embedding_mode", "litellm")
    assert [h["id"] for h in files.search(principal, "jatah cuti tahunan", purpose="agent")] == [saved["id"]]
    assert isinstance(knowledge.search_for_principal("jatah cuti tahunan", principal), list)


def test_without_a_model_a_policy_question_finds_the_policy_file(policy, client):
    _, result, text, custom = run(client, "berapa jatah cuti tahunan?")
    assert result["reasoning"] == "deterministic"
    assert "Kebijakan Cuti Karyawan (Contoh)" in text and "hal. 1" in text and "12 hari kerja" in text
    cards = [i for v in custom["celerates.evidence"] for i in v["items"] if i["type"] == "file"]
    assert cards and cards[0]["source"]["ref"].endswith("#p1")


# ── the evaluation cases: run with the stubbed model, save as cases, replay ────────────────────────────────────────
@pytest.mark.parametrize("case", CASES, ids=[c["id"] for c in CASES])
def test_evaluation_case(case, policy, client, monkeypatch):
    _, saved = policy
    ProposingERP.proposed.clear()
    thread = "thread-" + uuid4().hex
    if case.get("previous"):
        use_model(monkeypatch, case["previous"]["script"])
        _, result, _, _ = run(client, case["previous"]["question"], case["path"], thread)
        assert result["reasoning"] == "model"
    model = use_model(monkeypatch, fill(case["script"], saved["id"]))
    run_id, result, text, custom = run(client, case["question"], case["path"], thread)
    expect = case["expect"]
    assert result["reasoning"] == "model", result
    first = json.loads(model.calls[0]["messages"][1]["content"])
    assert first["question"] == case["question"]

    if expect["shape"] == "answer":
        # Grounded in the policy's page passages; the cards the user sees are the file's pages.
        for phrase in expect["must_say"]:
            assert phrase in text
        cards = [i for v in custom["celerates.evidence"] for i in v["items"] if i["type"] == "file"]
        pages = {int(card["source"]["ref"].rsplit("#p", 1)[1]) for card in cards if "#p" in card["source"]["ref"]}
        assert set(expect["pages"]) <= pages
        assert custom["celerates.provenance"][-1]["mode"] == "model" and result["cited"]
    else:
        assert result["intent"] in expect["kinds"] and result["chosen_by"] == "model"
        if expect.get("no_keyword"):
            assert not intents.cues(case["question"]), "routed by the model, not by a keyword cue"
        if result["intent"] == "feature_request":
            item = ProposingERP.proposed[-1]["items"][0]
            assert item["kind"] == "feature_request.create" and item["params"]["context_path"] == case["path"]
        else:
            assert custom["celerates.submission"][0]["intent"] == result["intent"] and result["subject_run_id"]

    # Saved as an evaluation case (Brain Console → Evaluasi) with the sources the answer cited; replay passes.
    candidates = quality.case_candidates(run_id)
    assert candidates["shape"] == expect["shape"]
    stored = quality.create_case(run_id, [r["ref"] for r in candidates["refs"] if r["cited"]], case["id"], "curator")
    if expect["shape"] == "answer":
        assert stored["expect"]["refs"] and all(r.startswith(f"file:{saved['id']}") for r in stored["expect"]["refs"])
    script = fill(case["script"], saved["id"])
    use_model(monkeypatch, [script[0], script[-1]])
    replay = quality.replay_case(stored, "openai/scripted")
    assert replay["plan_valid"] and replay["shape_ok"] and replay["grounded"] and replay["recall"] == 1.0, replay


# ── the model path: harmless variations are accepted, ungrounded content is not ────────────────────────────────────
def test_answer_check_accepts_equivalent_numbers_and_rejects_invented_ones():
    ledger = reasoning.Ledger()
    ledger.add("E", "company file page 3: sisa cuti paling banyak 5 hari kerja, dipakai paling lambat 31 Maret")
    ledger.add("E", "invoice Rp 1.500.000 jatuh tempo 2026-10-01")
    ok = "1. Bisa, paling banyak 5 hari [E1, E2].\n2. Nilai 1500000, jatuh tempo 1 Oktober [E2]."
    assert reasoning._check_answer(ok, "E1", ledger, "q", "2026-09-29") is None
    assert reasoning.answer_cites(ok, "E1") == ["E1", "E2"]
    assert "7" in reasoning._check_answer("Paling banyak 7 hari [E1].", ["E1"], ledger, "q", "2026-09-29")
    assert "E9" in reasoning._check_answer("Lihat [E9].", [], ledger, "q", "2026-09-29")
    assert reasoning.cites(42) is None


def test_tool_calls_drop_extras_but_keep_required_arguments_and_the_allowlist():
    tool, args = reasoning._validate_call(
        {"tool": "files_search", "args": {"query": "cuti", "kind": None, "limit": 5, "mode": "x"}}
    )
    assert (tool, args) == ("files_search", {"query": "cuti"})
    for bad in (
        {"tool": "files_search", "args": {"kind": "policy"}},
        {"tool": "erp_propose", "args": {"title": "x"}},
        {"tool": "file_read", "args": "id"},
    ):
        with pytest.raises(reasoning.ReasoningFailed):
            reasoning._validate_call(bad)


def test_a_bad_read_is_evidence_and_the_model_recovers(policy, client, monkeypatch):
    """A made-up file id or tool name no longer ends the run: the model sees why and answers from real evidence."""
    _, saved = policy
    use_model(
        monkeypatch,
        [
            {
                "calls": [
                    {"tool": "file_read", "args": {"file_id": "Kebijakan Cuti"}},
                    {"tool": "search_policies", "args": {"query": "cuti"}},
                ]
            },
            {"calls": [{"tool": "file_read", "args": {"file_id": saved["id"], "query": "cuti ayah"}}]},
            {"answer": "Cuti ayah 3 hari kerja [E3].", "cite": ["E3"]},
        ],
    )
    run_id, result, text, _ = run(client, "cuti ayah berapa hari?")
    assert result["reasoning"] == "model" and text == "Cuti ayah 3 hari kerja [E3]."
    request = quality.turns(run_id)[1]["request"][-1]["content"]
    assert "file_read" in request and "not available" in request and "call not run" in request


def test_fallback_keeps_why_and_the_gateway_reads_wrapped_json(client, monkeypatch):
    msg = types.SimpleNamespace
    assert gateway.json_object(msg(content='```json\n{"answer": "x"}\n```')) == {"answer": "x"}
    assert gateway.json_object(msg(content='Berikut: {"calls": []}')) == {"calls": []}
    assert gateway.json_object(msg(content={"route": {}})) == {"route": {}}
    with pytest.raises(ValueError):
        gateway.json_object(msg(content=None))

    use_model(monkeypatch, [{"answer": "Ada 17 requisition [S2].", "cite": ["S2"]}, {"answer": "Ada 17.", "cite": []}])
    _, result, text, _ = run(client, "berapa requisition tanpa TA PIC?", "/ta")
    assert result["reasoning"] == "fallback" and result["fallback_reason"] == "ReasoningFailed"
    assert result["fallback_detail"] == "numbers not present in evidence: 17" and "disusun tanpa model" in text
