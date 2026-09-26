"""Agent HTTP surface for the ERP BFF (ADR-008/013). Every route requires a verified ERP delegation.

POST creates (or idempotently re-attaches to) a run; GET streams its persisted AG-UI events as SSE with
`id:` lines so a dropped connection resumes with Last-Event-ID. Datasets are user-owned uploads. Outcomes are
observations ERP reports after the user decided on a proposal. No route here approves or writes ERP state."""

import json as stdjson
import time
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from ..config import settings
from ..db import connect, json
from ..delegation import delegated_actor
from . import datasets, playbooks, runs

router = APIRouter(prefix="/api/agent")
POLL_SECONDS = 0.25
HEARTBEAT_SECONDS = 15
STREAM_SECONDS = 100  # below the web proxy's 120 s read timeout; clients resume by Last-Event-ID


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignalArgs(Strict):
    signal_key: str = Field(pattern=r"^[a-z0-9-]{2,60}$")


class EntityArgs(Strict):
    entity_type: str = Field(pattern=r"^[a-z_]{2,40}$")
    entity_id: UUID


class SearchArgs(Strict):
    query: str = Field(min_length=2, max_length=100)


class AskArgs(Strict):
    query: str = Field(min_length=2, max_length=300)
    dataset_id: UUID | None = None


class DocumentArgs(Strict):
    dataset_id: UUID


class DatasetArgs(Strict):
    dataset_id: UUID
    command: str | None = Field(default=None, pattern=r"^[a-z_]{2,40}\.[a-z_]{2,40}$")
    mapping: dict[Annotated[str, Field(pattern=r"^[a-z_]{2,40}$")], Annotated[str, Field(max_length=80)]] | None = (
        Field(default=None, max_length=30)
    )


ARGS = {
    "explain_signal": SignalArgs,
    "explain_entity": EntityArgs,
    "search": SearchArgs,
    "ask": AskArgs,
    "follow_up_signal": SignalArgs,
    "import_dataset": DatasetArgs,
    "read_document": DocumentArgs,
}


class RunRequest(Strict):
    run_id: UUID | None = None
    thread_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{8,100}$")
    skill: Literal[
        "explain_signal", "explain_entity", "search", "ask", "follow_up_signal", "import_dataset", "read_document"
    ]
    args: dict
    # Voice is transcribed first (POST /transcribe) and the user reviews the text; the run itself is the same.
    modality: Literal["text", "voice"] = "text"


@router.post("/runs", status_code=201)
def create_run(body: RunRequest, user=Depends(delegated_actor)):
    if settings().erp_mode != "http":
        raise HTTPException(503, "The Agent requires the connected ERP contract")
    try:
        args = ARGS[body.skill](**body.args).model_dump(mode="json")
    except ValueError as exc:
        raise HTTPException(422, "Invalid skill arguments") from exc
    run_id = str(body.run_id or uuid4())
    try:
        run, created = runs.create(
            run_id,
            body.thread_id or "thread-" + run_id,
            user,
            body.skill,
            args,
            playbooks.PLAYBOOK_VERSION,
            body.modality,
        )
    except PermissionError as exc:
        raise HTTPException(409, "Run id is not available") from exc
    if created:
        playbooks.start(run, user, args)
    return {"run_id": run["id"], "thread_id": run["thread_id"], "state": run["state"], "created": created}


def owned(run_id, user):
    run = runs.get(run_id)
    if not run or run["principal_sub"] != user.sub:
        raise HTTPException(404, "Run not found")
    return run


@router.get("/runs/{run_id}")
def run_status(run_id: UUID, user=Depends(delegated_actor)):
    run = owned(str(run_id), user)
    return {k: run[k] for k in ("id", "thread_id", "skill", "state", "result", "error", "created_at", "finished_at")}


def sse(row):
    return f"id: {row['seq']}\ndata: {stdjson.dumps(row['event'], ensure_ascii=False, separators=(',', ':'))}\n\n"


