"""Durable Postgres queue. Row locking prevents duplicate claims across workers."""

import signal
import threading
import time

from .config import settings
from .db import connect, one
from .workflow import execute


def tick():
    with connect() as conn:
        run = one(
            conn,
            """SELECT * FROM runs WHERE
            state IN ('QUEUED','RESUMING') AND (lease_until IS NULL OR lease_until < now())
            OR state IN ('INGESTING','ANALYZING') AND lease_until < now()
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1""",
        )
        if not run:
            return False
        conn.execute(
            "UPDATE runs SET lease_until=now()+(%s * interval '1 second'),attempt=attempt+1 WHERE id=%s",
            (settings().lease_seconds, run["id"]),
        )
    stopped = threading.Event()

    def renew_lease():
        while not stopped.wait(max(1, settings().lease_seconds / 3)):
            try:
                with connect() as conn:
                    conn.execute(
                        "UPDATE runs SET lease_until=now()+(%s * interval '1 second') "
                        "WHERE id=%s AND state IN ('QUEUED','INGESTING','ANALYZING','RESUMING')",
                        (settings().lease_seconds, run["id"]),
                    )
            except Exception:
                import logging

                logging.getLogger(__name__).exception("Lease renewal failed for %s", run["id"])

    heartbeat = threading.Thread(target=renew_lease, daemon=True)
    heartbeat.start()
    try:
        execute(run["id"])
    finally:
        stopped.set()
        heartbeat.join(timeout=2)
    return True


def main():
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while not stopped:
        try:
            if not tick():
                time.sleep(settings().worker_poll_seconds)
        except Exception:
            import logging

            logging.exception("Worker poll failed")
            time.sleep(2)


if __name__ == "__main__":
    main()
