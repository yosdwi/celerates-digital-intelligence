"""Company Files (doc 17, ADR-018): a governed registry and index over files wherever their bytes are owned.

* ``managed``  — uploaded to Company Files; bytes in Intelligence object storage under sha-addressed keys.
* ``erp``      — ERP attachments and file columns that ERP declares; bytes stay in ERP; ERP authorizes every read.
* ``external`` — a link; metadata only.

Authorization composes ERP authority, the file's access class and (for ``commercial``/``personal``) the user's current
right to read a linked record — all decided by ERP (`agent/files/access`, `agent/files/readable`). Intelligence
pre-filters in SQL before ranking and asks ERP once per request for the remaining record checks.

Model visibility is class policy from ERP. For a class with ``model_visibility = none`` no file content (snippet,
passage) is ever returned for the ``agent`` purpose, so it cannot enter AG-UI events, model turns or the ledger."""

import hashlib
import logging
import time
from pathlib import Path
from uuid import uuid4

import httpx

from . import extract, retrieval
from .config import settings
from .db import all_rows, connect, json, one
from .gateway import ModelGateway
from .storage import storage

log = logging.getLogger(__name__)
CLASS_RANK = {"general": 0, "division": 1, "commercial": 2, "personal": 3}
RECORD_CLASSES = ("commercial", "personal")
IDENTITY_FLAGS = {"nik", "npwp", "ktp"}
TABLE_KINDS = {"contract", "bast", "manpower", "proposal", "po", "invoice"}
MAX_BYTES = 20 * 1024 * 1024
MAX_ATTEMPTS = 3
LEASE_SECONDS = 600
SNIPPET = {"excerpt": 300, "full": 600}
# Mirrors ERP's seeded policy; used only when no ERP is connected (demo/tests without ERP).
DEFAULT_CATALOG = {
    "kinds": [
        {"kind": k, "label": k, "access_class": c}
        for k, c in (
            ("sop", "general"),
            ("policy", "general"),
            ("template", "general"),
            ("admin", "general"),
            ("proposal", "division"),
            ("manpower", "division"),
            ("report", "division"),
            ("contract", "commercial"),
            ("po", "commercial"),
            ("bast", "commercial"),
            ("invoice", "commercial"),
            ("cv", "personal"),
            ("appraisal", "personal"),
            ("other", "division"),
        )
    ],
    "classes": {
        "general": {"model_visibility": "full", "indexing": "semantic", "retention_days": 30},
        "division": {"model_visibility": "full", "indexing": "semantic", "retention_days": 30},
        "commercial": {"model_visibility": "none", "indexing": "lexical", "retention_days": 365},
        "personal": {"model_visibility": "none", "indexing": "lexical", "retention_days": 90},
    },
}


class FilesError(ValueError):
    def __init__(self, message, status=422):
        super().__init__(message)
        self.status = status


# ── ERP: policy, feed, bytes (machine) and per-user decisions (delegated) ──────────────────────────────────────────
def _machine(path, params=None, raw=False):
    cfg = settings()
    headers = {
        "Authorization": f"Bearer {cfg.erp_token}",
        "X-ERP-Audience": "celerates-intelligence",
        "X-ERP-Environment": cfg.erp_environment,
    }
    with httpx.Client(base_url=cfg.erp_base_url.rstrip("/") + "/", timeout=60, headers=headers) as client:
        response = client.get("files/" + path, params=params)
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return response if raw else response.json()


_catalog = {"at": 0.0, "value": None}


def catalog():
    """Kinds (with default classes) and per-class handling, as ERP declares them. Cached for a minute."""
    if settings().erp_mode != "http":
        return DEFAULT_CATALOG
    if _catalog["value"] is None or time.monotonic() - _catalog["at"] > 60:
        _catalog.update(value=_machine("catalog"), at=time.monotonic())
    return _catalog["value"]


def class_settings(access_class):
    return catalog()["classes"].get(access_class) or {"model_visibility": "none", "indexing": "none"}


def access_of(principal):
    """The user's file access, decided by ERP from its policy and the user's current access. Cached per principal."""
    cached = getattr(principal, "_file_access", None)
    if cached is None:
        cached = _erp(principal).files_access()
        principal._file_access = cached
    return cached


def _erp(principal):
    """The delegated ERP client of the current Agent run when there is one, else a new one for this principal."""
    from .agent.erp_client import DelegatedERP

    return getattr(principal, "_erp", None) or DelegatedERP(principal)


def _readable(principal, refs, entities):
    if not refs and not entities:
        return set(), set()
    out = _erp(principal).files_readable(sorted(refs), sorted(entities))
    return set(out.get("refs", [])), set(out.get("entities", []))


