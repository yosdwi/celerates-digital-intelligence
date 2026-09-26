"""Deterministic playbooks (doc 15 §2.8). No model: every sentence is assembled from tool results, and each
fact the user sees is also emitted as typed evidence (ERP fact, signal, approved knowledge)."""

import logging
import time
from concurrent.futures import ThreadPoolExecutor

from ..config import settings
from . import runs
from .erp_client import DelegatedERP, ERPAgentError
from .tools import PolicyError, RunContext, invoke

PLAYBOOK_VERSION = "m1-playbooks-v1"
SKILLS = {"explain_signal", "explain_entity", "search"}
MAX_EXAMPLES = 3
log = logging.getLogger(__name__)
_pool = None


def pool():
    global _pool
    if _pool is None:
        _pool = ThreadPoolExecutor(max_workers=settings().agent_workers, thread_name_prefix="agent-run")
    return _pool


def _entity_evidence(entity):
    facts = [f"{f['label']}: {f['value']}" for f in entity.get("fields", []) if f.get("value") not in (None, "")]
    commercial = [f"{c['label']}: {c['state']}" for c in entity.get("commercial", [])]
    return {
        "type": "erp_fact",
        "title": f"{entity['type_label']} {entity['label']}",
        "detail": facts[:8] + commercial,
        "href": entity.get("href"),
        "source": {
            "kind": "erp",
            "ref": f"{entity['type']}/{entity['id']}",
            "version": entity.get("record_version"),
            "as_of": entity.get("as_of"),
        },
        "withheld": [w["name"] for w in entity.get("withheld", [])],
    }


def _relation_evidence(entity, edges):
    detail = []
    for edge in edges:
        names = ", ".join(i["label"] for i in edge["items"][:3])
        basis = " (cocok nama, bukan FK)" if edge["kind"] == "name_match" else ""
        detail.append(f"{edge['label']}: {edge['count']}{basis}" + (f" — {names}" if names else ""))
    return {
        "type": "erp_fact",
        "title": f"Relasi {entity['label']}",
        "detail": detail,
        "href": entity.get("href"),
        "source": {"kind": "erp", "ref": f"{entity['type']}/{entity['id']}/neighbours", "as_of": entity.get("as_of")},
    }


def _knowledge_evidence(passages):
    return [
        {
            "type": "knowledge",
            "title": f"{p['title']} · v{p['version']}",
            "detail": [p["excerpt"]],
            "source": {"kind": "knowledge", "ref": p["document_id"], "version": p["version"], "sha256": p["sha256"]},
            "match": p["match"],
        }
        for p in passages
    ]


def _relations_line(edges):
    return " · ".join(f"{e['label']}: {e['count']}" for e in edges) or "tidak ada relasi terdaftar di katalog"


def explain_signal(ctx, signal_key):
    with ctx.recorder.step("Membaca sinyal ERP"):
        signal = invoke(ctx, "erp_signal_detail", signal_key=signal_key)["signal"]
    ctx.recorder.evidence(
        [
            {
                "type": "signal",
                "title": signal["title"],
                "detail": [signal["rule"], f"{signal['count']} {signal['unit']} · {signal['source']}"],
                "href": signal["href"],
                "source": {"kind": "erp_rule", "ref": signal["key"], "as_of": signal.get("as_of")},
            }
        ]
    )
    examined = []
    if signal.get("entity_type"):
        for item in signal["items"][:MAX_EXAMPLES]:
            with ctx.recorder.step(f"Memeriksa {item['label']}"):
                entity = invoke(ctx, "erp_read_entity", entity_type=signal["entity_type"], entity_id=item["id"])[
                    "entity"
                ]
                edges = invoke(ctx, "erp_entity_neighbours", entity_type=entity["type"], entity_id=entity["id"])[
                    "edges"
                ]
            ctx.recorder.evidence([_entity_evidence(entity), _relation_evidence(entity, edges)])
            examined.append((entity, edges))
    with ctx.recorder.step("Mencari pengetahuan yang disetujui"):
        passages = invoke(ctx, "knowledge_search", query=f"{signal['title']} {signal['rule']}")["passages"]
    ctx.recorder.evidence(_knowledge_evidence(passages))

    lines = [f"{signal['title']}: {signal['count']} {signal['unit']} memenuhi aturan ini.", f"Aturan: {signal['rule']}"]
    if examined:
        lines.append(f"Diperiksa {len(examined)} contoh langsung dari ERP:")
        lines += [f"• {e['label']} — {_relations_line(edges)}" for e, edges in examined]
    elif signal["count"]:
        lines.append(
            "Record untuk sinyal ini belum ada di Katalog Entitas v1, jadi hanya aturan dan contohnya yang ditampilkan."
        )
    lines.append(
        f"Pengetahuan disetujui yang relevan: {len(passages)} sumber."
        if passages
        else "Belum ada pengetahuan disetujui yang relevan untuk sinyal ini."
    )
    lines.append(f"Langkah berikut: {signal['action']}.")
    ctx.recorder.message("\n".join(lines))
    return {
        "skill": "explain_signal",
        "signal_key": signal["key"],
        "count": signal["count"],
        "examined": [e["id"] for e, _ in examined],
        "knowledge": len(passages),
    }


