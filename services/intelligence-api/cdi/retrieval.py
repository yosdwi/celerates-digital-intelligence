"""Shared lexical layer for Indonesian + English retrieval (migration 005, ADR-014 record).

Matching uses `chunks.search_multi @@ query`, where the query ORs the content terms under the Indonesian and English
stemmers plus a `simple` prefix match. Ranking fuses lexical rank and, only when a semantic embedding model is
configured, vector rank by reciprocal-rank fusion (RRF). The demo hash embedding never ranks or admits passages.
"""

import re

RRF_K = 60
DEMO_EMBEDDING = "demo-hash-64-v1"
# Function words in Indonesian and English. PostgreSQL's `indonesian` configuration has no stop-word list, so an OR
# query would otherwise match on grammar alone.
STOPWORDS = set(
    """yang dan atau untuk dengan dari pada ini itu belum sudah tidak ada oleh dalam sebelum setelah akan bukan saat
    juga bisa harus maupun apa siapa berapa bagaimana kapan dimana mana kenapa mengapa agar supaya karena jika kalau
    seperti antara hingga sampai para setiap kami kita saya anda mereka dia ia adalah ialah merupakan secara tersebut
    lebih masih telah sedang pun lah kah tentang kepada bagi tanpa semua saja hanya tolong mohon jelaskan cari
    the and for with from that this are was not what who how when where which why does into about your you our any
    all can will should must has have had been being their there then than also only just please""".split()
)


def terms(query, limit=16):
    """Content terms, lower-case ASCII alphanumerics of at least 3 characters, stop words removed, order kept."""
    words = re.findall(r"[a-z0-9]+", str(query).lower())
    return list(dict.fromkeys(w for w in words if len(w) >= 3 and w not in STOPWORDS))[:limit]


def tsquery_args(query):
    """(or_terms, prefix_terms) for `TSQUERY_SQL`. Unmatchable placeholders keep the SQL valid for empty queries."""
    found = terms(query)
    return " | ".join(found) or "__none__", " | ".join(f"{t}:*" for t in found if len(t) >= 4) or "__none__"


# Two positional parameters: or_terms, prefix_terms.
TSQUERY_SQL = "(to_tsquery('indonesian', %s) || to_tsquery('english', %s) || to_tsquery('simple', %s))"


def tsquery_params(query):
    or_terms, prefix = tsquery_args(query)
    return (or_terms, or_terms, prefix)
