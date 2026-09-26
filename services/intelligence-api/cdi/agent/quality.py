"""Quality loop (ADR-015): user feedback on answers, evaluation cases, and replay evaluation of models.

Replay evaluation sends a saved run's *recorded* model requests to a candidate model with the same frozen evidence:
no ERP call, no delegation, no proposal is created (a proposed reply is only validated). It measures what matters for
a provider switch: does the plan use only allowed tools, is the answer grounded (known citations, no invented
numbers), does it cite the sources a curator expects, and at what latency and token cost.
"""

import json
import logging
import re
import statistics
from uuid import uuid4

from ..config import settings
from ..db import all_rows, connect, one
from ..db import json as dbjson
from ..gateway import ModelUnavailable, structured
from . import reasoning

log = logging.getLogger(__name__)
REASONS = ("wrong", "incomplete", "irrelevant", "other")
MAX_CASES = 50


# ── feedback ────────────────────────────────────────────────────────────────────────────────────────────────────────
def record_feedback(run, principal, rating, reason, comment):
    with connect() as conn:
        return one(
            conn,
            """INSERT INTO agent_feedback(run_id,principal_sub,rating,reason,comment) VALUES (%s,%s,%s,%s,%s)
               ON CONFLICT (run_id,principal_sub) DO UPDATE SET rating=EXCLUDED.rating,reason=EXCLUDED.reason,
                 comment=EXCLUDED.comment,updated_at=now()
               RETURNING run_id,rating,reason,comment,updated_at""",
            (run["id"], principal.sub, rating, reason, comment),
        )


# ── evaluation cases ────────────────────────────────────────────────────────────────────────────────────────────────
def turns(run_id):
    with connect() as conn:
        return all_rows(conn, "SELECT * FROM agent_model_turns WHERE run_id=%s ORDER BY turn", (run_id,))


def case_candidates(run_id):
    """What a curator can expect from this run: the evidence it read (stable refs) and what it produced."""
    rows = turns(run_id)
    if not rows or not rows[-1]["ledger"]:
        return None
    ledger = rows[-1]["ledger"]
    final = rows[-1]["reply"] or {}
    cited = set(final.get("cite", [])) if isinstance(final, dict) else set()
    refs = []
    for key, text in ledger["items"].items():
        ref = ledger["refs"].get(key)
        if ref:
            refs.append({"key": key, "ref": ref, "text": text[:160], "cited": key in cited})
    shape = "proposal" if isinstance(final, dict) and "proposal" in final else "answer"
    kinds = sorted({i.get("kind") for i in final.get("proposal", {}).get("items", [])}) if shape == "proposal" else []
    question = json.loads(rows[0]["request"][1]["content"])["question"]
    return {"question": question, "shape": shape, "kinds": kinds, "refs": refs, "turns": len(rows)}


def create_case(run_id, expect_refs, note, curator):
    found = case_candidates(run_id)
    if not found:
        raise ValueError("Only runs answered by a model can become evaluation cases")
    known = {r["ref"] for r in found["refs"]}
    refs = sorted(set(expect_refs) & known)
    expect = {"shape": found["shape"], "refs": refs, "kinds": found["kinds"]}
    with connect() as conn:
        if one(conn, "SELECT count(*)::int AS n FROM agent_eval_cases")["n"] >= MAX_CASES:
            raise ValueError(f"At most {MAX_CASES} evaluation cases")
        return one(
            conn,
            """INSERT INTO agent_eval_cases(id,run_id,question,expect,note,created_by) VALUES (%s,%s,%s,%s,%s,%s)
               ON CONFLICT (run_id) DO UPDATE SET expect=EXCLUDED.expect,note=EXCLUDED.note RETURNING *""",
            (str(uuid4()), run_id, found["question"], dbjson(expect), note, str(curator)),
        )


# ── replay evaluation ───────────────────────────────────────────────────────────────────────────────────────────────
def eval_models():
    cfg = settings()
    extra = [m.strip() for m in cfg.agent_eval_models.split(",") if m.strip()]
    return list(dict.fromkeys(([cfg.agent_model] if cfg.agent_model else []) + extra))


class _FrozenLedger(reasoning.Ledger):
    def __init__(self, snapshot):
        super().__init__()
        self.items = dict(snapshot["items"])
        self.refs = dict(snapshot["refs"])


def _plan_check(reply, has_document):
    shapes = [k for k in ("calls", "proposal", "answer") if k in reply]
    if len(shapes) != 1:
        return False, "shape"
    if "calls" in reply:
        calls = reply["calls"]
        if not isinstance(calls, list) or not 1 <= len(calls) <= reasoning.MAX_CALLS_PER_ROUND:
            return False, "calls"
        for call in calls:
            try:
                reasoning._validate_call(call, {"id": "frozen"} if has_document else None)
            except reasoning.ReasoningFailed as exc:
                return False, str(exc)
    return True, shapes[0]