def explain_entity(ctx, entity_type, entity_id):
    with ctx.recorder.step("Membaca record dari ERP"):
        entity = invoke(ctx, "erp_read_entity", entity_type=entity_type, entity_id=entity_id)["entity"]
        edges = invoke(ctx, "erp_entity_neighbours", entity_type=entity_type, entity_id=entity_id)["edges"]
    with ctx.recorder.step("Memeriksa sinyal perhatian"):
        signals = invoke(ctx, "erp_entity_signals", entity_type=entity_type, entity_id=entity_id)["signals"]
    matching = [s for s in signals if s["matches"]]
    evidence = [_entity_evidence(entity), _relation_evidence(entity, edges)]
    evidence += [
        {
            "type": "signal",
            "title": s["title"],
            "detail": [s["rule"]],
            "href": s["href"],
            "source": {"kind": "erp_rule", "ref": s["key"]},
        }
        for s in matching
    ]
    ctx.recorder.evidence(evidence)
    with ctx.recorder.step("Mencari pengetahuan yang disetujui"):
        passages = invoke(ctx, "knowledge_search", query=f"{entity['type_label']} {entity['label']}")["passages"]
    ctx.recorder.evidence(_knowledge_evidence(passages))
    lines = [f"{entity['type_label']} {entity['label']}", f"Relasi: {_relations_line(edges)}"]
    lines.append(
        "Sinyal perhatian yang cocok: " + "; ".join(s["title"] for s in matching)
        if matching
        else f"Tidak ada dari {len(signals)} sinyal perhatian untuk jenis record ini yang cocok saat ini."
    )
    if entity.get("withheld"):
        lines.append(f"{len(entity['withheld'])} field sensitif tidak dibagikan ke Agent.")
    lines.append(
        f"Pengetahuan disetujui yang relevan: {len(passages)} sumber."
        if passages
        else "Belum ada pengetahuan disetujui yang relevan."
    )
    ctx.recorder.message("\n".join(lines))
    return {"skill": "explain_entity", "entity": f"{entity_type}/{entity_id}", "signals": len(matching)}


def search(ctx, query):
    with ctx.recorder.step("Mencari di ERP"):
        found = invoke(ctx, "erp_search", query=query)
    ctx.recorder.evidence(
        [
            {
                "type": "erp_fact",
                "title": f"{r['type_label']} {r['label']}",
                "detail": [f"Cocok pada {r['matched_field']}"],
                "href": r.get("href"),
                "source": {"kind": "erp", "ref": f"{r['type']}/{r['id']}", "as_of": found.get("as_of")},
            }
            for r in found["results"]
        ]
    )
    with ctx.recorder.step("Mencari pengetahuan yang disetujui"):
        passages = invoke(ctx, "knowledge_search", query=query)["passages"]
    ctx.recorder.evidence(_knowledge_evidence(passages))
    total = len(found["results"])
    lines = [
        f'Pencarian kata kunci "{found["query"]}": {total} record ERP'
        + (" (dibatasi)" if found.get("truncated") else "")
        + f" dan {len(passages)} sumber pengetahuan disetujui."
    ]
    if not total and not passages:
        lines.append("Tidak ada hasil. Coba kata kunci lain, misalnya nomor opportunity atau nama client.")
    lines.append("Pencarian ini berbasis kata kunci tanpa model bahasa; pencarian semantik menyusul (M2).")
    ctx.recorder.message("\n".join(lines))
    return {"skill": "search", "query": found["query"], "erp_results": total, "knowledge": len(passages)}


PLAYBOOKS = {"explain_signal": explain_signal, "explain_entity": explain_entity, "search": search}

MESSAGES = {
    401: "Sesi ERP untuk Agent tidak valid lagi. Muat ulang halaman.",
    403: "Anda tidak memiliki akses ERP untuk data ini.",
    404: "Data tidak ditemukan atau tidak tersedia untuk Agent.",
}


def execute(run, principal, args):
    recorder = runs.Recorder(run)
    ctx = RunContext(
        principal=principal,
        recorder=recorder,
        erp=DelegatedERP(principal),
        deadline=time.monotonic() + settings().agent_max_seconds,
        path=str(principal.context.get("path") or "/"),
    )
    try:
        recorder.started()
        result = PLAYBOOKS[run["skill"]](ctx, **args)
        recorder.finished(result)
    except ERPAgentError as exc:
        recorder.error(MESSAGES.get(exc.status, "ERP belum dapat dihubungi. Coba lagi."), f"ERP_{exc.status}")
    except PolicyError as exc:
        recorder.error(str(exc), "POLICY")
    except TimeoutError:
        recorder.error("Batas waktu Agent tercapai. Coba lagi.", "BUDGET")
    except Exception:
        # Never persist raw transport/provider errors: they may carry payloads or credentials.
        log.exception("Agent run failed: %s", run["id"])
        recorder.error("Agent gagal menyelesaikan permintaan. Coba lagi.", "INTERNAL")


def start(run, principal, args):
    pool().submit(execute, run, principal, args)
