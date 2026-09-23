"""The only business-state boundary. demo_erp is never used by HTTP mode."""

from typing import Protocol

import httpx

from .config import settings
from .db import all_rows, connect, json, one


class ERPAdapter(Protocol):
    def list(self, kind: str) -> list[dict]: ...
    def get(self, kind: str, object_id: str) -> dict: ...
    def create_opportunity(self, data: dict, key: str) -> dict: ...
    def action(self, kind: str, object_id: str, payload: dict, key: str) -> dict: ...


class DemoERP:
    def list(self, kind):
        with connect() as conn:
            return [
                r["data"]
                for r in all_rows(conn, "SELECT data FROM demo_erp.objects WHERE kind=%s ORDER BY id", (kind,))
            ]

    def get(self, kind, object_id):
        with connect() as conn:
            row = one(conn, "SELECT data FROM demo_erp.objects WHERE kind=%s AND id=%s", (kind, object_id))
            if not row:
                raise KeyError(f"{kind} not found")
            return row["data"]

    def create_opportunity(self, data, key):
        with connect() as conn:
            # Deterministic id makes retries safe even when the first response is lost.
            from uuid import NAMESPACE_URL, uuid5

            oid = "OPP-" + str(uuid5(NAMESPACE_URL, key))[:8].upper()
            value = {**data, "id": oid, "stage": "Discovery", "status": "NEW", "source": "Demo ERP"}
            conn.execute(
                "INSERT INTO demo_erp.objects(kind,id,data) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                ("opportunity", oid, json(value)),
            )
            return one(conn, "SELECT data FROM demo_erp.objects WHERE kind=%s AND id=%s", ("opportunity", oid))["data"]

    def action(self, kind, object_id, payload, key):
        with connect() as conn:
            previous = one(conn, "SELECT payload FROM demo_erp.actions WHERE idempotency_key=%s", (key,))
            if previous:
                if previous["payload"] != payload:
                    raise ValueError("Idempotency key reused with a different payload")
                return {"acknowledged": True, "replayed": True}
            if kind == "opportunity.outcome":
                row = one(
                    conn,
                    "SELECT data FROM demo_erp.objects WHERE kind='opportunity' AND id=%s FOR UPDATE",
                    (object_id,),
                )
                if not row:
                    raise KeyError("Opportunity not found")
                value = {
                    **row["data"],
                    "status": payload["status"],
                    "artifact_references": payload["artifacts"],
                    "outcome_note": payload["note"],
                }
                conn.execute(
                    "UPDATE demo_erp.objects SET data=%s,updated_at=now() WHERE kind='opportunity' AND id=%s",
                    (json(value), object_id),
                )
            elif kind == "intake.upsert":
                for record in payload["records"]:
                    conn.execute(
                        "INSERT INTO demo_erp.objects(kind,id,data) VALUES (%s,%s,%s) "
                        "ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=now()",
                        (payload["entity"], record["id"], json(record)),
                    )
            else:
                raise ValueError("Unsupported ERP action")
            conn.execute(
                "INSERT INTO demo_erp.actions VALUES (%s,%s,%s,%s,now())", (key, kind, object_id, json(payload))
            )
            return {"acknowledged": True, "replayed": False}


class HttpERP:
    """Expected remote contract is documented in packages/contracts/erp-http.md."""

    def request(self, method, path, payload=None, key=None):
        cfg = settings()
        headers = {"Authorization": f"Bearer {cfg.erp_token}"}
        if key:
            headers["Idempotency-Key"] = key
        with httpx.Client(base_url=cfg.erp_base_url.rstrip("/") + "/", timeout=20, headers=headers) as client:
            response = client.request(method, path, json=payload)
            response.raise_for_status()
            return response.json()

    def list(self, kind):
        return self.request("GET", f"read/{kind}")["items"]

    def get(self, kind, object_id):
        from urllib.parse import quote

        return self.request("GET", f"read/{kind}/{quote(object_id, safe='')}")

    def create_opportunity(self, data, key):
        return self.request("POST", "opportunities", data, key)

    def action(self, kind, object_id, payload, key):
        return self.request("POST", "actions", {"kind": kind, "object_id": object_id, "payload": payload}, key)


def erp() -> ERPAdapter:
    return DemoERP() if settings().erp_mode == "demo" else HttpERP()
