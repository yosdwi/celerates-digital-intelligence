from pathlib import Path

from .db import checkpointer, connect


def migrate():
    root = Path(__file__).resolve().parents[3]
    with connect() as conn:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())"
        )
        for path in sorted((root / "infra/postgres/migrations").glob("*.sql")):
            if not conn.execute("SELECT 1 FROM schema_migrations WHERE name=%s", (path.name,)).fetchone():
                conn.execute(path.read_text(), prepare=False)
                conn.execute("INSERT INTO schema_migrations(name) VALUES (%s)", (path.name,))
    with checkpointer() as saver:
        saver.setup()


if __name__ == "__main__":
    migrate()
    print("Database and LangGraph migrations applied.")
