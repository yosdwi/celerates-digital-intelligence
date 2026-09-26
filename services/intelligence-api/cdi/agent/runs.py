"""Persisted Agent runs. `agent_steps` holds AG-UI events in order; it is the source of truth for streaming,
resume (Last-Event-ID) and later inspection. Nothing here decides authority: runs are read-only in M1."""

import json as stdjson
import time
from uuid import uuid4

from ag_ui.core import (
    CustomEvent,
    RunErrorEvent,
    RunFinishedEvent,
    RunStartedEvent,
    StepFinishedEvent,
    StepStartedEvent,
    TextMessageContentEvent,
    TextMessageEndEvent,
    TextMessageStartEvent,
    ToolCallArgsEvent,
    ToolCallEndEvent,
    ToolCallResultEvent,
    ToolCallStartEvent,
)

from ..db import all_rows, connect, json, one

TERMINAL = {"RUN_FINISHED", "RUN_ERROR"}
TRACE_CHARS = 4000  # tool args/results in the trace are bounded; datasets and proposals can be large
STALE_SECONDS = 90


def _bounded(text):
    return text if len(text) <= TRACE_CHARS else text[:TRACE_CHARS] + "…"


def encode(event):
    return event.model_dump(mode="json", by_alias=True, exclude_none=True)


def create(run_id, thread_id, principal, skill, run_input, playbook_version, modality="text"):
    """Idempotent by run_id for the same principal; another principal can never adopt an existing run id."""
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s,0))", ("agent-run:" + run_id,))
        existing = one(conn, "SELECT * FROM agent_runs WHERE id=%s", (run_id,))
        if existing:
            if existing["principal_sub"] != principal.sub:
                raise PermissionError("Run belongs to another user")
            return existing, False
        row = one(
            conn,
            """INSERT INTO agent_runs(id,thread_id,principal_sub,principal_name,delegation_jti,context,skill,input,
               modality,playbook_version) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *""",
            (
                run_id,
                thread_id,
                principal.sub,
                principal.display_name,
                principal.jti,
                json(principal.context),
                skill,
                json(run_input),
                modality,
                playbook_version,
            ),
        )
        return row, True


def get(run_id):
    with connect() as conn:
        return one(conn, "SELECT * FROM agent_runs WHERE id=%s", (run_id,))


def events_after(run_id, seq):
    with connect() as conn:
        return all_rows(
            conn, "SELECT seq,type,event FROM agent_steps WHERE run_id=%s AND seq>%s ORDER BY seq", (run_id, seq)
        )


def mark_stale(run_id):
    """A run whose process died (e.g. redeploy) must not look alive forever. The state change is atomic, so only
    one reader appends the terminal event."""
    with connect() as conn:
        run = one(
            conn,
            """UPDATE agent_runs SET state='failed',error='RUN_INTERRUPTED',finished_at=now()
               WHERE id=%s AND state='running' AND created_at < now() - %s * interval '1 second' RETURNING *""",
            (run_id, STALE_SECONDS),
        )
    if not run:
        return False
    Recorder(run).emit(
        RunErrorEvent(message="Run terhenti sebelum selesai. Silakan jalankan ulang.", code="RUN_INTERRUPTED")
    )
    return True


class Recorder:
    """Single writer per run (the executing thread). Validates every event through the AG-UI models."""

    def __init__(self, run):
        self.run = run
        with connect() as conn:
            last = one(conn, "SELECT coalesce(max(seq),0) AS n FROM agent_steps WHERE run_id=%s", (run["id"],))
        self.seq = last["n"]
        self._tool = 0

    def emit(self, event):
        payload = encode(event)
        payload.setdefault("timestamp", int(time.time() * 1000))
        self.seq += 1
        with connect() as conn:
            conn.execute(
                "INSERT INTO agent_steps(run_id,seq,type,event) VALUES (%s,%s,%s,%s)",
                (self.run["id"], self.seq, payload["type"], json(payload)),
            )
        return payload

    def started(self):
        self.emit(RunStartedEvent(thread_id=self.run["thread_id"], run_id=self.run["id"]))

    def step(self, name):
        recorder = self

        class _Step:
            def __enter__(self):
                recorder.emit(StepStartedEvent(step_name=name))

            def __exit__(self, *exc):
                recorder.emit(StepFinishedEvent(step_name=name))
                return False

        return _Step()

    def tool(self, name, args, result):
        self._tool += 1
        call_id = f"{self.run['id']}:tool:{self._tool}"
        self.emit(ToolCallStartEvent(tool_call_id=call_id, tool_call_name=name))
        self.emit(ToolCallArgsEvent(tool_call_id=call_id, delta=_bounded(stdjson.dumps(args, ensure_ascii=False))))
        self.emit(ToolCallEndEvent(tool_call_id=call_id))
        self.emit(
            ToolCallResultEvent(
                message_id=f"{call_id}:result",
                tool_call_id=call_id,
                role="tool",
                content=_bounded(stdjson.dumps(result, ensure_ascii=False, default=str)),
            )
        )
        return call_id

    def evidence(self, items):
        if items:
            self.emit(CustomEvent(name="celerates.evidence", value={"items": items}))

    def proposal(self, value):
        """An ERP-held proposal the UI renders as a first-class card (it fetches the live proposal from ERP)."""
        self.emit(CustomEvent(name="celerates.proposal", value=value))

    def mapping(self, value):
        """The column mapping behind an import, for the user to inspect or correct (a correction is a new run)."""
        self.emit(CustomEvent(name="celerates.mapping", value=value))

    def actions(self, items):
        """Next steps the UI may offer as buttons. Each is a skill the ERP BFF re-validates; none is an approval."""
        self.emit(CustomEvent(name="celerates.actions", value={"items": items}))

    def message(self, text):
        message_id = f"{self.run['id']}:message:{uuid4().hex[:8]}"
        self.emit(TextMessageStartEvent(message_id=message_id, role="assistant"))
        self.emit(TextMessageContentEvent(message_id=message_id, delta=text))
        self.emit(TextMessageEndEvent(message_id=message_id))

    def finished(self, result):
        self.emit(RunFinishedEvent(thread_id=self.run["thread_id"], run_id=self.run["id"], result=result))
        with connect() as conn:
            conn.execute(
                "UPDATE agent_runs SET state='succeeded',result=%s,finished_at=now() WHERE id=%s",
                (json(result), self.run["id"]),
            )

    def error(self, message, code):
        self.emit(RunErrorEvent(message=message, code=code))
        with connect() as conn:
            conn.execute(
                "UPDATE agent_runs SET state='failed',error=%s,finished_at=now() WHERE id=%s AND state='running'",
                (f"{code}: {message}"[:300], self.run["id"]),
            )
