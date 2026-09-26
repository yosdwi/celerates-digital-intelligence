"""Governed sources reuse the document parser, object store, chunks and Model Gateway."""

import hashlib
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from . import retrieval
from .config import settings
from .db import all_rows, connect, json, one
from .documents import ALLOWED, ingest
from .gateway import ModelGateway
from .storage import storage


def allowed(source, actor, opportunity_id=None, division=None):
    if source["classification"] == "restricted" and not actor.restricted:
        return False
    kind, scope = source["scope_type"], source["scope_id"]
    if kind == "company":
        return True
    if kind == "division":
        return scope in actor.divisions and (division is None or scope == division)
    return opportunity_id is not None and scope == opportunity_id


def source_access(source, actor):
    if not source:
        raise HTTPException(404, "Source not found")
    if source["scope_type"] == "opportunity":
        from .erp import erp

        erp().get("opportunity", source["scope_id"])
    if not allowed(source, actor, source["scope_id"] if source["scope_type"] == "opportunity" else None):
        raise HTTPException(403, "Knowledge scope is not available")


def register_source(body, actor):
    actor.require("curator")
    source = body.model_dump()
    if source["scope_type"] == "company" and source["scope_id"] != "company":
        raise ValueError("Company scope ID must be company")
    source_access(source, actor)
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", (source["source_key"],))
        existing = one(conn, "SELECT * FROM knowledge_sources WHERE source_key=%s", (source["source_key"],))
        if existing:
            if any(existing[k] != v for k, v in source.items()):
                raise ValueError("Source key already has different immutable metadata")
            return existing
        return one(
            conn,
            "INSERT INTO knowledge_sources(id,source_key,title,scope_type,scope_id,classification,source_kind,created_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (
                str(uuid4()),
                source["source_key"],
                source["title"],
                source["scope_type"],
                source["scope_id"],
                source["classification"],
                source["source_kind"],
                str(actor),
            ),
        )


def register_version(source_id, version, name, body, media_type, actor):
    actor.require("curator")
    if Path(name).suffix.lower() not in ALLOWED or not body or len(body) > settings().max_upload_bytes:
        raise ValueError("Supported non-empty document up to 10 MB required")
    sha = hashlib.sha256(body).hexdigest()
    with connect() as conn:
        source = one(conn, "SELECT * FROM knowledge_sources WHERE id=%s FOR UPDATE", (source_id,))
        source_access(source, actor)
        old = one(conn, "SELECT * FROM documents WHERE source_id=%s AND source_version=%s", (source_id, version))
        if old:
            if old["sha256"] != sha:
                raise ValueError("This version already exists with different content; create a new version")
            return old
        key = f"knowledge/{source_id}/{version}/{sha}/{Path(name).name}"
        storage().put(key, body, media_type)
        doc = one(
            conn,
            "INSERT INTO documents(id,source_id,source_version,name,object_key,sha256,media_type,size_bytes) VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (str(uuid4()), source_id, version, Path(name).name, key, sha, media_type, len(body)),
        )
        audit(conn, source_id, doc["id"], "version_registered", actor, {"sha256": sha, "version": version})
        return doc


def audit(conn, source_id, document_id, action, actor, detail=None):
    conn.execute(
        "INSERT INTO knowledge_audit(source_id,document_id,action,actor,detail) VALUES (%s,%s,%s,%s,%s)",
        (source_id, document_id, action, str(actor), json(detail or {})),
    )


def transition(document_id, action, actor):
    actor.require("curator")
    with connect() as conn:
        doc = one(conn, "SELECT * FROM documents WHERE id=%s", (document_id,))
        if not doc or not doc["source_id"]:
            raise HTTPException(404, "Knowledge version not found")
        source = one(conn, "SELECT * FROM knowledge_sources WHERE id=%s FOR UPDATE", (doc["source_id"],))
        source_access(source, actor)
        doc = one(conn, "SELECT * FROM documents WHERE id=%s FOR UPDATE", (document_id,))
        if action == "approve":
            if doc["state"] != "INGESTED" or doc["lifecycle"] != "draft":
                raise ValueError("Only an ingested draft can be approved")
            conn.execute(
                "UPDATE documents SET lifecycle='superseded' WHERE source_id=%s AND lifecycle='active'", (source["id"],)
            )
            conn.execute(
                "UPDATE documents SET lifecycle='active',approved_by=%s,approved_at=now() WHERE id=%s",
                (str(actor), document_id),
            )
        elif action == "deprecate":
            conn.execute("UPDATE documents SET lifecycle='deprecated' WHERE id=%s", (document_id,))
        elif action == "retry":
            if doc["state"] != "FAILED" or doc["lifecycle"] != "draft":
                raise ValueError("Only failed draft ingestion can be retried")
            conn.execute("UPDATE documents SET state='REGISTERED',error=NULL WHERE id=%s", (document_id,))
        else:
            raise ValueError("Unsupported lifecycle action")
        audit(conn, source["id"], document_id, action, actor)
        return one(conn, "SELECT id,state,lifecycle,approved_by FROM documents WHERE id=%s", (document_id,))


