"""`Drop anything` for documents (PDF, DOCX, TXT, Markdown). Text is extracted deterministically, split into
page-aware chunks and kept owner-only in `agent_datasets` (kind='document'). Nothing here is knowledge: a dropped
document is the user's working material for this conversation, cited as *Berkas Anda* and purged with datasets."""

import io
import re
import zipfile
from xml.etree import ElementTree

from .. import retrieval
from ..db import all_rows, connect

MAX_BYTES = 8 * 1024 * 1024
MAX_PAGES = 200
MAX_CHARS = 400_000
CHUNK = 900
MEDIA = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".txt": "text/plain",
    ".md": "text/markdown",
}
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class DocumentError(ValueError):
    pass


def _pdf(body):
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(body))
        if reader.is_encrypted:
            raise DocumentError("PDF terkunci kata sandi belum didukung.")
        pages = [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages[:MAX_PAGES])]
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("PDF tidak dapat dibaca.") from exc
    if not any(text.strip() for _, text in pages):
        raise DocumentError("PDF ini tidak memiliki teks (hasil scan). OCR belum didukung.")
    return pages


def _docx(body):
    try:
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            info = archive.getinfo("word/document.xml")
            if info.file_size > 20 * 1024 * 1024:
                raise DocumentError("Isi DOCX terlalu besar.")
            root = ElementTree.fromstring(archive.read(info))
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("DOCX tidak dapat dibaca.") from exc
    lines = []
    body_el = root.find(f"{W}body")
    for block in body_el if body_el is not None else []:
        if block.tag == f"{W}p":
            lines.append("".join(t.text or "" for t in block.iter(f"{W}t")))
        elif block.tag == f"{W}tbl":
            for row in block.iter(f"{W}tr"):
                cells = ["".join(t.text or "" for t in cell.iter(f"{W}t")).strip() for cell in row.iter(f"{W}tc")]
                lines.append(" | ".join(cells))
            lines.append("")
    return [(1, "\n".join(lines))]


def _text(body):
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return [(1, body.decode(encoding))]
        except UnicodeDecodeError:
            continue


def _chunks(pages):
    chunks, total = [], 0
    for page, text in pages:
        buffer = ""
        for para in re.split(r"\n\s*\n", text.replace("\r", "")):
            para = " ".join(para.split())
            if not para:
                continue
            if buffer and len(buffer) + len(para) > CHUNK:
                chunks.append({"ordinal": len(chunks) + 1, "page": page, "text": buffer})
                buffer = ""
            buffer = f"{buffer}\n{para}".strip() if buffer else para
            while len(buffer) > CHUNK * 2:  # a single very long paragraph (common in PDF text)
                cut = buffer.rfind(" ", 0, CHUNK) if " " in buffer[:CHUNK] else CHUNK
                chunks.append({"ordinal": len(chunks) + 1, "page": page, "text": buffer[:cut]})
                buffer = buffer[cut:].strip()
        if buffer:
            chunks.append({"ordinal": len(chunks) + 1, "page": page, "text": buffer})
        total += len(text)
        if total > MAX_CHARS:
            break
    return chunks


def _headings(pages):
    found = []
    for _, text in pages:
        for line in text.splitlines():
            line = " ".join(line.split())
            if (
                3 <= len(line) <= 80
                and not line.endswith((".", ",", ";"))
                and (re.match(r"^(\d+(\.\d+)*[.)]?|[A-Z]\.|BAB|Pasal|Section)\s", line) or line.isupper())
            ):
                found.append(line)
    return list(dict.fromkeys(found))[:12]


def parse(name, body):
    suffix = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if suffix not in MEDIA:
        raise DocumentError("Unggah PDF, DOCX, TXT atau Markdown.")
    if len(body) > MAX_BYTES:
        raise DocumentError("Ukuran maksimum dokumen 8 MB.")
    pages = _pdf(body) if suffix == ".pdf" else _docx(body) if suffix == ".docx" else _text(body)
    chunks = _chunks(pages)
    if not chunks:
        raise DocumentError("Dokumen tidak memiliki teks.")
    profile = {
        "kind": "document",
        "pages": max(p for p, _ in pages),
        "chunks": len(chunks),
        "chars": sum(len(c["text"]) for c in chunks),
        "headings": _headings(pages),
        "preview": chunks[0]["text"][:280],
    }
    return suffix, profile, chunks


def search(principal, dataset_id, query, limit=4):
    """Owner-only lexical search over one document's chunks, with the same Indonesian + English query as knowledge."""
    with connect() as conn:
        return all_rows(
            conn,
            f"""WITH q AS (SELECT {retrieval.TSQUERY_SQL} AS terms), c AS (
                  SELECT (x->>'ordinal')::int AS ordinal, (x->>'page')::int AS page, x->>'text' AS text,
                         to_tsvector('indonesian', x->>'text') || to_tsvector('english', x->>'text')
                           || to_tsvector('simple', x->>'text') AS v
                  FROM agent_datasets d, jsonb_array_elements(d.rows) x
                  WHERE d.id=%s AND d.principal_sub=%s AND d.kind='document')
                SELECT ordinal, page, text, ts_rank_cd(c.v, q.terms) AS rank FROM c, q WHERE c.v @@ q.terms
                ORDER BY rank DESC, ordinal LIMIT %s""",
            (*retrieval.tsquery_params(query), dataset_id, principal.sub, limit),
        )
