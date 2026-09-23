from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from .config import settings


@contextmanager
def connect():
    with psycopg.connect(settings().database_url, row_factory=dict_row, prepare_threshold=None) as conn:
        yield conn


@contextmanager
def checkpointer():
    from langgraph.checkpoint.postgres import PostgresSaver

    # Avoid session-scoped named statements for transaction-pool compatibility.
    with psycopg.connect(
        settings().database_url, row_factory=dict_row, autocommit=True, prepare_threshold=None
    ) as conn:
        yield PostgresSaver(conn)


def one(conn, sql, args=()):
    return conn.execute(sql, args).fetchone()


def all_rows(conn, sql, args=()):
    return conn.execute(sql, args).fetchall()


def json(value):
    return Jsonb(value)