def tick():
    # Session lock survives parser's short transactions; a crash releases it and leaves durable work retryable.
    with connect() as conn:
        if not one(conn, "SELECT pg_try_advisory_xact_lock(738913) AS locked")["locked"]:
            return False
        doc = one(
            conn,
            "SELECT id FROM documents WHERE source_id IS NOT NULL AND state='REGISTERED' ORDER BY created_at LIMIT 1",
        )
        if not doc:
            return False
        try:
            ingest(None, doc["id"])
        except Exception:
            pass  # ingest records FAILED; explicit curator retry, no poison-job loop
        return True


def retrieve(opportunity_id, query, actor, division="sales"):
    embedding, model = ModelGateway().embed(query)
    scopes = list(actor.divisions & {division})
    with connect() as conn:
        return all_rows(
            conn,
            """WITH authorized AS MATERIALIZED (
          SELECT d.id,d.name,d.sha256,d.source_version,s.id AS source_id,s.title,s.scope_type,s.scope_id,s.classification
          FROM documents d JOIN knowledge_sources s ON s.id=d.source_id
          WHERE d.lifecycle='active' AND d.state='INGESTED' AND (s.classification='internal' OR %s)
          AND (s.scope_type='company' OR (s.scope_type='division' AND s.scope_id=ANY(%s)) OR (s.scope_type='opportunity' AND s.scope_id=%s))
        ) SELECT c.id,c.document_id,c.text,a.name,a.sha256,a.source_id,a.source_version,a.title,a.scope_type,a.scope_id,a.classification,
          ts_rank_cd(c.search_multi,"""
            + retrieval.TSQUERY_SQL
            + """)+(1-(c.embedding <=> %s::vector)) AS score
          FROM authorized a JOIN chunks c ON c.document_id=a.id WHERE c.embedding_model=%s
          ORDER BY score DESC,c.id LIMIT 8""",
            (actor.restricted, scopes, opportunity_id, *retrieval.tsquery_params(query), str(embedding), model),
        )


DEMO_EMBEDDING = retrieval.DEMO_EMBEDDING


def search_for_principal(query, actor, opportunity_ids=(), limit=5, min_vector=0.5):
    """Agent retrieval: approved, active knowledge the principal may read. Scope filters run before ranking.

    Opportunity-scoped sources are included only for opportunity IDs the caller has already read from ERP under
    the same delegation (ERP authorized them); company and the principal's divisions otherwise. A passage must match
    lexically (Indonesian + English stems, prefixes), or clear a vector-similarity floor when a semantic embedding
    model is configured. Ranking is reciprocal-rank fusion of lexical and (semantic only) vector rank. The
    deterministic demo hash is not semantic, so it never admits or ranks a passage.
    """
    embedding, model = ModelGateway().embed(query)
    semantic = model != DEMO_EMBEDDING
    with connect() as conn:
        return all_rows(
            conn,
            f"""WITH q AS (SELECT {retrieval.TSQUERY_SQL} AS terms), authorized AS MATERIALIZED (
          SELECT d.id,d.name,d.sha256,d.source_version,d.approved_at,s.id AS source_id,s.title,s.scope_type,s.scope_id,
                 s.classification,s.source_kind
          FROM documents d JOIN knowledge_sources s ON s.id=d.source_id
          WHERE d.lifecycle='active' AND d.state='INGESTED' AND (s.classification='internal' OR %s)
          AND (s.scope_type='company' OR (s.scope_type='division' AND s.scope_id=ANY(%s))
               OR (s.scope_type='opportunity' AND s.scope_id=ANY(%s)))
        ), scored AS (
          SELECT c.id,c.document_id,c.text,a.name,a.sha256,a.source_id,a.source_version,a.title,a.scope_type,
                 a.scope_id,a.classification,a.source_kind,a.approved_at,
                 (c.search_multi @@ q.terms) AS lexical_match,
                 ts_rank_cd(c.search_multi, q.terms) AS lexical,
                 1-(c.embedding <=> %s::vector) AS vector
          FROM authorized a JOIN chunks c ON c.document_id=a.id CROSS JOIN q WHERE c.embedding_model=%s
        ), admitted AS (
          SELECT *, row_number() OVER (ORDER BY lexical DESC, id) AS lrank,
                    row_number() OVER (ORDER BY vector DESC, id) AS vrank
          FROM scored WHERE lexical_match OR (%s AND vector >= %s)
        ), fused AS (
          SELECT *, (CASE WHEN lexical_match THEN 1.0/({retrieval.RRF_K}+lrank) ELSE 0 END
                     + CASE WHEN %s THEN 1.0/({retrieval.RRF_K}+vrank) ELSE 0 END) AS score
          FROM admitted
        ), ranked AS (
          SELECT *, row_number() OVER (PARTITION BY source_id ORDER BY score DESC, id) AS rank FROM fused
        ) SELECT * FROM ranked WHERE rank=1 ORDER BY score DESC, id LIMIT %s""",
            (
                *retrieval.tsquery_params(query),
                actor.restricted,
                sorted(actor.divisions),
                list(opportunity_ids),
                str(embedding),
                model,
                semantic,
                min_vector,
                semantic,
                limit,
            ),
        )
