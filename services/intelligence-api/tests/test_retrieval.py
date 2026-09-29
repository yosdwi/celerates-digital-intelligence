"""Indonesian + English relevance set for Agent knowledge retrieval (migration 005). Small and explicit: each query
names the passage a person would expect first. The English-only baseline is measured alongside to show the gain."""

from uuid import uuid4

import pytest

from cdi import knowledge, retrieval
from cdi.db import all_rows, connect
from cdi.foundation_api import Source
from cdi.identity import Principal
from cdi.migrate import migrate

DOCS = {
    "billing": "SOP Penagihan: invoice dikirim ke klien paling lambat tanggal 5 setiap bulan. Pembayaran diverifikasi oleh tim Finance sebelum ditutup.",
    "recruit": "SOP Rekrutmen: setiap requisition wajib memiliki TA PIC sebelum sourcing kandidat dimulai.",
    "onboarding": "Onboarding policy: new employees complete their onboarding documents within three working days.",
    "timesheet": "Timesheet policy: talent submits timesheets every Friday; the project manager approves them.",
    "delivery": "Delivery acceptance: name an acceptance owner before integration handover to the client.",
}
QUERIES = [
    ("kapan invoice harus dikirim?", "billing"),
    # Indonesian stems: pembayaran → bayar. (Snowball over-strips penagihan → agih, so "tagih" alone does not match;
    # that gap is left to semantic embeddings.)
    ("bagaimana cara bayar tagihan", "billing"),
    ("siapa yang memverifikasi?", "billing"),  # memverifikasi / diverifikasi → verifikasi
    ("kapan mulai?", "recruit"),  # dimulai → mulai
    ("penanggung jawab rekrutmen kandidat", "recruit"),
    ("requisitions without a TA PIC", "recruit"),  # English plural stem
    ("submitting timesheets", "timesheet"),
    ("onboard new employee", "onboarding"),  # prefix: onboard → onboarding
    ("acceptance handover", "delivery"),
]


@pytest.fixture(scope="module")
def corpus():
    migrate()
    marker = uuid4().hex[:8]
    curator = Principal("curator-retrieval", ["reviewer", "curator"], ["sales", "hr", "ta"], True)
    ids, docs = {}, []
    for key, text in DOCS.items():
        source = knowledge.register_source(
            Source(
                source_key=f"rel-{key}-{marker}",
                title=f"{key} {marker}",
                scope_type="company",
                scope_id="company",
                classification="internal",
                source_kind="policy",
            ),
            curator,
        )
        doc = knowledge.register_version(source["id"], 1, f"{key}.md", text.encode(), "text/markdown", curator)
        ids[source["id"]] = key
        docs.append(doc["id"])
    while knowledge.tick():
        pass
    for doc in docs:
        knowledge.transition(doc, "approve", curator)
    yield ids, curator
    for doc in docs:
        knowledge.transition(doc, "deprecate", curator)


def english_only(query, source_ids):
    """The M2 baseline: English stemmer over the English-only vector."""
    terms = " | ".join(retrieval.terms(query)) or "__none__"
    with connect() as conn:
        rows = all_rows(
            conn,
            """SELECT d.source_id, ts_rank_cd(c.search, to_tsquery('english', %s)) AS r FROM chunks c
               JOIN documents d ON d.id=c.document_id WHERE d.source_id=ANY(%s) AND d.lifecycle='active'
               AND c.search @@ to_tsquery('english', %s) ORDER BY r DESC LIMIT 1""",
            (terms, list(source_ids), terms),
        )
    return rows[0]["source_id"] if rows else None


def test_indonesian_english_relevance_set(corpus):
    ids, curator = corpus
    principal = Principal("reader", ["agent"], ["sales", "hr", "ta"], False)
    hits, baseline = 0, 0
    for query, expected in QUERIES:
        rows = [r for r in knowledge.search_for_principal(query, principal, limit=5) if r["source_id"] in ids]
        top = ids[rows[0]["source_id"]] if rows else None
        assert top == expected, f"{query!r}: got {top}, expected {expected}"
        hits += 1
        baseline += ids.get(english_only(query, ids)) == expected
    # Recorded in the implementation record: multilingual lexical retrieval answers every query in the set;
    # the English-only baseline misses the Indonesian morphology cases.
    print(f"relevance@1 multilingual={hits}/{len(QUERIES)} english_only={baseline}/{len(QUERIES)}")
    assert hits == len(QUERIES) and baseline <= len(QUERIES) - 3, (hits, baseline)
    unrelated = [r for r in knowledge.search_for_principal("gaji karyawan cuti", principal) if r["source_id"] in ids]
    assert unrelated == [], "no padding with unrelated passages"


def test_reembed_moves_chunks_to_the_current_embedding_model(corpus):
    from cdi.reembed import reembed

    ids, _ = corpus
    with connect() as conn:
        conn.execute(
            "UPDATE chunks SET embedding_model='old-model' WHERE document_id IN "
            "(SELECT id FROM documents WHERE source_id=ANY(%s))",
            (list(ids),),
        )
    principal = Principal("reader", ["agent"], ["sales"], False)
    assert not [r for r in knowledge.search_for_principal("invoice", principal) if r["source_id"] in ids]
    result = reembed()
    assert result["model"] == retrieval.DEMO_EMBEDDING and result["reembedded"] >= len(DOCS)
    assert [r for r in knowledge.search_for_principal("invoice", principal) if r["source_id"] in ids]
    assert reembed()["reembedded"] == 0, "idempotent"
