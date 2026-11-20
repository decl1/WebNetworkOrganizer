"""Sysinfo parameters repository: per-host custom console parameters."""

from typing import Any

from .database import connect

_SELECT = "SELECT id, host_id, name, command, parse, position, created_at FROM sysinfo_params"

DEFAULT_PARAMS: tuple[tuple[str, str], ...] = (
    ("CPU", "top -bn1 | grep 'Cpu(s)' | head -1"),
    ("Memory", "free -h | sed -n 2p"),
    ("Disk (/)", "df -h / | tail -1"),
    ("Temperature", "sensors 2>/dev/null | grep -Ei 'package|core|temp' | head -5"),
)


def list_params(host_id: int) -> list[dict[str, Any]]:
    """Return all sysinfo parameters of a host, in display order."""
    with connect() as conn:
        rows = conn.execute(_SELECT + " WHERE host_id = ? ORDER BY position, id", (host_id,))
        return [dict(row) for row in rows]


def count_params(host_id: int) -> int:
    """Return the number of sysinfo parameters of a host."""
    with connect() as conn:
        row = conn.execute("SELECT COUNT(*) AS n FROM sysinfo_params WHERE host_id = ?", (host_id,)).fetchone()
        return int(row["n"])


def seed_defaults(host_id: int) -> None:
    """Insert the default parameter set for a host that has none yet."""
    if count_params(host_id) > 0:
        return
    with connect() as conn:
        conn.executemany(
            "INSERT INTO sysinfo_params (host_id, name, command, position) VALUES (?, ?, ?, ?)",
            [(host_id, name, command, position) for position, (name, command) in enumerate(DEFAULT_PARAMS)],
        )


def replace_params(host_id: int, params: list[dict[str, str]]) -> list[dict[str, Any]]:
    """Replace all parameters of a host with the given (name, command, parse) triples and return them."""
    with connect() as conn:
        conn.execute("DELETE FROM sysinfo_params WHERE host_id = ?", (host_id,))
        conn.executemany(
            "INSERT INTO sysinfo_params (host_id, name, command, parse, position) VALUES (?, ?, ?, ?, ?)",
            [
                (
                    host_id,
                    str(param["name"]),
                    str(param["command"]),
                    str(param.get("parse") or ""),
                    position,
                )
                for position, param in enumerate(params)
            ],
        )
        rows = conn.execute(_SELECT + " WHERE host_id = ? ORDER BY position, id", (host_id,)).fetchall()
        return [dict(row) for row in rows]