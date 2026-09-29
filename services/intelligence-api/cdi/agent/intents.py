"""Masukan, understood (ADR-017). Free text in the one Agent composer can be a question, an action request, or one of
four kinds of feedback. Questions and actions follow the normal `ask` path; the four feedback intents end in a draft
the user reviews before anything is submitted:

* ``feature_request``      → ERP-held proposal `feature_request.create` (the existing proposal card; ERP applies)
* ``data_correction``      → ERP-held proposal `task.create` linked to the record, for the data owner to verify.
                              A complaint never edits business data directly.
* ``knowledge_correction`` → Intelligence-held draft; once sent, it waits for a curator (Brain Console)
* ``agent_feedback``       → Intelligence-held draft about the previous answer in this conversation

With a model, the model chooses the intent (``{"route": …}`` in reasoning.py). Without one, the deterministic router
only *notices* feedback-like wording and offers these intents as choices; the user picks. Either way the same
`prepare` builds the draft, so there is one routing substrate, not one branch per kind of complaint."""

import re
from datetime import datetime, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from ..db import all_rows, connect, one
from ..db import json as dbjson
from .tools import PolicyError, invoke, register

JAKARTA = ZoneInfo("Asia/Jakarta")
INTENTS = {
    "feature_request": "Feature Request",
    "data_correction": "Koreksi data",
    "knowledge_correction": "Koreksi pengetahuan",
    "agent_feedback": "Umpan balik untuk Agent",
}
OFFER = {
    "feature_request": "Jadikan Feature Request",
    "data_correction": "Laporkan koreksi data",
    "knowledge_correction": "Koreksi pengetahuan",
    "agent_feedback": "Jawaban Agent keliru",
}
FR_TYPES = ("improvement", "bug_fix", "new_feature", "data_fix")
REASONS = ("wrong", "incomplete", "irrelevant", "other")
MAX_TEXT = 1000

# Wording that suggests the user is giving feedback rather than asking. Only used to *offer* intents (no model).
CUES = re.compile(
    r"\b(harusnya|seharusnya|sebaiknya|mestinya|semestinya|tolong (?:tambah|perbaiki|ubah|ganti)\w*|perbaiki|"
    r"tambahkan|fitur|bug|error|eror|gagal|tidak bisa|nggak bisa|gak bisa|ga bisa|tidak muncul|salah|keliru|"
    r"sudah (?:berubah|tidak berlaku|diganti)|kurang tepat|usul|saran|should|wrong|broken|outdated|feature|"
    # MS2: usability complaints on a page ("tabel ini susah dipakai di HP") are feedback too.
    r"susah|sulit|ribet|bingung|membingungkan|kurang jelas|tidak jelas|kurang kelihatan|tidak kelihatan|hard to use|confusing)\b",
    re.I,
)
AGENT_CUES = re.compile(r"\b(jawaban(mu| kamu| agent| tadi| sebelumnya)?|kamu salah|agent salah|answer)\b", re.I)
KNOWLEDGE_CUES = re.compile(r"\b(sop|kebijakan|policy|prosedur|panduan|aturan kerja|pengetahuan|knowledge)\b", re.I)


def cues(text):
    return bool(CUES.search(text or ""))


def title_from(text, n=80):
    first = re.split(r"(?<=[.!?])\s|\n", " ".join(str(text).split()), maxsplit=1)[0]
    return first if len(first) <= n else first[: n - 1].rstrip() + "…"


def fr_type(text):
    t = text.lower()
    if re.search(r"\b(bug|error|eror|gagal|tidak bisa|nggak bisa|gak bisa|ga bisa|tidak muncul|broken)\b", t):
        return "bug_fix"
    if re.search(r"\b(fitur baru|tambahkan|tambah fitur|new feature|belum ada)\b", t):
        return "new_feature"
    return "improvement"


def previous_answer(run):
    """The user's previous *answer* in the same conversation (for agent feedback and follow-up questions): feedback
    turns themselves are skipped. None when there is none."""
    with connect() as conn:
        prev = one(
            conn,
            """SELECT id,skill,input FROM agent_runs WHERE thread_id=%s AND principal_sub=%s AND id<>%s
               AND state='succeeded' AND created_at < (SELECT created_at FROM agent_runs WHERE id=%s)
               AND skill <> 'route_feedback' AND NOT coalesce(result ? 'intent', false)
               AND coalesce(result->>'feedback_offered', 'false') <> 'true'
               ORDER BY created_at DESC LIMIT 1""",
            (run["thread_id"], run["principal_sub"], run["id"], run["id"]),
        )
        if not prev:
            return None
        rows = all_rows(
            conn,
            "SELECT event FROM agent_steps WHERE run_id=%s AND type='TEXT_MESSAGE_CONTENT' ORDER BY seq",
            (prev["id"],),
        )
    answer = " ".join(r["event"].get("delta", "") for r in rows)
    question = (prev["input"] or {}).get("query") or prev["skill"]
    return {"run_id": prev["id"], "question": str(question)[:300], "answer": " ".join(answer.split())[:600]}


