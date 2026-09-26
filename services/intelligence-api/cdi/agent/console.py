"""Brain Console: read-only views of what the Agent did, how it reasoned, what users decided and what it learned.

Sources are the Agent's own persisted state (agent_runs/steps, agent_outcomes, agent_mapping_templates,
agent_datasets). ERP remains the record of truth for effects; outcomes here are the observations ERP reported.
Curator role only: the view shows users' questions and decisions. Dataset contents are never exposed here.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from ..config import settings
from ..db import all_rows, connect, one
from ..identity import actor
from . import quality

router = APIRouter(prefix="/api/console/agent")


def curator(authorization: Annotated[str | None, Header()] = None):
    """Curators: a named workspace token with the curator role, or an ERP Owner signed in from ERP (ADR-016)."""
    from ..delegation import DelegationError, console_principal, verify_console

    token = (authorization or "").removeprefix("Bearer ")
    if token.count(".") == 2:
        try:
            return console_principal(verify_console(token))
        except (DelegationError, ValueError, TypeError) as exc:
            raise HTTPException(401, "ERP sign-in expired or invalid; open the Brain Console from ERP again") from exc
    return actor(authorization).require("curator")


def _summary(conn, days):
    runs = one(
        conn,
        """SELECT count(*)::int AS runs,
                  count(*) FILTER (WHERE state='succeeded')::int AS succeeded,
                  count(*) FILTER (WHERE state='failed')::int AS failed,
                  count(DISTINCT principal_sub)::int AS users,
                  count(*) FILTER (WHERE result->>'reasoning'='model')::int AS model,
                  count(*) FILTER (WHERE result->>'reasoning'='fallback')::int AS fallback,
                  count(*) FILTER (WHERE result->>'proposal' IS NOT NULL)::int AS proposals,
                  coalesce(sum((result->>'model_tokens')::int),0)::int AS tokens,
                  coalesce(round(avg(extract(epoch FROM finished_at-created_at))::numeric * 1000),0)::int AS avg_ms
           FROM agent_runs WHERE created_at > now() - %s * interval '1 day'""",
        (days,),
    )
    skills = all_rows(
        conn,
        """SELECT skill, count(*)::int AS runs,
                  count(*) FILTER (WHERE state='failed')::int AS failed,
                  count(*) FILTER (WHERE result->>'reasoning'='model')::int AS model,
                  count(*) FILTER (WHERE result->>'reasoning'='fallback')::int AS fallback
           FROM agent_runs WHERE created_at > now() - %s * interval '1 day' GROUP BY skill ORDER BY 2 DESC""",
        (days,),
    )
    models = all_rows(
        conn,
        """SELECT result->>'model' AS model, count(*)::int AS answers,
                  round(avg((result->>'model_rounds')::numeric),1)::float AS avg_turns,
                  round(avg((result->>'model_tokens')::numeric))::int AS avg_tokens
           FROM agent_runs WHERE created_at > now() - %s * interval '1 day' AND result->>'reasoning'='model'
           GROUP BY 1 ORDER BY 2 DESC""",
        (days,),
    )
    fallbacks = all_rows(
        conn,
        """SELECT result->>'fallback_reason' AS reason, count(*)::int AS runs FROM agent_runs
           WHERE created_at > now() - %s * interval '1 day' AND result->>'reasoning'='fallback' GROUP BY 1 ORDER BY 2 DESC""",
        (days,),
    )
    failures = all_rows(
        conn,
        """SELECT split_part(error, ':', 1) AS code, count(*)::int AS runs FROM agent_runs
           WHERE created_at > now() - %s * interval '1 day' AND state='failed' GROUP BY 1 ORDER BY 2 DESC""",
        (days,),
    )
    outcomes = one(
        conn,
        """SELECT count(*)::int AS decided,
                  count(*) FILTER (WHERE o.state IN ('applied','partially_applied'))::int AS applied,
                  count(*) FILTER (WHERE o.state='rejected')::int AS rejected,
                  coalesce(sum((o.receipts->>'applied')::int),0)::int AS items_applied,
                  coalesce(sum(o.edited_items),0)::int AS items_edited,
                  coalesce(sum((o.outcome->>'resolved')::int),0)::int AS items_resolved
           FROM agent_outcomes o WHERE o.recorded_at > now() - %s * interval '1 day'""",
        (days,),
    )
    return runs, skills, models, fallbacks, failures, outcomes


@router.get("")
def overview(days: Annotated[int, Query(ge=1, le=90)] = 14, user=Depends(curator)):
    cfg = settings()
    with connect() as conn:
        runs, skills, models, fallbacks, failures, outcomes = _summary(conn, days)
        learned = all_rows(
            conn,
            "SELECT command, uses, updated_at, mapping FROM agent_mapping_templates ORDER BY updated_at DESC LIMIT 20",
        )
        datasets = all_rows(
            conn,
            """SELECT kind, count(*)::int AS files, coalesce(sum(size_bytes),0)::bigint AS bytes,
                      min(created_at) AS oldest FROM agent_datasets GROUP BY kind ORDER BY kind""",
        )
        feedback = one(
            conn,
            """SELECT count(*) FILTER (WHERE f.rating=1)::int AS helpful, count(*) FILTER (WHERE f.rating=-1)::int AS not_helpful,
                      count(*) FILTER (WHERE f.rating=1 AND r.result->>'reasoning'='model')::int AS model_helpful,
                      count(*) FILTER (WHERE r.result->>'reasoning'='model')::int AS model_rated
               FROM agent_feedback f JOIN agent_runs r ON r.id=f.run_id
               WHERE f.updated_at > now() - %s * interval '1 day'""",
            (days,),
        )
        complaints = all_rows(
            conn,
            """SELECT f.run_id, f.reason, f.comment, f.updated_at, r.input->>'query' AS query, r.skill,
                      r.result->>'reasoning' AS reasoning
               FROM agent_feedback f JOIN agent_runs r ON r.id=f.run_id
               WHERE f.rating=-1 AND f.updated_at > now() - %s * interval '1 day'
               ORDER BY f.updated_at DESC LIMIT 10""",
            (days,),
        )
    return {
        "feedback": {**feedback, "recent_negative": complaints},
        "days": days,
        "reasoning": {
            "mode": "model" if cfg.generation_mode == "litellm" and cfg.agent_model else "deterministic",
            "model": cfg.agent_model or None,
            "embedding": "semantic" if cfg.embedding_mode == "litellm" else "lexical only",
        },
        "runs": runs,
        "skills": skills,
        "models": models,
        "fallbacks": fallbacks,
        "failures": failures,
        "outcomes": outcomes,
        "learned_mappings": learned,
        "datasets": {"items": datasets, "retention_days": cfg.agent_dataset_days},
    }


@router.get("/runs")
def recent(limit: Annotated[int, Query(ge=1, le=100)] = 30, user=Depends(curator)):
    with connect() as conn:
        rows = all_rows(
            conn,
            """SELECT r.id, r.skill, r.state, r.principal_name, r.created_at, r.finished_at, r.error, r.modality,
                      r.input->>'query' AS query, r.result->>'reasoning' AS reasoning, r.result->>'proposal' AS proposal,
                      r.context->>'path' AS path, o.state AS decision,
                      (SELECT sum(rating)::int FROM agent_feedback WHERE run_id=r.id) AS feedback,
                      EXISTS (SELECT 1 FROM agent_eval_cases WHERE run_id=r.id) AS is_case
               FROM agent_runs r LEFT JOIN LATERAL (
                 SELECT state FROM agent_outcomes WHERE run_id=r.id ORDER BY recorded_at DESC LIMIT 1) o ON true
               ORDER BY r.created_at DESC LIMIT %s""",
            (limit,),
        )
    return {"items": rows}


@router.get("/runs/{run_id}")
def trace(run_id: UUID, user=Depends(curator)):
    """The persisted AG-UI events of one run: steps, tool calls, evidence, provenance and the answer."""
    with connect() as conn:
        run = one(
            conn,
            """SELECT id, skill, state, principal_name, created_at, finished_at, input, context, context->>'path' AS path, result, error,
                      playbook_version, modality FROM agent_runs WHERE id=%s""",
            (str(run_id),),
        )
        if not run:
            raise HTTPException(404, "Run not found")
        steps = all_rows(conn, "SELECT seq, type, event FROM agent_steps WHERE run_id=%s ORDER BY seq", (run["id"],))
        outcomes = all_rows(
            conn,
            "SELECT proposal_id, state, counts, receipts, outcome, edited_items, recorded_at FROM agent_outcomes "
            "WHERE run_id=%s ORDER BY recorded_at",
            (run["id"],),
        )
        turns = all_rows(
            conn,
            "SELECT turn, model, verdict, tokens, latency_ms, reply FROM agent_model_turns WHERE run_id=%s ORDER BY turn",
            (run["id"],),
        )
        feedback = all_rows(
            conn, "SELECT rating, reason, comment, updated_at FROM agent_feedback WHERE run_id=%s", (run["id"],)
        )
        case = one(conn, "SELECT id, expect, note, created_by FROM agent_eval_cases WHERE run_id=%s", (run["id"],))
    return {
        "run": run,
        "steps": steps,
        "outcomes": outcomes,
        "turns": turns,
        "feedback": feedback,
        "case": case,
        "case_candidates": quality.case_candidates(run["id"]),
    }


class CaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: UUID
    refs: list[Annotated[str, Field(max_length=300)]] = Field(default_factory=list, max_length=40)
    note: str | None = Field(default=None, max_length=500)


@router.post("/cases", status_code=201)
def create_case(body: CaseRequest, user=Depends(curator)):
    """Turn a model-answered run into an evaluation case: the expected sources are chosen from what it read."""
    try:
        return quality.create_case(str(body.run_id), body.refs, body.note, user)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.delete("/cases/{case_id}")
def delete_case(case_id: UUID, user=Depends(curator)):
    with connect() as conn:
        conn.execute("DELETE FROM agent_eval_cases WHERE id=%s", (str(case_id),))
    return {"deleted": True}


@router.get("/evals")
def evals(user=Depends(curator)):
    with connect() as conn:
        cases = all_rows(
            conn,
            "SELECT id, run_id, question, expect, note, created_by, created_at FROM agent_eval_cases ORDER BY created_at",
        )
        runs_ = all_rows(
            conn,
            "SELECT id, model, state, created_by, created_at, finished_at, summary FROM agent_eval_runs "
            "ORDER BY created_at DESC LIMIT 10",
        )
    return {"models": quality.eval_models(), "cases": cases, "runs": runs_}


class EvalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    model: str = Field(min_length=1, max_length=200)


@router.post("/evals", status_code=202)
def start_eval(body: EvalRequest, user=Depends(curator)):
    """Replay every case against one allowlisted model with frozen evidence. Runs in the background."""
    try:
        row = quality.start_eval(body.model, user)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    from .playbooks import pool

    pool().submit(quality.run_eval, row["id"], body.model)
    return {"id": row["id"], "state": row["state"]}


@router.get("/evals/{eval_id}")
def eval_result(eval_id: UUID, user=Depends(curator)):
    with connect() as conn:
        row = one(conn, "SELECT * FROM agent_eval_runs WHERE id=%s", (str(eval_id),))
    if not row:
        raise HTTPException(404, "Evaluation not found")
    return row
