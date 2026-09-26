"""ADR-008: verify ERP-issued user delegation. Intelligence holds public keys only and never mints."""

import base64
import json as stdjson
import re
import time
from typing import Annotated

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.serialization import load_pem_public_key
from fastapi import Header, HTTPException

from .config import settings
from .identity import Principal

AUDIENCE = "celerates-intelligence"
MAX_LIFETIME = 600
SKEW = 30
UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
ALL_DIVISIONS = {"marketing", "sales", "ta", "hr", "tm", "pmo", "finance", "timesheet", "attendance", "school"}


class DelegationError(Exception):
    pass


def _b64(part):
    if not re.fullmatch(r"[A-Za-z0-9_-]+", part or ""):
        raise DelegationError("Malformed delegation")
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def _keys():
    configured = stdjson.loads(settings().erp_delegation_public_keys or "{}")
    if not isinstance(configured, dict):
        raise DelegationError("ERP_DELEGATION_PUBLIC_KEYS must be a JSON object of kid to PEM")
    keys = {}
    for kid, pem in configured.items():
        key = load_pem_public_key(pem.replace("\\n", "\n").encode())
        if not isinstance(key, Ed25519PublicKey):
            raise DelegationError("Delegation keys must be Ed25519")
        keys[kid] = key
    return keys


def verify(token, now=None):
    """Return verified claims or raise DelegationError. Never trusts unsigned header content beyond kid lookup."""
    if not token or len(token) > 8192 or token.count(".") != 2:
        raise DelegationError("Malformed delegation")
    head, body, signature = token.split(".")
    header = stdjson.loads(_b64(head))
    if header.get("alg") != "EdDSA" or header.get("typ") != "JWT":
        raise DelegationError("Unsupported delegation algorithm")
    key = _keys().get(header.get("kid"))
    if not key:
        raise DelegationError("Unknown delegation key")
    try:
        key.verify(_b64(signature), f"{head}.{body}".encode())
    except InvalidSignature as exc:
        raise DelegationError("Invalid delegation signature") from exc
    claims = stdjson.loads(_b64(body))
    now = int(now if now is not None else time.time())
    if claims.get("iss") != f"celerates-erp:{settings().erp_environment}" or claims.get("aud") != AUDIENCE:
        raise DelegationError("Delegation issuer or audience mismatch")
    iat, exp = claims.get("iat"), claims.get("exp")
    if not isinstance(iat, int) or not isinstance(exp, int) or exp <= iat or exp - iat > MAX_LIFETIME:
        raise DelegationError("Invalid delegation lifetime")
    if iat > now + SKEW or exp < now - SKEW:
        raise DelegationError("Delegation expired")
    if "agent" not in (claims.get("scope") or []) or not UUID.match(str(claims.get("sub", ""))):
        raise DelegationError("Delegation scope or subject invalid")
    if not isinstance(claims.get("jti"), str) or not 8 <= len(claims["jti"]) <= 100:
        raise DelegationError("Delegation id invalid")
    return claims


class DelegatedPrincipal(Principal):
    """An ERP user acting through the Agent. Role `agent` only: no workspace review or curation."""

    def __new__(cls, claims, token):
        owner = claims.get("owner") is True
        divisions = (
            ALL_DIVISIONS
            if owner
            else {
                a["division"]
                for a in claims.get("access") or []
                if isinstance(a, dict) and a.get("level") in {"viewer", "editor", "full"}
            }
        )
        obj = super().__new__(cls, "erp:" + claims["sub"], ["agent"], divisions, owner)
        obj.sub = claims["sub"]
        obj.display_name = str(claims.get("name") or "ERP user")[:120]
        obj.owner = owner
        obj.jti = claims["jti"]
        obj.context = claims.get("ctx") if isinstance(claims.get("ctx"), dict) else {}
        obj.token = token
        return obj


def delegated_actor(x_erp_delegation: Annotated[str | None, Header()] = None):
    try:
        claims = verify(x_erp_delegation or "")
    except (DelegationError, ValueError, TypeError) as exc:
        raise HTTPException(401, "A valid ERP delegation is required") from exc
    return DelegatedPrincipal(claims, x_erp_delegation)