# ── Intelligence-held drafts ────────────────────────────────────────────────────────────────────────────────────────
@register(
    "draft_submission",
    "1",
    "Hold a knowledge correction or Agent feedback as the user's draft; nothing is sent until they review it",
    risk="propose",
)
def draft_submission(ctx, intent, title, body, refs=(), subject_run_id=None, reason=None):
    if intent not in ("knowledge_correction", "agent_feedback"):
        raise PolicyError("Jenis masukan ini tidak disimpan sebagai draf Intelligence")
    run = ctx.recorder.run
    with connect() as conn:
        row = one(
            conn,
            """INSERT INTO agent_submissions(id,run_id,principal_sub,principal_name,intent,title,body,refs,
               subject_run_id,reason) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id,intent,state,title""",
            (
                str(uuid4()),
                run["id"],
                ctx.principal.sub,
                ctx.principal.display_name,
                intent,
                title[:200],
                body[:3000],
                dbjson(list(refs)),
                subject_run_id,
                reason,
            ),
        )
    return row


def _knowledge_refs(passages):
    refs = []
    for p in passages[:3]:
        refs.append(
            {
                "ref": f"knowledge:{p['document_id']}",
                "source_id": p["source_id"],
                "label": f"{p['title']} · v{p['version']}",
                "scope": p.get("scope"),
            }
        )
    return refs


