"""`Drop anything` for tabular files (doc 14 Journey B). A dataset is an immutable, user-owned upload, parsed and
profiled once. Mapping a dataset onto an ERP command is an *inference*: it is shown as such, ERP validates every
row, and only an applied ERP proposal teaches the mapping memory (never a guess on its own)."""

import csv
import hashlib
import io
import re
from datetime import date, datetime
from difflib import SequenceMatcher
from uuid import uuid4

from ..config import settings
from ..db import all_rows, connect, json, one
from ..storage import storage

MAX_BYTES = 2 * 1024 * 1024
MAX_ROWS = 2000
MAX_COLUMNS = 60
HEADER_SCAN = 10
MEDIA = {
    ".csv": "text/csv",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}
MONTHS = {
    "jan": 1, "januari": 1, "january": 1, "feb": 2, "februari": 2, "february": 2, "mar": 3, "maret": 3, "march": 3,
    "apr": 4, "april": 4, "mei": 5, "may": 5, "jun": 6, "juni": 6, "june": 6, "jul": 7, "juli": 7, "july": 7,
    "agu": 8, "agt": 8, "agustus": 8, "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9,
    "okt": 10, "oktober": 10, "oct": 10, "october": 10, "nov": 11, "nopember": 11, "november": 11,
    "des": 12, "desember": 12, "dec": 12, "december": 12,
}  # fmt: skip


class DatasetError(ValueError):
    pass


def norm(text):
    return " ".join(re.sub(r"[^0-9a-z]+", " ", str(text).lower()).split())


def _cell(value):
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return " ".join(str(value).split())


def _grid(name, body):
    suffix = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if suffix not in MEDIA:
        raise DatasetError("Unggah berkas CSV atau XLSX.")
    if suffix == ".xlsx":
        import openpyxl

        try:
            book = openpyxl.load_workbook(io.BytesIO(body), read_only=True, data_only=True)
        except Exception as exc:
            raise DatasetError("Berkas XLSX tidak dapat dibaca.") from exc
        try:
            grid = []
            for row in book.worksheets[0].iter_rows(values_only=True):
                grid.append([_cell(v) for v in row[:MAX_COLUMNS]])
                if len(grid) > MAX_ROWS + HEADER_SCAN:
                    break
        finally:
            book.close()
        return suffix, grid
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            text = body.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    delimiter = _delimiter(text)
    grid = []
    for row in csv.reader(io.StringIO(text), delimiter=delimiter):
        grid.append([_cell(v) for v in row[:MAX_COLUMNS]])
        if len(grid) > MAX_ROWS + HEADER_SCAN:
            break
    return suffix, grid


def _delimiter(text):
    """The delimiter that splits the most early lines into the same number (>1) of fields. Title lines are ignored
    naturally; csv.Sniffer is confused by them and by Indonesian Excel exports that use ';'."""
    lines = [line for line in text.splitlines()[:30] if line.strip()]
    best, score = ",", 0
    for d in (",", ";", "\t", "|"):
        counts = [len(next(csv.reader([line], delimiter=d))) for line in lines]
        common = max(set(counts), key=counts.count) if counts else 1
        if common > 1 and counts.count(common) > score:
            best, score = d, counts.count(common)
    return best


def _is_number(text):
    return bool(re.fullmatch(r"-?[\d.,]+", text))


def detect_header(grid):
    """The header is the early row with the most non-numeric labels (skips title rows such as 'Kebutuhan Q3')."""
    best, score = None, 1
    for i, row in enumerate(grid[:HEADER_SCAN]):
        labels = [c for c in row if c and not _is_number(c)]
        if len(labels) > score and len(set(map(norm, labels))) == len(labels):
            best, score = i, len(labels)
    if best is None:
        raise DatasetError("Baris judul kolom tidak ditemukan di 10 baris pertama.")
    return best


def parse(name, body):
    if len(body) > MAX_BYTES:
        raise DatasetError("Ukuran maksimum 2 MB.")
    suffix, grid = _grid(name, body)
    h = detect_header(grid)
    headers, keep = [], []
    for j, label in enumerate(grid[h]):
        if label:
            headers.append(label[:80])
            keep.append(j)
    rows = []
    for raw in grid[h + 1 :]:
        values = [raw[j] if j < len(raw) else "" for j in keep]
        if any(values):
            rows.append(dict(zip(headers, values)))
    if not rows:
        raise DatasetError("Berkas tidak memiliki baris data.")
    truncated = len(rows) > MAX_ROWS
    rows = rows[:MAX_ROWS]
    return suffix, headers, rows, {"header_row": h + 1, "truncated": truncated}


def _kind(values):
    if values and all(_is_number(v) for v in values):
        return "number"
    if values and all(to_date(v) for v in values):
        return "date"
    return "text"


def profile(headers, rows, meta):
    columns = []
    for header in headers:
        values = [r[header] for r in rows if r.get(header)]
        samples = list(dict.fromkeys(values))[:3]
        columns.append({"name": header, "filled": len(values), "kind": _kind(values[:50]), "samples": samples})
    return {"rows": len(rows), "columns": columns, **meta}


def fingerprint(headers):
    return hashlib.sha256("|".join(sorted(norm(h) for h in headers)).encode()).hexdigest()[:32]


def to_date(text):
    text = str(text).strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        return text
    m = re.fullmatch(r"(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})", text)  # Indonesian convention: day first
    if m:
        d, mo, y = map(int, m.groups())
    else:
        m = re.fullmatch(r"(\d{1,2})[ -]([A-Za-z]+)[ -,]*(\d{4})", text)
        if not m or m.group(2).lower() not in MONTHS:
            return None
        d, mo, y = int(m.group(1)), MONTHS[m.group(2).lower()], int(m.group(3))
    try:
        return date(y, mo, d).isoformat()
    except ValueError:
        return None


