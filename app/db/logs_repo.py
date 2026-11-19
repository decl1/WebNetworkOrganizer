"""Host logs repository."""

from typing import Any

from .database import connect

_COLUMNS = ("id", "host_id", "ts", "level", "message")
_SELECT = "SELECT id, host_id, ts, level, message FROM host_logs"


def add_log(host_id: int, level: str, message: str) -> None:
    """Append a log entry for a host."""
    with connect() as conn:
        conn.execute(
            "INSERT INTO host_logs (host_id, level, message) VALUES (?, ?, ?)",
            (host_id, level, message),
        )


def list_logs(host_id: int, limit: int = 200) -> list[dict[str, Any]]:
    """Return the most recent log entries of a host, oldest first."""
    with connect() as conn:
        rows = conn.execute(
            _SELECT + " WHERE host_id = ? ORDER BY id DESC LIMIT ?",
            (host_id, limit),
        ).fetchall()
    return [dict(row) for row in reversed(rows)]


def clear_logs(host_id: int) -> int:
    """Delete all logs of a host; return the number of deleted rows."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM host_logs WHERE host_id = ?", (host_id,))
        return cursor.rowcount