def prepare(
    ctx,
    intent,
    text,
    *,
    title=None,
    detail=None,
    expected=None,
    fr_kind=None,
    target=None,
    refs=None,
    reason=None,
    chosen_by="user",
):
    """Build the reviewable draft for one feedback intent. Returns the playbook result.

    `target` ({type, id}) is an ERP record for a data correction; `refs` are knowledge passages for a knowledge
    correction. `chosen_by` is "user" (deterministic: the user picked the intent) or "model" (inference)."""
    from .playbooks import _proposal_lines

    text = " ".join(str(text).split())[:MAX_TEXT]
    title = (title or title_from(text)).strip()[:200]
    detail = (detail or text).strip()[:3000]
    ctx.recorder.evidence(
        [
            {
                "type": "inference" if chosen_by == "model" else "observation",
                "title": f"Jenis masukan: {INTENTS[intent]}" + (" (dipilih Anda)" if chosen_by == "user" else ""),
                "detail": [f"“{title}”"],
                "source": {"kind": "intent", "ref": intent},
            }
        ]
    )
    result = {"skill": "route_feedback", "intent": intent, "chosen_by": chosen_by}
    if intent == "feature_request":
        kind = fr_kind if fr_kind in FR_TYPES else fr_type(text)
        params = {"title": title, "description": detail, "request_type_code": kind, "context_path": ctx.path}
        if expected:
            params["expected_behavior"] = str(expected)[:3000]
        with ctx.recorder.step("Menyiapkan Feature Request di ERP"):
            proposal = invoke(
                ctx,
                "erp_propose",
                title=f"Feature Request: {title}"[:200],
                items=[{"kind": "feature_request.create", "target": None, "params": params}],
            )
        ctx.recorder.proposal({"id": proposal["id"], "title": proposal["title"]})
        ctx.recorder.message(
            "\n".join([f"Saya siapkan sebagai Feature Request dari halaman {ctx.path}."] + _proposal_lines(proposal))
        )
        return {**result, "proposal": proposal["id"]}
    if intent == "data_correction":
        if not target:
            ctx.recorder.message(
                "Record mana yang datanya perlu dikoreksi? Sebutkan nomornya (mis. REQ-…) atau buka record-nya lalu "
                "kirim ulang. Koreksi data selalu diteruskan ke pemilik data sebagai tugas, bukan diubah langsung."
            )
            return {**result, "proposal": None, "missing": "target"}
        with ctx.recorder.step("Membaca record yang dilaporkan"):
            entity = invoke(ctx, "erp_read_entity", entity_type=target["type"], entity_id=target["id"])["entity"]
        due = (datetime.now(JAKARTA).date() + timedelta(days=3)).isoformat()
        params = {
            "title": f"Koreksi data {entity['label']}: {title}"[:200],
            "description": (
                f"{detail}\n\nDilaporkan melalui Celerates Agent. Verifikasi dengan sumbernya sebelum mengubah data."
            )[:2000],
            "due_date": due,
        }
        with ctx.recorder.step("Menyiapkan tugas koreksi data di ERP"):
            proposal = invoke(
                ctx,
                "erp_propose",
                title=f"Koreksi data: {entity['type_label']} {entity['label']}"[:200],
                items=[
                    {"kind": "task.create", "target": {"type": entity["type"], "id": entity["id"]}, "params": params}
                ],
            )
        ctx.recorder.proposal({"id": proposal["id"], "title": proposal["title"]})
        ctx.recorder.message(
            "\n".join(
                [
                    f"Saya siapkan tugas koreksi untuk {entity['type_label']} {entity['label']}. Data belum diubah: "
                    "pemilik data memverifikasi lalu memperbaikinya di ERP."
                ]
                + _proposal_lines(proposal)
            )
        )
        return {**result, "proposal": proposal["id"], "target": f"{entity['type']}/{entity['id']}"}
    if intent == "knowledge_correction":
        if refs is None:
            with ctx.recorder.step("Mencari pengetahuan yang dikoreksi"):
                passages = invoke(ctx, "knowledge_search", query=text[:200])["passages"]
            refs = _knowledge_refs(passages)
        with ctx.recorder.step("Menyiapkan draf koreksi pengetahuan"):
            draft = invoke(ctx, "draft_submission", intent=intent, title=title, body=detail, refs=refs)
        ctx.recorder.submission(
            {
                "id": draft["id"],
                "intent": intent,
                "label": INTENTS[intent],
                "title": title,
                "body": detail,
                "refs": [r["label"] for r in refs],
            }
        )
        ctx.recorder.message(
            "Saya siapkan sebagai koreksi pengetahuan"
            + (f" untuk {refs[0]['label']}" if refs else "")
            + ". Tinjau lalu kirim: kurator memeriksanya di Brain Console sebelum pengetahuan berubah."
        )
        return {**result, "submission": draft["id"], "refs": [r["ref"] for r in refs]}
    # agent_feedback
    previous = previous_answer(ctx.recorder.run)
    if not previous:
        ctx.recorder.message(
            "Belum ada jawaban sebelumnya di percakapan ini untuk dinilai. Gunakan tombol 👍/👎 di bawah jawaban."
        )
        return {**result, "submission": None}
    why = reason if reason in REASONS else ("wrong" if re.search(r"\b(salah|keliru|wrong)\b", text, re.I) else "other")
    with ctx.recorder.step("Menyiapkan umpan balik untuk jawaban sebelumnya"):
        draft = invoke(
            ctx,
            "draft_submission",
            intent=intent,
            title=title,
            body=detail,
            refs=[],
            subject_run_id=previous["run_id"],
            reason=why,
        )
    ctx.recorder.submission(
        {
            "id": draft["id"],
            "intent": intent,
            "label": INTENTS[intent],
            "title": title,
            "body": detail,
            "refs": [f"Jawaban untuk: {previous['question']}"],
        }
    )
    ctx.recorder.message(
        f"Saya catat sebagai umpan balik untuk jawaban “{previous['question']}”. Tinjau lalu kirim; tim melihatnya di "
        "Brain Console bersama jejak jawabannya."
    )
    return {**result, "submission": draft["id"], "subject_run_id": previous["run_id"]}


def alternatives(chosen, text, target=None):
    """After a model route: the other kinds, so the user can correct the model's choice (a new, reviewed draft)."""
    base = {"text": " ".join(str(text).split())[:MAX_TEXT]}
    items = []
    for intent in ("feature_request", "data_correction", "knowledge_correction"):
        if intent == chosen or (intent == "data_correction" and not target):
            continue
        args = {
            **base,
            **({"entity_type": target["type"], "entity_id": target["id"]} if intent == "data_correction" else {}),
        }
        items.append(
            {"label": f"Bukan ini: {OFFER[intent]}", "skill": "route_feedback", "args": {"intent": intent, **args}}
        )
    return items


def offers(text, *, target=None, passages=(), has_previous=False):
    """Deterministic: feedback intents the user may choose for this text, as next-step actions."""
    items = []
    base = {"text": " ".join(str(text).split())[:MAX_TEXT]}
    if target:
        items.append(("data_correction", {**base, "entity_type": target["type"], "entity_id": target["id"]}))
    if passages or KNOWLEDGE_CUES.search(text):
        items.append(("knowledge_correction", base))
    if has_previous and AGENT_CUES.search(text):
        items.append(("agent_feedback", base))
    items.append(("feature_request", base))
    return [
        {"label": OFFER[intent], "skill": "route_feedback", "args": {"intent": intent, **args}}
        for intent, args in items
    ]


