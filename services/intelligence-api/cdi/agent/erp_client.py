"""Delegated ERP reads (ADR-008/009). Every call carries the machine read token and the user's assertion;
ERP re-authorizes the user. This client has no write methods by design (M1 is read-only)."""

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
        cfg = settings()
        if cfg.erp_mode != "http":
            raise ERPAgentError(503, "AGENT_REQUIRES_CONNECTED_ERP")
        headers = {
            "Authorization": f"Bearer {cfg.erp_token}",
            "X-ERP-Audience": "celerates-intelligence",
            "X-ERP-Environment": cfg.erp_environment,
            "X-ERP-Delegation": self.principal.token,
        }
        with httpx.Client(base_url=cfg.erp_base_url.rstrip("/") + "/", timeout=15, headers=headers) as client:
            response = client.get("agent/" + path, params=params)
        if response.is_error:
            try:
                code = response.json().get("error", {}).get("code", "UNAVAILABLE")
            except Exception:
                code = "UNAVAILABLE"
            raise ERPAgentError(response.status_code, code)
        return response.json()

    def signal(self, key, path):
        if not KEY.match(key):
            raise ValueError("Invalid signal key")
        return self._get("signals/" + key, {"path": path})

    def entity(self, entity_type, entity_id):
        self._check(entity_type, entity_id)
        return self._get(f"entities/{entity_type}/{entity_id}")

    def neighbours(self, entity_type, entity_id):
        self._check(entity_type, entity_id)
        return self._get(f"entities/{entity_type}/{entity_id}/neighbours")

    def entity_signals(self, entity_type, entity_id):
        self._check(entity_type, entity_id)
        return self._get(f"entities/{entity_type}/{entity_id}/signals")

    def search(self, query):
        query = " ".join(str(query).split())[:100]
        if len(query) < 2:
            raise ValueError("Search needs at least two characters")
        return self._get("search", {"q": query})

    @staticmethod
    def _check(entity_type, entity_id):
        if not TYPE.match(entity_type) or not UUID.match(entity_id):
            raise ValueError("Invalid entity reference")
