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


class ERPReviewPending(RuntimeError):
    pass


class HttpERP:
    """Narrow live ADR-006 contract. No generic ERP upsert or implicit approval."""

    def request(self, method, path, payload=None, key=None, action=False):
        cfg = settings()
        headers = {
            "Authorization": f"Bearer {cfg.erp_action_token if action else cfg.erp_token}",
            "X-ERP-Audience": "celerates-intelligence",
            "X-ERP-Environment": cfg.erp_environment,
        }
        if key:
            headers["Idempotency-Key"] = key
        with httpx.Client(base_url=cfg.erp_base_url.rstrip("/") + "/", timeout=20, headers=headers) as client:
            response = client.request(method, path, json=payload)
        if response.is_error:
            # Fixed codes, never remote payload/credential-bearing transport URLs.
            try:
                code = response.json().get("error", {}).get("code", "UNAVAILABLE")
            except Exception:
                code = "UNAVAILABLE"
            raise RuntimeError(f"ERP contract rejected operation ({response.status_code}/{code})")
        return response.json()

    @staticmethod
    def normalize(envelope):
        d = envelope["data"]
        return {
            "id": d["id"],
            "title": d.get("requirement_summary") or d.get("position_name") or d["opty_no"],
            "customer": d.get("client_name") or "Unconfirmed",
            "owner": d.get("sales_pic_name") or "Unassigned",
            "stage": d.get("opty_status_code") or "Unconfirmed",
            "status": "ERP_RECORD",
            "notes": d.get("detail_requirement") or "",
            "source": "Celerates ERP",
            "timeline": "Unconfirmed",
            "record_version": envelope["record_version"],
            "as_of": envelope["as_of"],
            "source_refs": envelope["source_refs"],
            "quality": envelope["quality"],
            "artifact_references": d["artifact_references"],
        }

    def list(self, kind):
        if kind != "opportunity":
            return []  # Explicitly reported as unsupported, never inferred availability.
        items = []
        cursor = ""
        for _ in range(100):
            page = self.request(
                "GET", "resources/sales_opportunity?limit=100" + ("&cursor=" + cursor if cursor else "")
            )
            items.extend(self.normalize(x) for x in page["items"])
            cursor = page["next_cursor"]
            if not cursor:
                return items
        raise RuntimeError("ERP pagination limit exceeded; narrow pilot grants")

    def get(self, kind, object_id):
        from uuid import UUID

        if kind != "opportunity":
            raise ValueError("Resource is outside the live ERP contract")
        return self.normalize(self.request("GET", "resources/sales_opportunity/" + str(UUID(object_id))))

    def create_opportunity(self, data, key):
        raise ValueError("Create the Sales Opportunity in ERP, then grant access in Intelligence Review")

    def action(self, kind, object_id, payload, key):
        if kind != "opportunity.outcome":
            raise ValueError("Unsupported live ERP command")
        from .context import WORKFLOW_VERSION, run_context, validate_knowledge

        run_id = key.removesuffix(":outcome")
        run, snapshot, actor = run_context(run_id)
        with connect() as conn:
            artifacts = all_rows(
                conn,
                "SELECT id,kind,title,version,content,review_state FROM artifacts WHERE run_id=%s ORDER BY kind",
                (run_id,),
            )
        if len(artifacts) != 11 or any(a.pop("review_state") != "APPROVED" for a in artifacts):
            raise ValueError("All current artifacts must be reviewed before an ERP action")
        manifest = {
            "run_id": run_id,
            "outcome": payload["status"],
            "note": payload["note"],
            "artifacts": artifacts,
            "context_id": snapshot["id"],
            "context_sha256": snapshot["sha256"],
            "workflow_version": WORKFLOW_VERSION,
        }
        review_body = {
            "resource_type": "sales_opportunity",
            "resource_id": object_id,
            "expected_version": snapshot["body"]["operational"]["record_version"],
            "manifest": manifest,
        }
        review = self.request("POST", "review-requests", review_body, key + ":review", action=True)
        with connect() as conn:
            conn.execute("UPDATE runs SET erp_review=%s WHERE id=%s", (json(review), run_id))
        if review["state"] == "pending":
            raise ERPReviewPending(
                "Open ERP /intelligence and review the exact artifact package, then check approval here"
            )
        if review["state"] not in {"approved", "consumed"}:
            raise ValueError("ERP review rejected; start a new analysis with the required corrections")
        if review["state"] != "consumed":
            validate_knowledge(snapshot, actor)
        command = {
            "kind": "artifact.persist_approved_reference",
            "review_id": review["id"],
            "resource_type": "sales_opportunity",
            "resource_id": object_id,
            "expected_version": review_body["expected_version"],
            "manifest_sha256": review["manifest_sha256"],
        }
        receipt = self.request("POST", "commands", command, key, action=True)
        verified = self.request("GET", "commands/" + receipt["command_id"])
        if verified != receipt:
            raise RuntimeError("ERP read-back receipt mismatch")
        return receipt


def erp() -> ERPAdapter:
    return DemoERP() if settings().erp_mode == "demo" else HttpERP()