# ── authorization ──────────────────────────────────────────────────────────────────────────────────────────────────
def _auth_sql(access, principal):
    """SQL predicate over `files f` for class grants and state. Record checks for commercial/personal follow."""
    if access.get("owner"):
        return "(f.state='active' OR f.state='pending_review')", []
    return (
        """((f.state='active' OR (f.state='pending_review' AND f.created_by=%s)) AND (
             (f.access_class='general' AND %s)
          OR (f.access_class='division' AND f.owner_division = ANY(%s))
          OR (f.access_class='commercial' AND f.owner_division = ANY(%s))
          OR (f.access_class='personal' AND f.owner_division = ANY(%s))))""",
        [
            principal.sub,
            bool(access.get("general")),
            list(access.get("divisions", [])),
            list(access.get("commercial", [])),
            list(access.get("personal", [])),
        ],
    )


def _record_filter(principal, rows):
    """Keep commercial/personal files only when ERP says the user may read the file (erp origin) or at least one
    person-confirmed linked record (managed). Unlinked managed files rely on the class grant alone."""
    need = [r for r in rows if r["access_class"] in RECORD_CLASSES and r["origin"] != "external"]
    if not need:
        return rows
    ids = [r["id"] for r in need]
    with connect() as conn:
        links = all_rows(
            conn,
            "SELECT file_id, entity_type, entity_id FROM file_links WHERE file_id = ANY(%s) AND basis <> 'extracted'",
            (ids,),
        )
    by_file = {}
    for link in links:
        by_file.setdefault(link["file_id"], []).append(f"{link['entity_type']}:{link['entity_id']}")
    refs = {r["origin_ref"] for r in need if r["origin"] == "erp"}
    entities = {e for r in need if r["origin"] == "managed" for e in by_file.get(r["id"], [])}
    ok_refs, ok_entities = _readable(principal, refs, entities)
    keep = set()
    for r in need:
        if r["origin"] == "erp":
            if r["origin_ref"] in ok_refs:
                keep.add(r["id"])
        elif not by_file.get(r["id"]) or set(by_file[r["id"]]) & ok_entities:
            keep.add(r["id"])
    return [r for r in rows if r["access_class"] not in RECORD_CLASSES or r["origin"] == "external" or r["id"] in keep]


def visible(principal, file_id):
    access = access_of(principal)
    predicate, params = _auth_sql(access, principal)
    with connect() as conn:
        row = one(conn, f"SELECT f.* FROM files f WHERE f.id=%s AND {predicate}", (file_id, *params))
    if not row or not _record_filter(principal, [row]):
        raise FilesError("Berkas tidak ditemukan atau tidak tersedia untuk Anda.", 404)
    return row


def _can_manage(principal, row):
    return getattr(principal, "owner", False) or row["created_by"] == principal.sub


# ── managed uploads ────────────────────────────────────────────────────────────────────────────────────────────────
def _kind(kind):
    kinds = {k["kind"]: k for k in catalog()["kinds"]}
    if kind not in kinds:
        raise FilesError("Jenis berkas tidak dikenal.")
    return kinds[kind]


def _check_class(principal, access, access_class, owner_division, default_class):
    if access_class not in CLASS_RANK:
        raise FilesError("Kelas akses tidak dikenal.")
    if CLASS_RANK[access_class] < CLASS_RANK[default_class] and not access.get("owner"):
        raise FilesError(
            f"Jenis ini minimal berkelas {default_class}; kelas yang lebih longgar hanya dapat dipilih Owner."
        )
    if access_class != "general":
        if not owner_division:
            raise FilesError("Pilih divisi pemilik berkas.")
        allowed = access.get("divisions", []) if access_class == "division" else access.get(access_class, [])
        if not access.get("owner") and owner_division not in allowed:
            raise FilesError("Anda tidak memiliki akses kelas ini untuk divisi tersebut.", 403)


