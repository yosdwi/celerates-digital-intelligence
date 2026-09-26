"""Brain Console: read-only views of what the Agent did, how it reasoned, what users decided and what it learned.

Sources are the Agent's own persisted state (agent_runs/steps, agent_outcomes, agent_mapping_templates,
agent_datasets). ERP remains the record of truth for effects; outcomes here are the observations ERP reported.
Curator role only: the view shows users' questions and decisions. Dataset contents are never exposed here.
"""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from ..config import settings
from ..db import all_rows, connect, one
from ..identity import actor

router = APIRouter(prefix="/api/console/agent")


def curator(user=Depends(actor)):
    return user.require("curator")


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
    return {
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
                      r.context->>'path' AS path, o.state AS decision
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
    return {"run": run, "steps": steps, "outcomes": outcomes}