# ── submission lifecycle (user, then curator) ──────────────────────────────────────────────────────────────────────
def submit(submission_id, principal, action, title=None, body=None):
    """The user sends (optionally edited) or cancels their own draft. Agent feedback is recorded on the answer."""
    from . import quality

    with connect() as conn:
        row = one(conn, "SELECT * FROM agent_submissions WHERE id=%s FOR UPDATE", (submission_id,))
        if not row or row["principal_sub"] != principal.sub:
            return None
        if row["state"] != "draft":
            return row
        if action == "cancel":
            return one(conn, "UPDATE agent_submissions SET state='cancelled' WHERE id=%s RETURNING *", (submission_id,))
        title = (title or row["title"]).strip()[:200] or row["title"]
        body = (body or row["body"]).strip()[:3000] or row["body"]
        row = one(
            conn,
            """UPDATE agent_submissions SET state='submitted',title=%s,body=%s,submitted_at=now() WHERE id=%s
               RETURNING *""",
            (title, body, submission_id),
        )
    if row["intent"] == "agent_feedback" and row["subject_run_id"]:
        subject = {"id": row["subject_run_id"]}
        quality.record_feedback(subject, principal, -1, row["reason"], f"{title}\n{body}"[:1000])
    return row


def queue(limit=50):
    with connect() as conn:
        return all_rows(
            conn,
            """SELECT id,run_id,principal_name,intent,state,title,body,refs,subject_run_id,reason,created_at,
                      submitted_at,reviewed_by,reviewed_at,review_note,knowledge_source_id
               FROM agent_submissions WHERE state IN ('submitted','promoted','closed')
               ORDER BY (state='submitted') DESC, submitted_at DESC LIMIT %s""",
            (limit,),
        )


def review(submission_id, curator, action, note=None):
    """Curator: `promote` a knowledge correction to a *draft* knowledge source (approved separately, in Knowledge),
    or `close` it. Agent feedback can only be closed; it already sits on the answer it is about."""
    from .. import knowledge
    from ..foundation_api import Source

    with connect() as conn:
        row = one(conn, "SELECT * FROM agent_submissions WHERE id=%s", (submission_id,))
    if not row or row["state"] not in ("submitted",):
        raise ValueError("Only a sent submission can be reviewed")
    source_id = None
    if action == "promote":
        if row["intent"] != "knowledge_correction":
            raise ValueError("Only knowledge corrections can become knowledge drafts")
        scope = _scope(row["refs"])
        source = knowledge.register_source(
            Source(
                source_key="agent-correction:" + row["id"],
                title=f"Koreksi: {row['title']}"[:200],
                scope_type=scope["scope_type"],
                scope_id=scope["scope_id"],
                classification=scope["classification"],
                source_kind="lesson",
            ),
            curator,
        )
        corrected = "\n".join(f"- {r['label']}" for r in row["refs"]) or "- (tidak ditautkan)"
        content = (
            f"# Koreksi: {row['title']}\n\nDilaporkan oleh {row['principal_name']} melalui Celerates Agent "
            f"({row['submitted_at']:%Y-%m-%d}). Ditinjau oleh {curator}.\n\nPengetahuan yang dikoreksi:\n{corrected}\n\n"
            f"Koreksi:\n{row['body']}\n" + (f"\nCatatan kurator: {note}\n" if note else "")
        )
        knowledge.register_version(source["id"], 1, "koreksi.md", content.encode(), "text/markdown", curator)
        source_id = source["id"]
    with connect() as conn:
        return one(
            conn,
            """UPDATE agent_submissions SET state=%s,reviewed_by=%s,reviewed_at=now(),review_note=%s,
               knowledge_source_id=%s WHERE id=%s AND state='submitted' RETURNING *""",
            ("promoted" if action == "promote" else "closed", str(curator), note, source_id, submission_id),
        )


def _scope(refs):
    """A correction inherits the scope and classification of the knowledge it corrects (never wider)."""
    ids = [r.get("source_id") for r in refs if r.get("source_id")]
    if ids:
        with connect() as conn:
            src = one(
                conn,
                "SELECT scope_type,scope_id,classification FROM knowledge_sources WHERE id=%s",
                (ids[0],),
            )
        if src:
            return src
    return {"scope_type": "company", "scope_id": "company", "classification": "internal"}
