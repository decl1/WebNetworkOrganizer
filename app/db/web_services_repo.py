"""Web services repository."""

from typing import Any

from .database import connect

_COLUMNS = ("id", "host_id", "name", "port", "health_url", "status", "checked_at", "error", "created_at")
_SELECT = (
    "SELECT id, host_id, name, port, health_url, status, checked_at, error, created_at "
    "FROM web_services"
)


class HostNotFoundError(Exception):
    """A host with the given id does not exist."""


class WebServiceNotFoundError(Exception):
    """A web service with the given id does not exist."""


def list_web_services(host_id: int) -> list[dict[str, Any]]:
    """Return all web services of a host."""
    with connect() as conn:
        rows = conn.execute(_SELECT + " WHERE host_id = ? ORDER BY id", (host_id,))
        return [dict(row) for row in rows]


def get_web_service(web_service_id: int) -> dict[str, Any] | None:
    """Return a web service by id, or None if it does not exist."""
    with connect() as conn:
        row = conn.execute(_SELECT + " WHERE id = ?", (web_service_id,)).fetchone()
    return dict(row) if row is not None else None


def create_web_service(host_id: int, name: str, port: int, health_url: str) -> dict[str, Any]:
    """Create a web service for a host and return it."""
    with connect() as conn:
        host = conn.execute("SELECT id FROM hosts WHERE id = ?", (host_id,)).fetchone()
        if host is None:
            raise HostNotFoundError
        cursor = conn.execute(
            "INSERT INTO web_services (host_id, name, port, health_url) VALUES (?, ?, ?, ?)",
            (host_id, name, port, health_url),
        )
        row = conn.execute(_SELECT + " WHERE id = ?", (cursor.lastrowid,)).fetchone()
    if row is None:
        raise RuntimeError("Failed to read back the created web service")
    return dict(row)


def update_web_service(
    web_service_id: int,
    name: str | None = None,
    port: int | None = None,
    health_url: str | None = None,
) -> dict[str, Any] | None:
    """Update a web service's fields and return it, or None if it does not exist."""
    with connect() as conn:
        row = conn.execute(_SELECT + " WHERE id = ?", (web_service_id,)).fetchone()
        if row is None:
            return None
        current = dict(row)
        if name is not None:
            current["name"] = name
        if port is not None:
            current["port"] = port
        if health_url is not None:
            current["health_url"] = health_url
        conn.execute(
            "UPDATE web_services SET name = ?, port = ?, health_url = ? WHERE id = ?",
            (current["name"], current["port"], current["health_url"], web_service_id),
        )
    return current


def set_web_service_result(web_service_id: int, status: str, error: str | None, checked_at: str | None) -> None:
    """Store the result of the latest health check for a web service."""
    with connect() as conn:
        conn.execute(
            "UPDATE web_services SET status = ?, error = ?, checked_at = ? WHERE id = ?",
            (status, error, checked_at, web_service_id),
        )


def delete_web_service(web_service_id: int) -> bool:
    """Delete a web service; return True if a row was deleted."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM web_services WHERE id = ?", (web_service_id,))
        return cursor.rowcount > 0