"""Python Integration Core: extraction is separate from canonical ERP load."""

import csv
import hashlib
import json as stdjson
from pathlib import Path
from typing import Protocol
from uuid import uuid4

import httpx
import psycopg
from psycopg.rows import dict_row

from .db import connect, json
from .erp import erp


class SourceAdapter(Protocol):
    def discover(self) -> dict: ...
    def extract(self) -> list[dict]: ...


class FileSource:
    def __init__(self, path):
        self.path = Path(path)

    def discover(self):
        return {"name": self.path.name, "connector": "CSV / Excel"}

    def extract(self):
        if self.path.suffix.lower() == ".csv":
            with self.path.open(encoding="utf-8-sig", newline="") as stream:
                return list(csv.DictReader(stream))
        if self.path.suffix.lower() == ".xlsx":
            import openpyxl

            book = openpyxl.load_workbook(self.path, read_only=True, data_only=True)
            rows = iter(book.active.values)
            headers = [str(h).strip() for h in next(rows)]
            result = [dict(zip(headers, row)) for row in rows]
            book.close()
            return result
        raise ValueError("Source must be CSV or XLSX")


class RestSource:
    def __init__(self, url, token=""):
        self.url, self.token = url, token

    def discover(self):
        # Do not put tokens, userinfo or query-string secrets into audit records.
        from urllib.parse import urlsplit

        parsed = urlsplit(self.url)
        return {"name": f"{parsed.scheme}://{parsed.hostname}{parsed.path}", "connector": "REST"}

    def extract(self):
        response = httpx.get(self.url, headers={"Authorization": f"Bearer {self.token}"}, timeout=30)
        response.raise_for_status()
        value = response.json()
        records = value if isinstance(value, list) else value["items"]
        if len(records) > 10000:
            raise ValueError("P0 intake batch exceeds 10000 records")
        return records


class PostgresSource:
    def __init__(self, dsn, table):
        self.dsn, self.table = dsn, table

    def discover(self):
        return {"name": self.table, "connector": "PostgreSQL read-only"}

    def extract(self):
        from psycopg import sql

        with psycopg.connect(self.dsn, row_factory=dict_row) as conn:
            conn.execute("SET TRANSACTION READ ONLY")
            conn.execute("SET LOCAL statement_timeout='30s'")
            return conn.execute(sql.SQL("SELECT * FROM {} LIMIT 10000").format(sql.Identifier(self.table))).fetchall()


class SQLServerSource:
    def discover(self):
        return {"name": "SQL Server", "connector": "Interface only"}

    def extract(self):
        raise NotImplementedError("SQL Server adapter requires an agreed read model and pyodbc configuration")


class JiraSource:
    def discover(self):
        return {"name": "Jira REST", "connector": "Interface only"}

    def extract(self):
        raise NotImplementedError("Jira mapping and pagination contract must be agreed before enabling this connector")


def ingest_source(source: SourceAdapter, entity: str, approved: bool = False):
    if entity not in {"customer", "capability", "project"}:
        raise ValueError("Only curated customer, capability and project records are accepted in P0")
    meta = source.discover()
    records, rejected, accepted, ids = source.extract(), [], [], set()
    required = {
        "customer": {"id", "name"},
        "capability": {"id", "name", "available", "constraint", "as_of"},
        "project": {"id", "name", "domain", "skills", "lesson"},
    }[entity]
    for index, raw in enumerate(records):
        record = {str(k).strip().lower(): v.strip() if isinstance(v, str) else v for k, v in raw.items()}
        error = None
        if not required.issubset(record) or any(record.get(k) in (None, "") for k in required):
            error = "Missing required fields"
        elif record["id"] in ids:
            error = "Duplicate identifier within source batch"
        elif entity == "capability":
            try:
                record["available"] = int(record["available"])
                if record["available"] < 0:
                    raise ValueError()
            except (ValueError, TypeError):
                error = "Capacity must be a nonnegative integer"
        if entity == "project" and isinstance(record.get("skills"), str):
            record["skills"] = [s.strip() for s in record["skills"].split(",") if s.strip()]
        if error:
            rejected.append({"row": index + 1, "reason": error})
        else:
            ids.add(record["id"])
            accepted.append(record)
    digest = hashlib.sha256(
        stdjson.dumps({"entity": entity, "records": accepted}, sort_keys=True, default=str).encode()
    ).hexdigest()
    state = "REJECTED" if rejected else "VALIDATED"
    # All-or-nothing validation and explicit approval before canonical state changes.
    if approved and accepted and not rejected:
        acknowledgement = erp().action(
            "intake.upsert", meta["name"], {"entity": entity, "records": accepted}, "intake:" + digest
        )
        if not isinstance(acknowledgement, dict) or acknowledgement.get("acknowledged") is not True:
            raise RuntimeError("ERP did not acknowledge the intake batch")
        state = "LOADED"
    result = {
        "id": str(uuid4()),
        "state": state,
        "accepted": len(accepted),
        "rejected": len(rejected),
        "detail": {"errors": rejected, "sha256": digest, "approved": approved, "entity": entity},
    }
    with connect() as conn:
        conn.execute(
            "INSERT INTO ingestion_audit(id,source,connector,state,accepted,rejected,detail) VALUES (%s,%s,%s,%s,%s,%s,%s)",
            (
                result["id"],
                meta["name"],
                meta["connector"],
                state,
                len(accepted),
                len(rejected),
                json(result["detail"]),
            ),
        )
    return result


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("path")
    parser.add_argument("--entity", required=True, choices=["customer", "capability", "project"])
    parser.add_argument("--approve", action="store_true")
    args = parser.parse_args()
    print(stdjson.dumps(ingest_source(FileSource(args.path), args.entity, args.approve), indent=2))
