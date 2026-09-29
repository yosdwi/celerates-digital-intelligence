"""Explicit re-embedding job (ADR-014 §5). Switching EMBEDDING_MODE or EMBEDDING_MODEL makes existing chunks
invisible to vector ranking (retrieval filters on `embedding_model`), while lexical retrieval keeps working. Run
`python -m cdi.reembed` once after the switch; it is idempotent and resumable in batches."""

import sys

from .db import all_rows, connect
from .gateway import ModelGateway


def reembed(batch=100, limit=None):
    gateway = ModelGateway()
    _, current = gateway.embed("probe")
    done = 0
    while limit is None or done < limit:
        with connect() as conn:
            rows = all_rows(
                conn, "SELECT id,text FROM chunks WHERE embedding_model<>%s ORDER BY id LIMIT %s", (current, batch)
            )
        if not rows:
            break
        for row in rows:
            vector, model = gateway.embed(row["text"])
            with connect() as conn:
                conn.execute(
                    "UPDATE chunks SET embedding=%s::vector, embedding_model=%s WHERE id=%s",
                    (str(vector), model, row["id"]),
                )
            done += 1
    return {"model": current, "reembedded": done}


if __name__ == "__main__":
    print(reembed(limit=int(sys.argv[1]) if len(sys.argv) > 1 else None))
