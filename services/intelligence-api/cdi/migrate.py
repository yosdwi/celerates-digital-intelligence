import hashlib
from pathlib import Path

from .db import checkpointer, connect


def migrate():
    root = Path(__file__).resolve().parents[3]
    with connect() as conn:
        conn.execute("SELECT pg_advisory_xact_lock(738912)")
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())"
        )
        conn.execute("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS sha256 text")
        for path in sorted((root / "infra/postgres/migrations").glob("*.sql")):
            sha = hashlib.sha256(path.read_bytes()).hexdigest()
            previous = conn.execute("SELECT sha256 FROM schema_migrations WHERE name=%s", (path.name,)).fetchone()
            if previous and previous["sha256"] and previous["sha256"] != sha:
                raise RuntimeError(f"Applied migration changed: {path.name}")
            if not previous:
                conn.execute(path.read_text(), prepare=False)
                conn.execute("INSERT INTO schema_migrations(name,sha256) VALUES (%s,%s)", (path.name, sha))
            elif not previous["sha256"]:
                # One-time baseline of the legacy name-only ledger; future edits fail closed.
                conn.execute("UPDATE schema_migrations SET sha256=%s WHERE name=%s", (sha, path.name))
    with checkpointer() as saver:
        saver.setup()


if __name__ == "__main__":
    migrate()
    print("Database and LangGraph migrations applied.")