def _similar(a, b):
    return 1.0 if a == b else SequenceMatcher(None, a, b).ratio()


def _enum_hit(values, spec):
    options = {norm(o["code"]) for o in spec.get("enum") or []} | {norm(o["label"]) for o in spec.get("enum") or []}
    values = [norm(v) for v in values if v]
    return bool(values) and sum(v in options for v in values) / len(values) >= 0.8


def map_columns(headers, rows, command, template=None):
    """Assign dataset columns to command params. Returns {param: {"column", "basis", "score"}}.

    Basis, strongest first: `template` (a mapping this header set used in an applied import), `name` (exact
    param/label/alias), `similar` (fuzzy name ≥ 0.82), `values` (column values are this enum's codes/labels)."""
    params = {p["name"]: p for p in command["params"]}
    if template and set(template.values()) <= set(headers) and set(template) <= set(params):
        return {p: {"column": c, "basis": "template", "score": 1.0} for p, c in template.items()}
    candidates = []
    for header in headers:
        h = norm(header)
        values = [r.get(header, "") for r in rows[:50]]
        for p in params.values():
            names = {norm(p["name"]), norm(p["label"]), *(norm(a) for a in p.get("aliases") or [])}
            score = max(_similar(h, n) for n in names)
            basis = "name" if score == 1.0 else "similar"
            if score < 0.82 and p["kind"] == "enum" and _enum_hit(values, p):
                score, basis = 0.8, "values"
            if score >= 0.8:
                candidates.append((score, p["required"], header, p["name"], basis))
    mapping, used = {}, set()
    for score, _, header, param, basis in sorted(candidates, key=lambda c: (-c[0], not c[1])):
        if param not in mapping and header not in used:
            mapping[param] = {"column": header, "basis": basis, "score": round(score, 2)}
            used.add(header)
    return mapping


def best_command(headers, rows, commands, templates):
    """Pick the untargeted command this dataset fits best: all required params mapped, then most params mapped."""
    ranked = []
    for command in commands:
        if command.get("target"):
            continue
        mapping = map_columns(headers, rows, command, templates.get(command["kind"]))
        required = [p["name"] for p in command["params"] if p["required"]]
        missing = [p for p in required if p not in mapping]
        ranked.append((len(missing), -len(mapping), command["kind"], command, mapping, missing))
    ranked.sort(key=lambda r: r[:3])
    return ranked[0][3:] if ranked else (None, {}, [])


def to_items(rows, command, mapping):
    kinds = {p["name"]: p["kind"] for p in command["params"]}
    items = []
    for row in rows:
        params = {}
        for param, m in mapping.items():
            value = row.get(m["column"], "")
            if value == "":
                continue
            if kinds[param] == "date":
                value = to_date(value) or value  # unparseable dates reach ERP as-is and fail its validation visibly
            params[param] = value
        items.append({"kind": command["kind"], "params": params})
    return items


def store(principal, name, body):
    suffix, headers, rows, meta = parse(name, body)
    dataset_id = str(uuid4())
    digest = hashlib.sha256(body).hexdigest()
    key = f"agent-datasets/{dataset_id}{suffix}"
    storage().put(key, body, MEDIA[suffix])
    prof = profile(headers, rows, meta)
    prof["fingerprint"] = fingerprint(headers)
    with connect() as conn:
        row = one(
            conn,
            """INSERT INTO agent_datasets(id,principal_sub,name,media_type,sha256,object_key,size_bytes,profile,rows)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id,name,sha256,profile,created_at""",
            (dataset_id, principal.sub, name[:200], MEDIA[suffix], digest, key, len(body), json(prof), json(rows)),
        )
    return row


def load(principal, dataset_id):
    with connect() as conn:
        return one(conn, "SELECT * FROM agent_datasets WHERE id=%s AND principal_sub=%s", (dataset_id, principal.sub))


def templates(fp):
    with connect() as conn:
        rows = all_rows(conn, "SELECT command,mapping FROM agent_mapping_templates WHERE fingerprint=%s", (fp,))
    return {r["command"]: r["mapping"] for r in rows}


def learn(run, principal):
    """Called when ERP reports an applied import proposal: remember how this header set mapped."""
    result = run.get("result") or {}
    if run.get("skill") != "import_dataset" or not result.get("fingerprint") or not result.get("mapping"):
        return False
    with connect() as conn:
        conn.execute(
            """INSERT INTO agent_mapping_templates(fingerprint,command,mapping,learned_from_run,learned_by,uses)
               VALUES (%s,%s,%s,%s,%s,1)
               ON CONFLICT (fingerprint,command) DO UPDATE SET mapping=EXCLUDED.mapping,
                 learned_from_run=EXCLUDED.learned_from_run,learned_by=EXCLUDED.learned_by,
                 uses=agent_mapping_templates.uses+1,updated_at=now()""",
            (result["fingerprint"], result["command"], json(result["mapping"]), run["id"], principal.sub),
        )
    return True


def purge(limit=100):
    """Retention: delete datasets (rows and original file) older than AGENT_DATASET_DAYS. Mapping templates hold only
    header and parameter names and are kept. Objects are deleted before rows, so a failure leaves a retryable row."""
    with connect() as conn:
        old = all_rows(
            conn,
            "SELECT id,object_key FROM agent_datasets WHERE created_at < now() - %s * interval '1 day' LIMIT %s",
            (settings().agent_dataset_days, limit),
        )
    for row in old:
        storage().delete(row["object_key"])
        with connect() as conn:
            conn.execute("DELETE FROM agent_datasets WHERE id=%s", (row["id"],))
    return len(old)
