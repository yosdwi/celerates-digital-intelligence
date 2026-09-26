"""Delegated ERP calls (ADR-008/009/010). Every call carries a machine token and the user's assertion; ERP
re-authorizes the user. Reads use the read token. The only non-read call is `propose`, which uses the action token
to create an ERP-held *pending* proposal: it has no business effect until the same user confirms it in ERP."""

import re

import httpx

from ..config import settings

TYPE = re.compile(r"^[a-z_]{2,40}$")
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
KEY = re.compile(r"^[a-z0-9-]{2,60}$")


class ERPAgentError(RuntimeError):
    def __init__(self, status, code):
        super().__init__(f"ERP rejected agent read ({status}/{code})")
        self.status, self.code = status, code


class DelegatedERP:
    def __init__(self, principal):
        self.principal = principal

    def _get(self, path, params=None):
        return self._call("GET", path, params=params)

    def _call(self, method, path, params=None, body=None, key=None):
        cfg = settings()
        if cfg.erp_mode != "http":
            raise ERPAgentError(503, "AGENT_REQUIRES_CONNECTED_ERP")
        headers = {
            "Authorization": f"Bearer {cfg.erp_token if method == 'GET' else cfg.erp_action_token}",
            "X-ERP-Audience": "celerates-intelligence",
            "X-ERP-Environment": cfg.erp_environment,
            "X-ERP-Delegation": self.principal.token,
        }
        if key:
            headers["Idempotency-Key"] = key
        with httpx.Client(base_url=cfg.erp_base_url.rstrip("/") + "/", timeout=20, headers=headers) as client:
            response = client.request(method, "agent/" + path, params=params, json=body)
        if response.is_error:
            try:
                code = response.json().get("error", {}).get("code", "UNAVAILABLE")
            except Exception:
                code = "UNAVAILABLE"
            raise ERPAgentError(response.status_code, code)
        return response.json()

    def signal(self, key, path, items=5):
        if not KEY.match(key):
            raise ValueError("Invalid signal key")
        return self._get("signals/" + key, {"path": path, "items": max(1, min(50, int(items)))})

    def catalog(self):
        return self._get("catalog")

    def propose(self, key, title, items, run_id, context_path):
        """Create (idempotently, by key) an ERP-held pending proposal. ERP validates every item for this user."""
        if not re.match(r"^[A-Za-z0-9:_-]{8,160}$", key):
            raise ValueError("Invalid idempotency key")
        body = {"title": title[:200], "items": items, "run_id": run_id, "context_path": context_path}
        return self._call("POST", "proposals", body=body, key=key)

    def entity(self, entity_type, entity_id):
        self._check(entity_type, entity_id)
        return self._get(f"entities/{entity_type}/{entity_id}")

    def neighbours(self, entity_type, entity_id):
        self._check(entity_type, entity_id)
        return self._get(f"entities/{entity_type}/{entity_id}/neighbours")

    def entity_signals(self, entity_type, entity_id):
        self._check(entity_type, entity_id)
        return self._get(f"entities/{entity_type}/{entity_id}/signals")

    def search(self, query, mode="all"):
        query = " ".join(str(query).split())[:100]
        if len(query) < 2:
            raise ValueError("Search needs at least two characters")
        return self._get("search", {"q": query, "mode": "any" if mode == "any" else "all"})

    def signals(self):
        return self._get("signals")

    @staticmethod
    def _check(entity_type, entity_id):
        if not TYPE.match(entity_type) or not UUID.match(entity_id):
            raise ValueError("Invalid entity reference")