def replay_case(case, model):
    """Replay the first (planning) and last (answering) recorded requests of one case against `model`."""
    rows = turns(case["run_id"])
    if not rows or not rows[-1]["ledger"]:
        return {"case_id": case["id"], "question": case["question"], "skipped": "no recorded model turns"}
    first = json.loads(rows[0]["request"][1]["content"])
    ledger = _FrozenLedger(rows[-1]["ledger"])
    expect = case["expect"]
    out = {"case_id": case["id"], "question": case["question"], "latency_ms": 0, "tokens": 0}
    try:
        plan, meta = structured(rows[0]["request"], use_case="agent-eval", model=model, timeout=30)
        out["latency_ms"] += meta["latency_ms"]
        out["tokens"] += meta["tokens"]
        out["plan_valid"], out["plan"] = _plan_check(plan, bool(first.get("document")))
        final, meta = structured(rows[-1]["request"], use_case="agent-eval", model=model, timeout=30)
        out["latency_ms"] += meta["latency_ms"]
        out["tokens"] += meta["tokens"]
    except ModelUnavailable:
        return {
            **out,
            "error": "model unavailable",
            "plan_valid": False,
            "shape_ok": False,
            "grounded": False,
            "recall": 0.0,
        }
    if expect["shape"] == "proposal":
        out["shape_ok"] = "proposal" in final
        try:
            _, items = reasoning._validate_proposal(final.get("proposal"), [{"kind": k} for k in _command_kinds(first)])
            kinds = sorted({i["kind"] for i in items})
            out["grounded"] = True
            out["recall"] = 1.0 if not expect["kinds"] or set(expect["kinds"]) <= set(kinds) else 0.0
            out["answer"] = f"proposal: {', '.join(kinds)}"
        except reasoning.ReasoningFailed as exc:
            out.update(grounded=False, recall=0.0, problem=str(exc))
        return out
    out["shape_ok"] = "answer" in final
    if not out["shape_ok"]:
        return {**out, "grounded": False, "recall": 0.0, "problem": "no answer"}
    problem = reasoning._check_answer(final["answer"], final.get("cite", []), ledger, first["question"], first["today"])
    cited = set(final.get("cite", [])) if isinstance(final.get("cite"), list) else set()
    cited |= set(re.findall(r"\[([ESD]\d+)\]", str(final["answer"])))
    cited_refs = {ledger.refs[k] for k in cited if k in ledger.refs}
    expected = set(expect["refs"])
    out["grounded"] = problem is None
    out["recall"] = round(len(expected & cited_refs) / len(expected), 2) if expected else 1.0
    out["answer"] = str(final["answer"])[:400]
    if problem:
        out["problem"] = problem
    return out


def _command_kinds(first_request):
    return [c["kind"] for c in first_request.get("commands", []) if isinstance(c, dict) and c.get("kind")]


def summarize(results):
    done = [r for r in results if "skipped" not in r]
    n = len(done)
    if not n:
        return {"cases": 0}
    pct = lambda k: round(100 * sum(1 for r in done if r.get(k)) / n)  # noqa: E731
    return {
        "cases": n,
        "skipped": len(results) - n,
        "plan_valid_pct": pct("plan_valid"),
        "shape_ok_pct": pct("shape_ok"),
        "grounded_pct": pct("grounded"),
        "recall_avg": round(sum(r.get("recall", 0) for r in done) / n, 2),
        "latency_ms_median": round(statistics.median(r["latency_ms"] for r in done)),
        "tokens_avg": round(sum(r["tokens"] for r in done) / n),
        "errors": sum(1 for r in done if r.get("error")),
    }


def start_eval(model, curator):
    if model not in eval_models():
        raise ValueError("Model is not in the evaluation allowlist (AGENT_MODEL, AGENT_EVAL_MODELS)")
    with connect() as conn:
        if one(
            conn,
            "SELECT 1 AS x FROM agent_eval_runs WHERE state='running' AND created_at > now()-interval '30 minutes'",
        ):
            raise ValueError("An evaluation is already running")
        row = one(
            conn,
            "INSERT INTO agent_eval_runs(id,model,created_by) VALUES (%s,%s,%s) RETURNING *",
            (str(uuid4()), model, str(curator)),
        )
    return row


def run_eval(eval_id, model):
    try:
        with connect() as conn:
            cases = all_rows(conn, "SELECT * FROM agent_eval_cases ORDER BY created_at")
        results = [replay_case(c, model) for c in cases]
        with connect() as conn:
            conn.execute(
                "UPDATE agent_eval_runs SET state='succeeded',finished_at=now(),results=%s,summary=%s WHERE id=%s",
                (dbjson(results), dbjson(summarize(results)), eval_id),
            )
    except Exception:
        log.exception("Evaluation %s failed", eval_id)
        with connect() as conn:
            conn.execute("UPDATE agent_eval_runs SET state='failed',finished_at=now() WHERE id=%s", (eval_id,))


def purge_turns():
    with connect() as conn:
        conn.execute(
            "DELETE FROM agent_model_turns WHERE recorded_at < now() - %s * interval '1 day' "
            "AND run_id NOT IN (SELECT run_id FROM agent_eval_cases)",  # evaluation cases keep their evidence
            (settings().agent_turn_days,),
        )
