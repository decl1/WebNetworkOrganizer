"""Hosts repository."""

from typing import Any

from .database import connect

_COLUMNS = ("id", "container_id", "name", "address", "os", "created_at")
_SELECT = "SELECT id, container_id, name, address, os, created_at FROM hosts"


class ContainerNotFoundError(Exception):
    """A container with the given id does not exist."""


def list_hosts(container_id: int) -> list[dict[str, Any]]:
    """Return all hosts of a container."""
    with connect() as conn:
        rows = conn.execute(_SELECT + " WHERE container_id = ? ORDER BY id", (container_id,))
        return [dict(row) for row in rows]


def get_host(host_id: int) -> dict[str, Any] | None:
    """Return a host by id, or None if it does not exist."""
    with connect() as conn:
        row = conn.execute(_SELECT + " WHERE id = ?", (host_id,)).fetchone()
    return dict(row) if row is not None else None


def create_host(container_id: int, name: str, address: str, os: str) -> dict[str, Any]:
    """Create a host in a container and return it."""
    with connect() as conn:
        container = conn.execute("SELECT id FROM containers WHERE id = ?", (container_id,)).fetchone()
        if container is None:
            raise ContainerNotFoundError
        cursor = conn.execute(
            "INSERT INTO hosts (container_id, name, address, os) VALUES (?, ?, ?, ?)",
            (container_id, name, address, os),
        )
        row = conn.execute(_SELECT + " WHERE id = ?", (cursor.lastrowid,)).fetchone()
    if row is None:
        raise RuntimeError("Failed to read back the created host")
    return dict(row)


def update_host(
    host_id: int,
    name: str | None = None,
    address: str | None = None,
    os: str | None = None,
) -> dict[str, Any] | None:
    """Update a host's fields and return it, or None if it does not exist."""
    with connect() as conn:
        row = conn.execute(_SELECT + " WHERE id = ?", (host_id,)).fetchone()
        if row is None:
            return None
        current = dict(row)
        if name is not None:
            current["name"] = name
        if address is not None:
            current["address"] = address
        if os is not None:
            current["os"] = os
        conn.execute(
            "UPDATE hosts SET name = ?, address = ?, os = ? WHERE id = ?",
            (current["name"], current["address"], current["os"], host_id),
        )
    return current


def delete_host(host_id: int) -> bool:
    """Delete a host; return True if a row was deleted."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM hosts WHERE id = ?", (host_id,))
        return cursor.rowcount > 0