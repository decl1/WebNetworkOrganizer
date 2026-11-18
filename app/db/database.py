"""SQLite connection management and schema initialization."""

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from ..config import DB_FILE

_SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS containers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hosts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    container_id INTEGER NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    address TEXT NOT NULL DEFAULT '',
    os TEXT NOT NULL DEFAULT 'linux',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_MIGRATIONS = [
    (
        "hosts",
        "address",
        "ALTER TABLE hosts ADD COLUMN address TEXT NOT NULL DEFAULT ''",
    ),
]


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    """Open a DB connection, commit changes and close it."""
    DB_FILE.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_FILE, timeout=5)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    """Create tables if they do not exist yet and apply pending migrations."""
    with connect() as conn:
        conn.executescript(_SCHEMA)
        for table, column, alter in _MIGRATIONS:
            existing = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
            if column not in existing:
                conn.execute(alter)