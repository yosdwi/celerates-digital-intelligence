"""Explicit pilot identities. No implicit shared production reviewer or user-supplied claims."""

import hashlib
import hmac
import json
from typing import Annotated

from fastapi import Header, HTTPException

from .config import settings


class Principal(str):
    def __new__(cls, name, roles, divisions, restricted=False):
        obj = super().__new__(cls, name)
        obj.roles = set(roles)
        obj.divisions = set(divisions)
        obj.restricted = restricted
        return obj

    def require(self, role):
        if role not in self.roles:
            raise HTTPException(403, "This action is not permitted for your workspace role")
        return self


def configured():
    cfg = settings()
    result = json.loads(cfg.intelligence_principals_json)
    if not isinstance(result, list):
        raise ValueError("INTELLIGENCE_PRINCIPALS_JSON must be a list")
    if cfg.api_access_token:
        result.append(
            {
                "id": cfg.api_principal_name,
                "token_sha256": hashlib.sha256(cfg.api_access_token.encode()).hexdigest(),
                "roles": ["reviewer", "curator"],
                "divisions": ["sales"],
                "restricted": True,
            }
        )
    return result


def resolve(name):
    for p in configured():
        if p["id"] == name:
            return Principal(p["id"], p["roles"], p["divisions"], p.get("restricted", False))
    if name == "local-demo" and settings().erp_mode == "demo" and not configured():
        return Principal(name, ["reviewer", "curator"], ["sales"], True)
    raise ValueError("Run identity has been revoked; an authorized user must start a new analysis")


def actor(authorization: Annotated[str | None, Header()] = None):
    candidates = configured()
    if not candidates and settings().erp_mode == "demo":
        return resolve("local-demo")
    token = (authorization or "").removeprefix("Bearer ")
    sha = hashlib.sha256(token.encode()).hexdigest()
    for p in candidates:
        if authorization and authorization.startswith("Bearer ") and hmac.compare_digest(sha, p["token_sha256"]):
            return resolve(p["id"]).require("reviewer")
    raise HTTPException(401, "A valid named workspace access token is required")
