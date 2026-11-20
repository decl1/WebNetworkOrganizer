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
    auto_refresh INTEGER NOT NULL DEFAULT 0,
    ping_status TEXT NOT NULL DEFAULT 'unknown',
    ping_at TEXT,
    ping_ms REAL,
    ssh_auth TEXT NOT NULL DEFAULT 'key',
    ssh_user TEXT NOT NULL DEFAULT '',
    ssh_port INTEGER NOT NULL DEFAULT 22,
    ssh_password TEXT NOT NULL DEFAULT '',
    ssh_status TEXT NOT NULL DEFAULT 'unknown',
    ssh_at TEXT,
    ssh_error TEXT,
    docker_enabled INTEGER NOT NULL DEFAULT 0,
    docker_command TEXT NOT NULL DEFAULT 'sudo docker ps',
    sudo_password TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sysinfo_params (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    command TEXT NOT NULL,
    parse TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS host_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    ts TEXT NOT NULL DEFAULT (datetime('now')),
    level TEXT NOT NULL DEFAULT 'info',
    message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS web_services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host_id INTEGER NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    port INTEGER NOT NULL,
    health_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'unknown',
    checked_at TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
"""

_MIGRATIONS = [
    (
        "hosts",
        "address",
        "ALTER TABLE hosts ADD COLUMN address TEXT NOT NULL DEFAULT ''",
    ),
    (
        "hosts",
        "auto_refresh",
        "ALTER TABLE hosts ADD COLUMN auto_refresh INTEGER NOT NULL DEFAULT 0",
    ),
    (
        "hosts",
        "ping_status",
        "ALTER TABLE hosts ADD COLUMN ping_status TEXT NOT NULL DEFAULT 'unknown'",
    ),
    (
        "hosts",
        "ping_at",
        "ALTER TABLE hosts ADD COLUMN ping_at TEXT",
    ),
    (
        "hosts",
        "ping_ms",
        "ALTER TABLE hosts ADD COLUMN ping_ms REAL",
    ),
    (
        "hosts",
        "ssh_auth",
        "ALTER TABLE hosts ADD COLUMN ssh_auth TEXT NOT NULL DEFAULT 'key'",
    ),
    (
        "hosts",
        "ssh_user",
        "ALTER TABLE hosts ADD COLUMN ssh_user TEXT NOT NULL DEFAULT ''",
    ),
    (
        "hosts",
        "ssh_port",
        "ALTER TABLE hosts ADD COLUMN ssh_port INTEGER NOT NULL DEFAULT 22",
    ),
    (
        "hosts",
        "ssh_password",
        "ALTER TABLE hosts ADD COLUMN ssh_password TEXT NOT NULL DEFAULT ''",
    ),
    (
        "hosts",
        "ssh_status",
        "ALTER TABLE hosts ADD COLUMN ssh_status TEXT NOT NULL DEFAULT 'unknown'",
    ),
    (
        "hosts",
        "ssh_at",
        "ALTER TABLE hosts ADD COLUMN ssh_at TEXT",
    ),
    (
        "hosts",
        "ssh_error",
        "ALTER TABLE hosts ADD COLUMN ssh_error TEXT",
    ),
    (
        "hosts",
        "docker_enabled",
        "ALTER TABLE hosts ADD COLUMN docker_enabled INTEGER NOT NULL DEFAULT 0",
    ),
    (
        "hosts",
        "docker_command",
        "ALTER TABLE hosts ADD COLUMN docker_command TEXT NOT NULL DEFAULT 'sudo docker ps'",
    ),
    (
        "hosts",
        "sudo_password",
        "ALTER TABLE hosts ADD COLUMN sudo_password TEXT NOT NULL DEFAULT ''",
    ),
    (
        "sysinfo_params",
        "parse",
        "ALTER TABLE sysinfo_params ADD COLUMN parse TEXT NOT NULL DEFAULT ''",
    ),
]


def _migrate_legacy_docker_sudo_password(conn: sqlite3.Connection) -> None:
    """Move the legacy per-host sudo password into the hosts.sudo_password column, then drop the old one."""
    columns = {row["name"] for row in conn.execute("PRAGMA table_info(hosts)")}
    if "docker_sudo_password" not in columns:
        return
    try:
        conn.execute(
            "UPDATE hosts SET sudo_password = docker_sudo_password WHERE docker_sudo_password != ''"
        )
    except sqlite3.OperationalError:
        pass
    try:
        conn.execute("ALTER TABLE hosts DROP COLUMN docker_sudo_password")
    except sqlite3.OperationalError:
        pass


def _migrate_legacy_settings_sudo_password(conn: sqlite3.Connection) -> None:
    """Move the previous global-settings sudo password into every host, then drop the setting."""
    row = conn.execute("SELECT value FROM settings WHERE key = 'sudo_password'").fetchone()
    if row is not None and (row["value"] or "").strip():
        conn.execute(
            "UPDATE hosts SET sudo_password = ? WHERE sudo_password = ''",
            (str(row["value"]),),
        )
    conn.execute("DELETE FROM settings WHERE key = 'sudo_password'")


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
        _migrate_legacy_docker_sudo_password(conn)
        _migrate_legacy_settings_sudo_password(conn)