def _store_version(conn, file_id, version, name, body, principal, suffix, media):
    sha = hashlib.sha256(body).hexdigest()
    key = f"files/{file_id}/{version}/{sha}{suffix}"
    storage().put(key, body, media)
    return one(
        conn,
        """INSERT INTO file_versions(file_id,version,name,media_type,size_bytes,sha256,object_key,uploaded_by)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
        (file_id, version, Path(name).name[:200], media, len(body), sha, key, principal.sub),
    )


def create_managed(
    principal, name, body, *, kind, access_class=None, owner_division=None, title=None, link=None, provenance=None
):
    if not body or len(body) > MAX_BYTES:
        raise FilesError("Berkas kosong atau lebih dari 20 MB.", 413)
    suffix, media = extract.sniff(name, body)
    spec = _kind(kind)
    access = access_of(principal)
    access_class = access_class or spec["access_class"]
    owner_division = owner_division or None
    _check_class(principal, access, access_class, owner_division, spec["access_class"])
    if link:
        _, ok = _readable(principal, set(), {f"{link['type']}:{link['id']}"})
        if f"{link['type']}:{link['id']}" not in ok:
            raise FilesError("Record untuk ditautkan tidak tersedia untuk Anda.", 403)
    file_id = str(uuid4())
    with connect() as conn:
        one(
            conn,
            """INSERT INTO files(id,origin,kind,title,access_class,owner_division,current_version,created_by,
               created_by_name,provenance) VALUES (%s,'managed',%s,%s,%s,%s,1,%s,%s,%s) RETURNING id""",
            (
                file_id,
                kind,
                (title or Path(name).stem)[:200],
                access_class,
                owner_division,
                principal.sub,
                principal.display_name,
                json(provenance or {"from": "upload"}),
            ),
        )
        _store_version(conn, file_id, 1, name, body, principal, suffix, media)
        if link:
            conn.execute(
                """INSERT INTO file_links(file_id,entity_type,entity_id,label,href,basis,created_by)
                   VALUES (%s,%s,%s,%s,%s,'user',%s)""",
                (file_id, link["type"], link["id"], link.get("label"), link.get("href"), principal.sub),
            )
    return detail(principal, file_id)


def save_attachment(principal, dataset_id, *, kind, access_class=None, owner_division=None, title=None):
    """M6.x: the user explicitly saves an Agent attachment (working context) as a governed Company File.

    The attachment stays what it was: owner-only, conversation-scoped, purged after its retention. The Company File
    is an independent copy of the same bytes with a class the user chose (kind default is the minimum), its own
    versions, ingestion and retention, and provenance pointing back to the attachment. Idempotent per user and
    content: saving the same bytes again returns the existing file."""
    from .agent import datasets

    row = datasets.load(principal, dataset_id)
    if not row:
        raise FilesError("Lampiran tidak ditemukan untuk Anda.", 404)
    body = storage().get(row["object_key"])
    if hashlib.sha256(body).hexdigest() != row["sha256"]:
        raise FilesError("Isi lampiran tidak cocok dengan catatannya.", 409)
    with connect() as conn:
        existing = one(
            conn,
            """SELECT f.id FROM files f JOIN file_versions v ON v.file_id=f.id
               WHERE f.origin='managed' AND f.created_by=%s AND f.state<>'withdrawn' AND v.sha256=%s
               ORDER BY f.created_at LIMIT 1""",
            (principal.sub, row["sha256"]),
        )
    if existing:
        return {**detail(principal, existing["id"]), "already_saved": True}
    provenance = {"from": "agent_attachment", "dataset_id": row["id"], "name": row["name"], "kind": row["kind"]}
    saved = create_managed(
        principal,
        row["name"],
        body,
        kind=kind,
        access_class=access_class,
        owner_division=owner_division,
        title=title,
        provenance=provenance,
    )
    return {**saved, "already_saved": False}


def add_version(principal, file_id, name, body):
    row = visible(principal, file_id)
    if row["origin"] != "managed" or not _can_manage(principal, row):
        raise FilesError("Versi baru hanya untuk berkas yang Anda unggah.", 403)
    if not body or len(body) > MAX_BYTES:
        raise FilesError("Berkas kosong atau lebih dari 20 MB.", 413)
    suffix, media = extract.sniff(name, body)
    sha = hashlib.sha256(body).hexdigest()
    with connect() as conn:
        conn.execute("SELECT 1 FROM files WHERE id=%s FOR UPDATE", (file_id,))
        same = one(conn, "SELECT version FROM file_versions WHERE file_id=%s AND sha256=%s", (file_id, sha))
        if not same:
            version = one(conn, "SELECT max(version)+1 AS v FROM file_versions WHERE file_id=%s", (file_id,))["v"]
            _store_version(conn, file_id, version, name, body, principal, suffix, media)
            conn.execute("UPDATE files SET current_version=%s, updated_at=now() WHERE id=%s", (version, file_id))
    return detail(principal, file_id)


def act(principal, file_id, action, *, access_class=None, owner_division=None, link=None):
    """withdraw · reclassify (tighten by the uploader; loosen or release a PII hold only by an Owner) · link."""
    row = visible(principal, file_id)
    owner = bool(access_of(principal).get("owner"))
    if action == "withdraw":
        if row["origin"] != "managed" or not _can_manage(principal, row):
            raise FilesError(
                "Hanya pengunggah atau Owner yang dapat menarik berkas ini; berkas ERP dikelola di ERP.", 403
            )
        with connect() as conn:
            conn.execute(
                "UPDATE files SET state='withdrawn', withdrawn_at=now(), updated_at=now() WHERE id=%s", (file_id,)
            )
            conn.execute("DELETE FROM chunks WHERE file_id=%s", (file_id,))
    elif action == "reclassify":
        if row["origin"] != "managed" or not _can_manage(principal, row):
            raise FilesError("Kelas berkas ERP ditetapkan oleh ERP.", 403)
        access_class = access_class or row["access_class"]
        owner_division = owner_division or row["owner_division"]
        looser = CLASS_RANK.get(access_class, 99) < CLASS_RANK[row["access_class"]]
        if (looser or row["state"] == "pending_review") and not owner:
            raise FilesError("Melonggarkan kelas atau melepas penahanan hanya dapat dilakukan Owner.", 403)
        _check_class(principal, access_of(principal), access_class, owner_division, _kind(row["kind"])["access_class"])
        with connect() as conn:
            conn.execute(
                """UPDATE files SET access_class=%s, owner_division=%s, updated_at=now(),
                   state=CASE WHEN state='pending_review' THEN 'active' ELSE state END WHERE id=%s""",
                (access_class, owner_division, file_id),
            )
    elif action == "link":
        key = f"{link['type']}:{link['id']}"
        _, ok = _readable(principal, set(), {key})
        if key not in ok:
            raise FilesError("Record untuk ditautkan tidak tersedia untuk Anda.", 403)
        with connect() as conn:
            conn.execute(
                """INSERT INTO file_links(file_id,entity_type,entity_id,label,href,basis,created_by)
                   VALUES (%s,%s,%s,%s,%s,'user',%s) ON CONFLICT (file_id,entity_type,entity_id) DO NOTHING""",
                (file_id, link["type"], link["id"], link.get("label"), link.get("href"), principal.sub),
            )
    else:
        raise FilesError("Aksi tidak dikenal.")
    return detail(principal, file_id) if action != "withdraw" else {"id": file_id, "state": "withdrawn"}


# ── reading ────────────────────────────────────────────────────────────────────────────────────────────────────────
def _card(row, links, purpose, hit=None):
    policy = class_settings(row["access_class"])
    shown = purpose == "ui" or policy["model_visibility"] != "none"
    limit = SNIPPET.get(policy["model_visibility"], 600) if purpose == "agent" else 600
    item = {
        "id": row["id"],
        "title": row["title"],
        "kind": row["kind"],
        "access_class": row["access_class"],
        "origin": row["origin"],
        "owner_division": row["owner_division"],
        "state": row["state"],
        "version": row["current_version"],
        "open_url": row.get("open_url"),
        "links": [{k: link[k] for k in ("entity_type", "entity_id", "label", "href")} for link in links],
        "content_shared": shown,
    }
    if hit:
        item.update(page=hit.get("page_from"), heading=hit.get("heading"), block=hit.get("block"))
        if shown:
            text = " ".join(str(hit.get("text") or "").split())
            item["snippet"] = text[:limit] + ("…" if len(text) > limit else "")
    return item


def _links(ids):
    with connect() as conn:
        rows = all_rows(conn, "SELECT * FROM file_links WHERE file_id = ANY(%s) ORDER BY created_at", (list(ids),))
    out = {}
    for r in rows:
        out.setdefault(r["file_id"], []).append(r)
    return out


def search(principal, query, *, kinds=None, entity=None, limit=10, purpose="ui"):
    """Files the user may read, ranked by content (lexical, and vector for semantic classes) and title/link match.
    For `purpose='agent'`, content is returned only for classes whose ERP policy shares it with the model."""
    access = access_of(principal)
    predicate, params = _auth_sql(access, principal)
    embedding, model = ModelGateway().embed(query) if query else ([0.0], None)
    semantic = bool(query) and model != retrieval.DEMO_EMBEDDING
    filters, fparams = [], []
    if kinds:
        filters.append("f.kind = ANY(%s)")
        fparams.append(list(kinds))
    if entity:
        filters.append(
            "EXISTS (SELECT 1 FROM file_links l WHERE l.file_id=f.id AND l.entity_type=%s AND l.entity_id=%s AND l.basis<>'extracted')"
        )
        fparams += [entity["type"], entity["id"]]
    where = " AND ".join([predicate, *filters])
    with connect() as conn:
        if not query:
            rows = all_rows(
                conn,
                f"SELECT f.*, NULL::int AS page_from, NULL AS heading, NULL AS block, NULL AS text, 0 AS score "
                f"FROM files f WHERE {where} ORDER BY f.updated_at DESC LIMIT %s",
                (*params, *fparams, limit * 3),
            )
        else:
            rows = all_rows(
                conn,
                f"""WITH q AS (SELECT {retrieval.TSQUERY_SQL} AS terms), f AS MATERIALIZED (
                      SELECT f.* FROM files f WHERE {where}
                    ), titles AS (
                      SELECT f.id, to_tsvector('simple', f.title || ' ' || f.kind || ' ' ||
                             coalesce((SELECT string_agg(coalesce(l.label,''),' ') FROM file_links l WHERE l.file_id=f.id),''))
                             || to_tsvector('indonesian', f.title) AS v FROM f
                    ), scored AS (
                      SELECT c.id AS chunk_id, c.file_id, c.page_from, c.heading, c.block, c.text,
                             (c.search_multi @@ q.terms) AS lexical_match, ts_rank_cd(c.search_multi, q.terms) AS lexical,
                             CASE WHEN %s AND c.embedding_model=%s THEN 1-(c.embedding <=> %s::vector) END AS vector
                      FROM f JOIN chunks c ON c.file_id=f.id AND c.file_version=f.current_version CROSS JOIN q
                    ), admitted AS (
                      SELECT *, row_number() OVER (ORDER BY lexical DESC, chunk_id) AS lrank,
                                row_number() OVER (ORDER BY vector DESC NULLS LAST, chunk_id) AS vrank
                      FROM scored WHERE lexical_match OR (vector IS NOT NULL AND vector >= 0.5)
                    ), best AS (
                      SELECT DISTINCT ON (file_id) file_id, page_from, heading, block, text,
                             (CASE WHEN lexical_match THEN 1.0/({retrieval.RRF_K}+lrank) ELSE 0 END
                              + CASE WHEN vector IS NOT NULL THEN 1.0/({retrieval.RRF_K}+vrank) ELSE 0 END) AS score
                      FROM admitted ORDER BY file_id, score DESC
                    ), meta AS (
                      SELECT t.id AS file_id, 0.5/({retrieval.RRF_K}+1) AS score FROM titles t, q WHERE t.v @@ q.terms
                    )
                    SELECT f.*, b.page_from, b.heading, b.block, b.text,
                           coalesce(b.score,0) + coalesce(m.score,0) AS score
                    FROM f LEFT JOIN best b ON b.file_id=f.id LEFT JOIN meta m ON m.file_id=f.id
                    WHERE b.file_id IS NOT NULL OR m.file_id IS NOT NULL
                    ORDER BY score DESC, f.updated_at DESC LIMIT %s""",
                (
                    *retrieval.tsquery_params(query),
                    *params,
                    *fparams,
                    semantic,
                    model,
                    str(embedding),
                    limit * 3,
                ),
            )
    rows = _record_filter(principal, rows)[:limit]
    links = _links([r["id"] for r in rows])
    return [_card(r, links.get(r["id"], []), purpose, r) for r in rows]


def read(principal, file_id, query=None, *, limit=4, purpose="ui"):
    """Passages of one file, page-cited. For `agent`, withheld (metadata only) when the class is model-hidden."""
    row = visible(principal, file_id)
    links = _links([file_id]).get(file_id, [])
    card = _card(row, links, purpose)
    if not card["content_shared"]:
        return {"file": card, "passages": [], "withheld": True}
    with connect() as conn:
        if query:
            passages = all_rows(
                conn,
                f"""WITH q AS (SELECT {retrieval.TSQUERY_SQL} AS terms)
                    SELECT c.ordinal, c.page_from AS page, c.heading, c.block, c.text, ts_rank_cd(c.search_multi, q.terms) AS rank
                    FROM chunks c, q WHERE c.file_id=%s AND c.file_version=%s AND c.search_multi @@ q.terms
                    ORDER BY rank DESC, c.ordinal LIMIT %s""",
                (*retrieval.tsquery_params(query), file_id, row["current_version"], limit),
            )
        else:
            passages = all_rows(
                conn,
                """SELECT ordinal, page_from AS page, heading, block, text FROM chunks
                   WHERE file_id=%s AND file_version=%s ORDER BY ordinal LIMIT %s""",
                (file_id, row["current_version"], limit),
            )
        if purpose == "agent":
            _log(conn, principal, row, "agent_read", "agent")
    return {"file": card, "passages": passages, "withheld": False}


def for_entity(principal, entity_type, entity_id, *, purpose="ui"):
    return search(principal, "", entity={"type": entity_type, "id": entity_id}, limit=20, purpose=purpose)


def detail(principal, file_id):
    row = visible(principal, file_id)
    with connect() as conn:
        versions = all_rows(
            conn,
            """SELECT version,name,media_type,size_bytes,created_at,ingest_state,error,parser,pages,ocr_pages,tables,
                      flags,indexed_at FROM file_versions WHERE file_id=%s ORDER BY version DESC""",
            (file_id,),
        )
    card = _card(row, _links([file_id]).get(file_id, []), "ui")
    for v in versions:
        v["flags"] = sorted((v.get("flags") or {}).get("pii", []))  # names only, never values
    return {
        **card,
        "created_by_name": row["created_by_name"],
        "created_at": row["created_at"],
        "provenance": {k: row["provenance"].get(k) for k in ("from", "name") if row.get("provenance")},
        "versions": versions,
        "can_manage": row["origin"] == "managed" and _can_manage(principal, row),
    }


def content(principal, file_id, action="download"):
    """Bytes of a managed file (current version) for preview/download, logged. ERP files open in ERP."""
    row = visible(principal, file_id)
    if row["origin"] != "managed":
        raise FilesError("Berkas ini dibuka dari ERP.", 409)
    with connect() as conn:
        version = one(
            conn,
            "SELECT * FROM file_versions WHERE file_id=%s AND version=%s",
            (file_id, row["current_version"]),
        )
        _log(conn, principal, row, action, "erp_ui")
    body = storage().get(version["object_key"])
    if hashlib.sha256(body).hexdigest() != version["sha256"]:
        raise FilesError("Isi berkas tidak cocok dengan catatannya.", 409)
    return body, version["media_type"], version["name"]


def _log(conn, principal, row, action, via):
    conn.execute(
        """INSERT INTO file_access_log(file_id,version,principal_sub,principal_name,action,via)
           VALUES (%s,%s,%s,%s,%s,%s)""",
        (row["id"], row["current_version"], principal.sub, getattr(principal, "display_name", None), action, via),
    )


def log_open(principal, file_id):
    """An ERP-origin file opened through ERP from Company Files: recorded for accountability."""
    row = visible(principal, file_id)
    with connect() as conn:
        _log(conn, principal, row, "preview", "erp_ui")
    return row.get("open_url")


# ── ingestion (worker) ─────────────────────────────────────────────────────────────────────────────────────────────
def claim():
    """One version to ingest: queued, a stale lease, or a failed one whose backoff elapsed (≤ 3 attempts)."""
    with connect() as conn:
        return one(
            conn,
            """UPDATE file_versions v SET ingest_state='running', attempts=v.attempts+1,
                      lease_until=now() + %s * interval '1 second'
               WHERE (v.file_id, v.version) = (
                 SELECT file_id, version FROM file_versions
                 WHERE ingest_state='queued'
                    OR (ingest_state='running' AND lease_until < now())
                    OR (ingest_state='failed' AND attempts < %s AND lease_until < now())
                 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
               RETURNING v.*""",
            (LEASE_SECONDS, MAX_ATTEMPTS),
        )


def _bytes(file, version):
    if file["origin"] == "managed":
        body = storage().get(version["object_key"])
        if hashlib.sha256(body).hexdigest() != version["sha256"]:
            raise ValueError("Object checksum mismatch")
        return body
    response = _machine("content", {"ref": file["origin_ref"]}, raw=True)
    if response is None:
        raise LookupError("ERP no longer serves this file")
    return response.content


def ingest(version, converter=None):
    with connect() as conn:
        file = one(conn, "SELECT * FROM files WHERE id=%s", (version["file_id"],))
    policy = class_settings(file["access_class"])
    try:
        if file["state"] == "withdrawn" or file["origin"] == "external":
            return _finish(version, "metadata_only", flags={"reason": file["origin"]})
        if policy["indexing"] == "none":
            return _finish(version, "metadata_only", flags={"reason": "policy"})
        body = _bytes(file, version)
        if len(body) > MAX_BYTES:
            return _finish(version, "metadata_only", flags={"reason": "too_large"})
        name = extract.named(version["name"], body)
        _, media = extract.sniff(name, body)
        got = extract.extract(name, body, want_tables=file["kind"] in TABLE_KINDS, converter=converter)
        text = got.text
        pii = extract.pii_flags(text)
        flags = {"pii": pii, "scanned": got.scanned}
        pieces = extract.chunks(got.pages)
        semantic = policy["indexing"] == "semantic"
        gateway = ModelGateway()
        with connect() as conn:
            conn.execute("DELETE FROM chunks WHERE file_id=%s AND file_version=%s", (file["id"], version["version"]))
            for piece in pieces:
                embedding, model = gateway.embed(piece["text"]) if semantic else (None, None)
                conn.execute(
                    """INSERT INTO chunks(id,file_id,file_version,ordinal,text,embedding,embedding_model,page_from,
                       page_to,heading,block) VALUES (%s,%s,%s,%s,%s,%s::vector,%s,%s,%s,%s,%s)""",
                    (
                        f"file:{file['id']}:{version['version']}:{piece['ordinal']}",
                        file["id"],
                        version["version"],
                        piece["ordinal"],
                        piece["text"],
                        str(embedding) if embedding else None,
                        model,
                        piece["page"],
                        piece["page"],
                        piece["heading"],
                        piece["block"],
                    ),
                )
            # Identity-document patterns in a broadly readable class hold the file for review (tighten only).
            if file["access_class"] in ("general", "division") and IDENTITY_FLAGS & set(pii):
                conn.execute(
                    "UPDATE files SET state='pending_review', updated_at=now() WHERE id=%s AND state='active'",
                    (file["id"],),
                )
            conn.execute(
                """UPDATE file_versions SET ingest_state=%s, error=NULL, lease_until=NULL, parser=%s, pages=%s,
                   ocr_pages=%s, tables=%s, flags=%s, extracted=%s, indexed_at=now(), media_type=%s,
                   size_bytes=coalesce(size_bytes,%s), sha256=coalesce(sha256,%s)
                   WHERE file_id=%s AND version=%s""",
                (
                    "indexed" if pieces else "metadata_only",
                    got.parser,
                    max((p for p, _ in got.pages), default=0),
                    got.ocr_pages,
                    got.tables,
                    json(flags),
                    json({"headings": extract.headings(got.pages)}),
                    media,
                    len(body),
                    hashlib.sha256(body).hexdigest(),
                    file["id"],
                    version["version"],
                ),
            )
        return "indexed" if pieces else "metadata_only"
    except Exception as exc:  # recorded and retried with backoff; the message never carries content
        log.warning("File ingestion failed for %s v%s: %s", version["file_id"], version["version"], type(exc).__name__)
        with connect() as conn:
            conn.execute(
                """UPDATE file_versions SET ingest_state='failed', error=%s,
                   lease_until=now() + (attempts * 300) * interval '1 second' WHERE file_id=%s AND version=%s""",
                (f"{type(exc).__name__}: {exc}"[:300], version["file_id"], version["version"]),
            )
        return "failed"


def _finish(version, state, flags=None):
    with connect() as conn:
        conn.execute(
            """UPDATE file_versions SET ingest_state=%s, lease_until=NULL, error=NULL, flags=%s, indexed_at=now()
               WHERE file_id=%s AND version=%s""",
            (state, json(flags or {}), version["file_id"], version["version"]),
        )
    return state


def tick(converter=None):
    version = claim()
    if not version:
        return False
    ingest(version, converter=converter)
    return True


# ── ERP feed sync (worker) ─────────────────────────────────────────────────────────────────────────────────────────
def sync_erp():
    """Reconcile ERP-declared files: new → registered and queued; changed (etag) → new version; class/kind/links as ERP
    declares them; absent from a complete pass → withdrawn and unindexed. Returns counts."""
    if settings().erp_mode != "http":
        return None
    started = one_value("SELECT now() AS t")
    after, counts = "", {"seen": 0, "new": 0, "versions": 0, "withdrawn": 0}
    while True:
        page = _machine("feed", {"after": after, "limit": 200})
        for item in page["items"]:
            counts["seen"] += 1
            outcome = _upsert_erp(item)
            counts["new"] += outcome == "new"
            counts["versions"] += outcome in ("new", "version")
        if not page.get("next"):
            break
        after = page["next"]
    with connect() as conn:
        gone = all_rows(
            conn,
            """UPDATE files SET state='withdrawn', withdrawn_at=now(), updated_at=now()
               WHERE origin IN ('erp','external') AND state<>'withdrawn' AND (seen_at IS NULL OR seen_at < %s)
               RETURNING id""",
            (started,),
        )
        if gone:
            conn.execute("DELETE FROM chunks WHERE file_id = ANY(%s)", ([g["id"] for g in gone],))
    counts["withdrawn"] = len(gone)
    return counts


def one_value(sql):
    with connect() as conn:
        return one(conn, sql)["t"]


def _upsert_erp(item):
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("file:" + item["ref"],))
        row = one(conn, "SELECT * FROM files WHERE origin=%s AND origin_ref=%s", (item["origin"], item["ref"]))
        outcome = "same"
        if not row:
            row = one(
                conn,
                """INSERT INTO files(id,origin,origin_ref,kind,title,access_class,owner_division,current_version,
                   open_url,created_by,created_by_name,seen_at) VALUES (%s,%s,%s,%s,%s,%s,%s,1,%s,'erp','ERP',now())
                   RETURNING *""",
                (
                    str(uuid4()),
                    item["origin"],
                    item["ref"],
                    item["kind"],
                    item["name"][:200],
                    item["access_class"],
                    item["owner_division"],
                    item["open_url"],
                ),
            )
            conn.execute(
                """INSERT INTO file_versions(file_id,version,name,origin_etag,uploaded_by,ingest_state)
                   VALUES (%s,1,%s,%s,'erp',%s)""",
                (
                    row["id"],
                    item["name"][:200],
                    item["etag"],
                    "metadata_only" if item["origin"] == "external" else "queued",
                ),
            )
            outcome = "new"
        else:
            current = one(
                conn,
                "SELECT origin_etag FROM file_versions WHERE file_id=%s AND version=%s",
                (row["id"], row["current_version"]),
            )
            version = row["current_version"]
            if current and current["origin_etag"] != item["etag"]:
                version += 1
                conn.execute(
                    """INSERT INTO file_versions(file_id,version,name,origin_etag,uploaded_by,ingest_state)
                       VALUES (%s,%s,%s,%s,'erp',%s)""",
                    (
                        row["id"],
                        version,
                        item["name"][:200],
                        item["etag"],
                        "metadata_only" if item["origin"] == "external" else "queued",
                    ),
                )
                outcome = "version"
            conn.execute(
                """UPDATE files SET kind=%s, title=%s, access_class=%s, owner_division=%s, open_url=%s, current_version=%s,
                   seen_at=now(), updated_at=CASE WHEN %s THEN now() ELSE updated_at END,
                   state=CASE WHEN state='withdrawn' THEN 'active' ELSE state END, withdrawn_at=NULL WHERE id=%s""",
                (
                    item["kind"],
                    item["name"][:200],
                    item["access_class"],
                    item["owner_division"],
                    item["open_url"],
                    version,
                    outcome != "same",
                    row["id"],
                ),
            )
        entity = item.get("entity") or {}
        if entity.get("id"):
            conn.execute(
                """INSERT INTO file_links(file_id,entity_type,entity_id,label,href,basis,created_by)
                   VALUES (%s,%s,%s,%s,%s,'erp_declared','erp')
                   ON CONFLICT (file_id,entity_type,entity_id) DO UPDATE SET label=EXCLUDED.label, href=EXCLUDED.href""",
                (row["id"], entity["type"], entity["id"], entity.get("label"), entity.get("href")),
            )
    return outcome


# ── retention ──────────────────────────────────────────────────────────────────────────────────────────────────────
def purge():
    """Withdrawn managed files past their class retention (and not on hold): objects and chunks deleted; the registry
    row stays as a tombstone for the access log."""
    removed = 0
    for access_class, policy in catalog()["classes"].items():
        with connect() as conn:
            rows = all_rows(
                conn,
                """SELECT v.file_id, v.version, v.object_key FROM files f JOIN file_versions v ON v.file_id=f.id
                   WHERE f.origin='managed' AND f.state='withdrawn' AND f.hold IS NULL AND f.access_class=%s
                     AND v.object_key IS NOT NULL AND f.withdrawn_at < now() - %s * interval '1 day'""",
                (access_class, int(policy.get("retention_days", 30))),
            )
        for r in rows:
            storage().delete(r["object_key"])
            with connect() as conn:
                conn.execute(
                    "UPDATE file_versions SET object_key=NULL WHERE file_id=%s AND version=%s",
                    (r["file_id"], r["version"]),
                )
                conn.execute("DELETE FROM chunks WHERE file_id=%s", (r["file_id"],))
            removed += 1
    return removed


# ── Brain Console ──────────────────────────────────────────────────────────────────────────────────────────────────
def console_overview():
    with connect() as conn:
        return {
            "files": all_rows(
                conn,
                """SELECT origin, access_class, state, count(*)::int AS n FROM files GROUP BY 1,2,3 ORDER BY 1,2,3""",
            ),
            "ingestion": all_rows(
                conn,
                """SELECT ingest_state, count(*)::int AS n, coalesce(sum(ocr_pages),0)::int AS ocr_pages
                   FROM file_versions GROUP BY 1 ORDER BY 1""",
            ),
            "failures": all_rows(
                conn,
                """SELECT v.file_id, v.version, f.title, f.kind, f.origin, v.attempts, v.error, v.created_at
                   FROM file_versions v JOIN files f ON f.id=v.file_id WHERE v.ingest_state='failed'
                   ORDER BY v.created_at DESC LIMIT 20""",
            ),
            "holds": all_rows(
                conn,
                """SELECT f.id, f.title, f.kind, f.access_class, f.owner_division, f.created_by_name, f.created_at,
                          (SELECT v.flags->'pii' FROM file_versions v WHERE v.file_id=f.id ORDER BY version DESC LIMIT 1) AS pii
                   FROM files f WHERE f.state='pending_review' ORDER BY f.created_at DESC LIMIT 20""",
            ),
            "access": all_rows(
                conn,
                """SELECT l.at, l.action, l.via, l.principal_name, f.title, f.access_class FROM file_access_log l
                   JOIN files f ON f.id=l.file_id ORDER BY l.at DESC LIMIT 20""",
            ),
        }


def retry(file_id, version):
    with connect() as conn:
        return one(
            conn,
            """UPDATE file_versions SET ingest_state='queued', attempts=0, error=NULL, lease_until=NULL
               WHERE file_id=%s AND version=%s AND ingest_state='failed' RETURNING file_id""",
            (file_id, version),
        )


def withdraw_held(file_id):
    """Curator: a file held for identity-document patterns is withdrawn (it can be re-uploaded with the right class)."""
    with connect() as conn:
        row = one(
            conn,
            """UPDATE files SET state='withdrawn', withdrawn_at=now(), updated_at=now()
               WHERE id=%s AND state='pending_review' RETURNING id""",
            (file_id,),
        )
        if row:
            conn.execute("DELETE FROM chunks WHERE file_id=%s", (file_id,))
    return row
