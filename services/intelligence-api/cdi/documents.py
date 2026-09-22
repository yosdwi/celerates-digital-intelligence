import hashlib
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

from .db import all_rows, connect, json, one
from .gateway import ModelGateway
from .storage import storage

ALLOWED = {".txt", ".md", ".csv", ".pdf", ".docx", ".xlsx"}


def register(opportunity_id, name, body, media_type, source_url=None):
    if Path(name).suffix.lower() not in ALLOWED:
        raise ValueError("Supported files: TXT, Markdown, CSV, PDF, DOCX, XLSX")
    if not body:
        raise ValueError("Document is empty")
    sha = hashlib.sha256(body).hexdigest()
    key = f"documents/{opportunity_id}/{sha}/{Path(name).name}"
    with connect() as conn:
        conn.execute("INSERT INTO workspaces(opportunity_id) VALUES (%s) ON CONFLICT DO NOTHING", (opportunity_id,))
        one(conn, "SELECT * FROM workspaces WHERE opportunity_id=%s FOR UPDATE", (opportunity_id,))
        if one(
            conn,
            "SELECT 1 FROM runs WHERE opportunity_id=%s AND state IN ('QUEUED','INGESTING','ANALYZING','REVIEW_REQUIRED','RESUMING')",
            (opportunity_id,),
        ):
            raise ValueError("Complete the current review or request clarification before adding evidence")
        old = one(conn, "SELECT * FROM documents WHERE opportunity_id=%s AND sha256=%s", (opportunity_id, sha))
        if old:
            return old
        storage().put(key, body, media_type)
        row = one(
            conn,
            "INSERT INTO documents(id,opportunity_id,name,object_key,sha256,media_type,size_bytes,source_url) "
            "VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *",
            (str(uuid4()), opportunity_id, Path(name).name, key, sha, media_type, len(body), source_url),
        )
        conn.execute(
            "INSERT INTO ingestion_audit(id,source,connector,state,accepted,detail) VALUES (%s,%s,%s,%s,1,%s)",
            (str(uuid4()), name, "document-upload", "REGISTERED", json({"document_id": row["id"], "sha256": sha})),
        )
        return row


def parse_document(document):
    body = storage().get(document["object_key"])
    if hashlib.sha256(body).hexdigest() != document["sha256"]:
        raise ValueError("Object checksum mismatch")
    suffix = Path(document["name"]).suffix.lower()
    if suffix in {".txt", ".md", ".csv"}:
        return body.decode("utf-8-sig"), "utf8-text-v1"
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
    except ImportError as exc:
        raise RuntimeError("Docling is not installed. Install the documents extra or upload TXT/Markdown.") from exc
    with TemporaryDirectory() as directory:
        path = Path(directory) / ("source" + suffix)
        path.write_bytes(body)
        # PDF models may require an initial download; errors are explicit and retryable.
        options = PdfPipelineOptions(do_ocr=False, do_table_structure=False)
        converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
        result = converter.convert(path)
        return result.document.export_to_markdown(), "docling-v2"


def ingest(opportunity_id):
    with connect() as conn:
        documents = all_rows(
            conn, "SELECT * FROM documents WHERE opportunity_id=%s ORDER BY created_at", (opportunity_id,)
        )
    if not documents:
        raise ValueError("Attach at least one source document before analysis")
    gateway = ModelGateway()
    for document in documents:
        if document["state"] == "INGESTED":
            continue
        try:
            text, parser = parse_document(document)
            if not text.strip():
                raise ValueError("No extractable text found; attach a text transcription")
            if len(text) > 500_000:
                raise ValueError("Extracted document exceeds the P0 text limit")
            chunks = [text[i : i + 1200] for i in range(0, len(text), 1000)]
            vectors = [gateway.embed(chunk) for chunk in chunks]
            with connect() as conn:
                conn.execute("DELETE FROM chunks WHERE document_id=%s", (document["id"],))
                for i, (chunk, (embedding, model)) in enumerate(zip(chunks, vectors)):
                    conn.execute(
                        "INSERT INTO chunks(id,document_id,ordinal,text,embedding,embedding_model) "
                        "VALUES (%s,%s,%s,%s,%s::vector,%s)",
                        (f"{document['id']}:{i}", document["id"], i, chunk, str(embedding), model),
                    )
                conn.execute(
                    "UPDATE documents SET state='INGESTED',extracted_text=%s,parser=%s,error=NULL WHERE id=%s",
                    (text, parser, document["id"]),
                )
                conn.execute(
                    "UPDATE ingestion_audit SET state='INGESTED', detail=detail || %s WHERE detail->>'document_id'=%s",
                    (json({"chunks": len(chunks), "parser": parser}), document["id"]),
                )
        except Exception as exc:
            with connect() as conn:
                conn.execute(
                    "UPDATE documents SET state='FAILED',error=%s WHERE id=%s", (str(exc)[:300], document["id"])
                )
            raise
    with connect() as conn:
        return all_rows(
            conn,
            "SELECT id,name,sha256,extracted_text,parser FROM documents WHERE opportunity_id=%s",
            (opportunity_id,),
        )


def retrieve(opportunity_id, query):
    embedding, model = ModelGateway().embed(query)
    with connect() as conn:
        return all_rows(
            conn,
            """SELECT c.id,c.document_id,d.name,c.text,
            ts_rank(c.search,plainto_tsquery('english',%s)) AS keyword_rank,
            1 - (c.embedding <=> %s::vector) AS vector_score
            FROM chunks c JOIN documents d ON d.id=c.document_id
            WHERE d.opportunity_id=%s AND c.embedding_model=%s
            ORDER BY (ts_rank(c.search,plainto_tsquery('english',%s)) +
                      (1 - (c.embedding <=> %s::vector))) DESC LIMIT 8""",
            (query, str(embedding), opportunity_id, model, query, str(embedding)),
        )
