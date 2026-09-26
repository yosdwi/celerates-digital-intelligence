"""Tool registry (ADR-013). Our metadata is the source of truth: risk class, required module, output bounds.

Risk classes: `read` (delegated ERP/knowledge reads) and `propose` (creates an ERP-held pending proposal, ADR-010).
There is deliberately no `write` class: no tool here can change ERP state. Playbooks call tools through `invoke`, which
checks policy before calling and records the call as AG-UI tool events. A model loop receives only `allowed_tools`.
"""

import time
from dataclasses import dataclass, field
from typing import Callable

from .. import knowledge
from . import datasets
from .erp_client import DelegatedERP

MAX_TOOL_CALLS = 12
EXCERPT = 280


class PolicyError(PermissionError):
    pass


@dataclass
class RunContext:
    principal: object
    recorder: object
    erp: DelegatedERP
    deadline: float
    path: str = "/"
    calls: int = 0
    read_opportunities: set = field(default_factory=set)
    proposals: list = field(default_factory=list)


@dataclass(frozen=True)
class Tool:
    name: str
    version: str
    risk: str
    description: str
    fn: Callable
    module: str | None = None  # None: module is decided per entity by ERP (catalog); ERP always re-checks.


REGISTRY: dict[str, Tool] = {}
RISKS = {"read", "propose"}


def register(name, version, description, module=None, risk="read"):
    def wrap(fn):
        if risk not in RISKS:
            raise ValueError("Only read and propose tools can be registered; ERP applies effects (ADR-010)")
        REGISTRY[name] = Tool(name, version, risk, description, fn, module)
        return fn

    return wrap


def allowed_tools(principal):
    return [t for t in REGISTRY.values() if t.risk in RISKS and (t.module is None or t.module in principal.divisions)]


def invoke(ctx: RunContext, name, **args):
    tool = REGISTRY.get(name)
    if not tool or tool not in allowed_tools(ctx.principal):
        raise PolicyError(f"Tool {name} is not available to this user")
    if ctx.calls >= MAX_TOOL_CALLS or time.monotonic() > ctx.deadline:
        raise TimeoutError("Agent run budget exhausted")
    ctx.calls += 1
    result = tool.fn(ctx, **args)
    ctx.recorder.tool(name, args, result)
    return result


@register("erp_signal_detail", "1", "Deterministic ERP attention rule with exact count and sample records")
def signal_detail(ctx, signal_key, items=5):
    return ctx.erp.signal(signal_key, ctx.path, items)


@register("erp_read_entity", "1", "Catalog projection of one ERP record; sensitive fields filtered by ERP")
def read_entity(ctx, entity_type, entity_id):
    result = ctx.erp.entity(entity_type, entity_id)
    if entity_type == "sales_opportunity":
        ctx.read_opportunities.add(entity_id)
    return result


@register("erp_entity_neighbours", "1", "Related ERP records through catalog-declared relationships")
def entity_neighbours(ctx, entity_type, entity_id):
    return ctx.erp.neighbours(entity_type, entity_id)


@register("erp_entity_signals", "1", "Which deterministic attention rules currently match this record")
def entity_signals(ctx, entity_type, entity_id):
    return ctx.erp.entity_signals(entity_type, entity_id)


@register("erp_search", "1", "Case-insensitive search over catalog-declared, non-sensitive ERP fields")
def erp_search(ctx, query):
    return ctx.erp.search(query)


@register("knowledge_search", "1", "Approved, active governed knowledge the user may read")
def knowledge_search(ctx, query):
    rows = knowledge.search_for_principal(query, ctx.principal, sorted(ctx.read_opportunities))
    return {
        "passages": [
            {
                "source_id": r["source_id"],
                "document_id": r["document_id"],
                "title": r["title"],
                "kind": r["source_kind"],
                "version": r["source_version"],
                "sha256": r["sha256"],
                "scope": f"{r['scope_type']}:{r['scope_id']}",
                "approved_at": r["approved_at"],
                "excerpt": " ".join(r["text"].split())[:EXCERPT],
                "match": "keyword" if r["lexical_match"] else "similarity",
            }
            for r in rows
        ]
    }


@register(
    "erp_catalog", "1", "ERP entity catalog and the command allowlist the Agent may propose (with parameter specs)"
)
def erp_catalog(ctx):
    return ctx.erp.catalog()


@register(
    "erp_propose",
    "1",
    "Create an ERP-held pending proposal; ERP validates each item and only the user can confirm it in ERP",
    risk="propose",
)
def erp_propose(ctx, title, items):
    run_id = ctx.recorder.run["id"]
    proposal = ctx.erp.propose(f"run:{run_id}", title, items, run_id, ctx.path)
    ctx.proposals.append(proposal["id"])
    return {
        "id": proposal["id"],
        "state": proposal["state"],
        "title": proposal["title"],
        "counts": proposal["counts"],
        "items": len(proposal["items"]),
        "expires_at": proposal["expires_at"],
    }


@register("dataset_read", "1", "A dataset the user uploaded to this Agent: profile and rows (owner only)")
def dataset_read(ctx, dataset_id):
    row = datasets.load(ctx.principal, dataset_id)
    if not row:
        raise PolicyError("Berkas tidak ditemukan untuk pengguna ini")
    return {
        "id": row["id"],
        "name": row["name"],
        "sha256": row["sha256"],
        "profile": row["profile"],
        "rows": row["rows"],
    }
