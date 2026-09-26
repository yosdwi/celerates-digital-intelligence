"""Deterministic playbooks (doc 15 §2.8). No model: every sentence is assembled from tool results, and each
fact the user sees is also emitted as typed evidence (ERP fact, signal, approved knowledge, user file, inference).

Playbooks that end in action (`follow_up_signal`, `import_dataset`) only *propose*: ERP stores and validates the
proposal, and the user confirms it in ERP (ADR-010). Which command remedies a signal is declared by ERP, and which
command a file maps to is chosen from ERP's command specs, so neither is a per-workflow branch here."""

import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from ..config import settings
from . import datasets, runs
from .erp_client import DelegatedERP, ERPAgentError
from .tools import PolicyError, RunContext, invoke

PLAYBOOK_VERSION = "m2-playbooks-v1"
MAX_EXAMPLES = 3
FOLLOW_UP_ITEMS = 10
IMPORT_ITEMS = 200  # ERP's proposal limit
JAKARTA = ZoneInfo("Asia/Jakarta")
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


def _signal_evidence(signal):
    return {
        "type": "signal",
        "title": signal["title"],
        "detail": [signal["rule"], f"{signal['count']} {signal['unit']} · {signal['source']}"],
        "href": signal["href"],
        "source": {"kind": "erp_rule", "ref": signal["key"], "as_of": signal.get("as_of")},
    }


def explain_signal(ctx, signal_key):
    with ctx.recorder.step("Membaca sinyal ERP"):
        signal = invoke(ctx, "erp_signal_detail", signal_key=signal_key)["signal"]
    ctx.recorder.evidence([_signal_evidence(signal)])
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


def _proposal_lines(proposal):
    c = proposal["counts"]
    lines = [f"Usulan disiapkan di ERP: {proposal['items']} item — {c['ok']} siap, {c['warning']} perlu dicek"]
    if c["needs_input"]:
        lines[-1] += f", {c['needs_input']} perlu Anda lengkapi"
    if c["invalid"]:
        lines[-1] += f", {c['invalid']} tidak dapat diterapkan"
    lines[-1] += "."
    lines.append("Belum ada data yang berubah. Tinjau, ubah bila perlu, lalu konfirmasi di kartu usulan.")
    return lines


def _task_item(signal, record):
    due = (datetime.now(JAKARTA).date() + timedelta(days=3)).isoformat()
    label = f" — {record['label']}" if record else ""
    return {
        "kind": "task.create",
        "target": {"type": signal["entity_type"], "id": record["id"]} if record and signal.get("entity_type") else None,
        "params": {
            "title": f"Tindak lanjut: {signal['title']}{label}"[:200],
            "description": f"{signal['rule']}\nLangkah: {signal['action']}.\nSumber: {signal['source']} ({signal['href']})",
            "due_date": due,
        },
    }


def follow_up_signal(ctx, signal_key):
    """Signal → proposal. ERP declares the remedy command for each rule; records outside the catalog get one task."""
    with ctx.recorder.step("Membaca sinyal ERP"):
        signal = invoke(ctx, "erp_signal_detail", signal_key=signal_key, items=FOLLOW_UP_ITEMS)["signal"]
    ctx.recorder.evidence([_signal_evidence(signal)])
    if not signal["count"]:
        ctx.recorder.message(
            f"{signal['title']}: tidak ada record yang memenuhi aturan saat ini. Tidak ada yang perlu ditindaklanjuti."
        )
        return {"skill": "follow_up_signal", "signal_key": signal["key"], "count": 0, "proposal": None}
    remedy = signal.get("remedy") or "task.create"
    records = signal["items"][:FOLLOW_UP_ITEMS] if signal.get("entity_type") else []
    if remedy != "task.create" and records:
        items = [
            {"kind": remedy, "target": {"type": signal["entity_type"], "id": r["id"]}, "params": {}} for r in records
        ]
    elif records:
        items = [_task_item(signal, r) for r in records]
    else:
        items = [_task_item(signal, None)]
    with ctx.recorder.step("Menyiapkan usulan tindak lanjut di ERP"):
        proposal = invoke(ctx, "erp_propose", title=f"Tindak lanjut: {signal['title']}", items=items)
    ctx.recorder.proposal({"id": proposal["id"], "title": proposal["title"]})
    lines = [f"{signal['title']}: {signal['count']} {signal['unit']} memenuhi aturan ini."]
    if signal["count"] > len(items) and records:
        lines.append(f"Usulan mencakup {len(items)} record pertama; sisanya dapat ditindaklanjuti setelah ini.")
    lines += _proposal_lines(proposal)
    ctx.recorder.message("\n".join(lines))
    return {
        "skill": "follow_up_signal",
        "signal_key": signal["key"],
        "count": signal["count"],
        "proposal": proposal["id"],
    }