@router.get("/runs/{run_id}/events")
def run_events(
    run_id: UUID,
    user=Depends(delegated_actor),
    last_event_id: Annotated[str | None, Header()] = None,
    after: int = 0,
):
    run = owned(str(run_id), user)
    cursor = max(after, int(last_event_id) if (last_event_id or "").isdigit() else 0)

    def stream():
        nonlocal cursor
        started = beat = time.monotonic()
        while time.monotonic() - started < STREAM_SECONDS:
            rows = runs.events_after(run["id"], cursor)
            for row in rows:
                cursor = row["seq"]
                yield sse(row)
                if row["type"] in runs.TERMINAL:
                    return
            if not rows:
                if runs.mark_stale(run["id"]):
                    continue
                if time.monotonic() - beat > HEARTBEAT_SECONDS:
                    beat = time.monotonic()
                    yield ": keep-alive\n\n"
                time.sleep(POLL_SECONDS)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "private, no-store", "X-Accel-Buffering": "no"},
    )


class Outcome(Strict):
    proposal_id: UUID
    state: Literal["applied", "partially_applied", "failed", "rejected", "expired", "pending"]
    counts: dict = {}
    receipts: dict = {}
    outcome: dict | None = None
    edited_items: int = Field(default=0, ge=0, le=1000)


@router.post("/runs/{run_id}/outcomes")
def record_outcome(run_id: UUID, body: Outcome, user=Depends(delegated_actor)):
    """ERP reports how the user decided. Receipts stay in ERP; this is the learning/observation copy."""
    run = owned(str(run_id), user)
    with connect() as conn:
        conn.execute(
            """INSERT INTO agent_outcomes(run_id,proposal_id,principal_sub,state,counts,receipts,outcome,edited_items)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
               ON CONFLICT (run_id,proposal_id) DO UPDATE SET state=EXCLUDED.state,counts=EXCLUDED.counts,
                 receipts=EXCLUDED.receipts,outcome=EXCLUDED.outcome,edited_items=EXCLUDED.edited_items,recorded_at=now()""",
            (
                run["id"],
                str(body.proposal_id),
                user.sub,
                body.state,
                json(body.counts),
                json(body.receipts),
                json(body.outcome),
                body.edited_items,
            ),
        )
    learned = body.state in {"applied", "partially_applied"} and datasets.learn(run, user)
    return {"recorded": True, "learned": learned}


@router.post("/datasets", status_code=201)
def upload_dataset(file: UploadFile = File(...), user=Depends(delegated_actor)):
    from . import documents

    body = file.file.read(documents.MAX_BYTES + 1)
    try:
        row = datasets.store(user, file.filename or "berkas.csv", body)
    except datasets.DatasetError as exc:
        raise HTTPException(422, str(exc)) from exc
    return {
        "id": row["id"],
        "name": row["name"],
        "kind": row["kind"],
        "sha256": row["sha256"],
        "profile": row["profile"],
    }


AUDIO = {"audio/webm", "audio/ogg", "audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp4", "audio/m4a"}
MAX_AUDIO = 5 * 1024 * 1024  # about a minute of compressed speech


@router.get("/capabilities")
def capabilities(user=Depends(delegated_actor)):
    from ..gateway import agent_model_enabled, voice_enabled

    return {"reasoning": "model" if agent_model_enabled() else "deterministic", "voice": voice_enabled()}


@router.post("/transcribe")
def transcribe_audio(file: UploadFile = File(...), user=Depends(delegated_actor)):
    """Push-to-talk: returns an editable transcript. Nothing is executed and the audio is not stored."""
    from ..gateway import ModelUnavailable, transcribe, voice_enabled

    if not voice_enabled():
        raise HTTPException(503, "Voice input is not configured")
    media = (file.content_type or "").split(";")[0].strip().lower()
    if media not in AUDIO:
        raise HTTPException(422, "Unsupported audio format")
    audio = file.file.read(MAX_AUDIO + 1)
    if not audio or len(audio) > MAX_AUDIO:
        raise HTTPException(413, "Recording is empty or longer than about a minute")
    try:
        text, meta = transcribe(audio, "speech." + (media.split("/")[1].replace("x-", "").replace("mpeg", "mp3")))
    except ModelUnavailable as exc:
        raise HTTPException(502, "Transcription is unavailable; type the question instead") from exc
    return {"text": text[:300], **meta}