BASIS = {
    "template": "sama seperti impor sebelumnya yang diterapkan",
    "name": "nama kolom",
    "similar": "nama mirip",
    "values": "isi kolom",
}


def import_dataset(ctx, dataset_id):
    """File → ERP command rows. The target command is the one whose ERP param specs the columns fit best."""
    with ctx.recorder.step("Membaca berkas"):
        data = invoke(ctx, "dataset_read", dataset_id=dataset_id)
    prof = data["profile"]
    ctx.recorder.evidence(
        [
            {
                "type": "document",
                "title": data["name"],
                "detail": [
                    f"{prof['rows']} baris · {len(prof['columns'])} kolom · judul kolom di baris {prof['header_row']}"
                ]
                + [f"{c['name']}: {', '.join(c['samples'])}" for c in prof["columns"][:8]],
                "source": {"kind": "upload", "ref": data["id"], "sha256": data["sha256"]},
            }
        ]
    )
    with ctx.recorder.step("Mencocokkan kolom dengan perintah ERP"):
        commands = invoke(ctx, "erp_catalog")["commands"]
        headers = [c["name"] for c in prof["columns"]]
        command, mapping, missing = datasets.best_command(
            headers, data["rows"], commands, datasets.templates(prof["fingerprint"])
        )
    if not command:
        ctx.recorder.message("Belum ada perintah ERP yang dapat menerima berkas ini.")
        return {"skill": "import_dataset", "dataset_id": dataset_id, "proposal": None}
    labels = {p["name"]: p["label"] for p in command["params"]}
    learned = all(m["basis"] == "template" for m in mapping.values()) and bool(mapping)
    ctx.recorder.evidence(
        [
            {
                "type": "observation" if learned else "inference",
                "title": f"Pemetaan kolom → {command['label']}",
                "detail": [f"{m['column']} → {labels[p]} ({BASIS[m['basis']]})" for p, m in mapping.items()]
                + [f"Tidak dipakai: {h}" for h in headers if h not in {m["column"] for m in mapping.values()}],
                "source": {"kind": "mapping", "ref": prof["fingerprint"], "command": command["kind"]},
            }
        ]
    )
    if missing:
        need = ", ".join(labels[m] for m in missing)
        ctx.recorder.message(
            f"Berkas {data['name']} paling cocok dengan “{command['label']}”, tetapi kolom wajib belum ditemukan: {need}.\n"
            "Tambahkan atau ganti nama kolom tersebut, lalu unggah ulang. Tidak ada usulan yang dibuat."
        )
        return {
            "skill": "import_dataset",
            "dataset_id": dataset_id,
            "command": command["kind"],
            "missing": missing,
            "proposal": None,
        }
    rows = data["rows"][:IMPORT_ITEMS]
    with ctx.recorder.step("Memvalidasi setiap baris di ERP"):
        proposal = invoke(
            ctx,
            "erp_propose",
            title=f"Impor {data['name']}: {len(rows)} × {command['label']}"[:200],
            items=datasets.to_items(rows, command, mapping),
        )
    ctx.recorder.proposal({"id": proposal["id"], "title": proposal["title"]})
    lines = [
        f"Berkas {data['name']}: {prof['rows']} baris dipetakan ke “{command['label']}”"
        + (" dengan pemetaan yang pernah Anda terapkan." if learned else ".")
    ]
    if prof["rows"] > len(rows) or prof.get("truncated"):
        lines.append(f"Usulan mencakup {len(rows)} baris pertama (batas satu usulan).")
    lines += _proposal_lines(proposal)
    ctx.recorder.message("\n".join(lines))
    return {
        "skill": "import_dataset",
        "dataset_id": dataset_id,
        "command": command["kind"],
        "fingerprint": prof["fingerprint"],
        "mapping": {p: m["column"] for p, m in mapping.items()},
        "proposal": proposal["id"],
    }


PLAYBOOKS = {
    "explain_signal": explain_signal,
    "explain_entity": explain_entity,
    "search": search,
    "follow_up_signal": follow_up_signal,
    "import_dataset": import_dataset,
}
SKILLS = set(PLAYBOOKS)

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
        if exc.status == 422 and exc.code == "SCHEMA":
            recorder.error("ERP menolak usulan karena formatnya tidak valid. Tidak ada perubahan.", "ERP_422")
        else:
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
