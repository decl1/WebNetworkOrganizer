"""Hosts repository."""

from typing import Any

from .database import connect

_COLUMNS = (
    "id",
    "container_id",
    "name",
    "address",
    "os",
    "auto_refresh",
    "ping_status",
    "ping_at",
    "ping_ms",
    "ssh_auth",
    "ssh_user",
    "ssh_port",
    "ssh_password",
    "ssh_status",
    "ssh_at",
    "ssh_error",
    "created_at",
)
_SELECT = (
    "SELECT id, container_id, name, address, os, auto_refresh, ping_status, ping_at, ping_ms, "
    "ssh_auth, ssh_user, ssh_port, ssh_password, ssh_status, ssh_at, ssh_error, created_at "
    "FROM hosts"
)


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


def create_host(
    container_id: int,
    name: str,
    address: str,
    os: str,
    auto_refresh: int = 0,
    ssh_auth: str = "key",
    ssh_user: str = "",
    ssh_port: int = 22,
    ssh_password: str = "",
) -> dict[str, Any]:
    """Create a host in a container and return it."""
    with connect() as conn:
        container = conn.execute("SELECT id FROM containers WHERE id = ?", (container_id,)).fetchone()
        if container is None:
            raise ContainerNotFoundError
        cursor = conn.execute(
            "INSERT INTO hosts (container_id, name, address, os, auto_refresh, ssh_auth, ssh_user, ssh_port, ssh_password) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (container_id, name, address, os, auto_refresh, ssh_auth, ssh_user, ssh_port, ssh_password),
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
    auto_refresh: int | None = None,
    ssh_auth: str | None = None,
    ssh_user: str | None = None,
    ssh_port: int | None = None,
    ssh_password: str | None = None,
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
        if auto_refresh is not None:
            current["auto_refresh"] = auto_refresh
        if ssh_auth is not None:
            current["ssh_auth"] = ssh_auth
        if ssh_user is not None:
            current["ssh_user"] = ssh_user
        if ssh_port is not None:
            current["ssh_port"] = ssh_port
        if ssh_password is not None:
            current["ssh_password"] = ssh_password
        conn.execute(
            "UPDATE hosts SET name = ?, address = ?, os = ?, auto_refresh = ?, ssh_auth = ?, ssh_user = ?, "
            "ssh_port = ?, ssh_password = ? WHERE id = ?",
            (
                current["name"],
                current["address"],
                current["os"],
                current["auto_refresh"],
                current["ssh_auth"],
                current["ssh_user"],
                current["ssh_port"],
                current["ssh_password"],
                host_id,
            ),
        )
    return current


def set_ssh_result(host_id: int, status: str, error: str | None, ssh_at: str | None) -> None:
    """Store the result of the latest SSH connectivity check for a host."""
    with connect() as conn:
        conn.execute(
            "UPDATE hosts SET ssh_status = ?, ssh_error = ?, ssh_at = ? WHERE id = ?",
            (status, error, ssh_at, host_id),
        )


def set_ping_result(host_id: int, status: str, ms: float | None, ping_at: str | None) -> None:
    """Store the result of the latest ping check for a host."""
    with connect() as conn:
        conn.execute(
            "UPDATE hosts SET ping_status = ?, ping_ms = ?, ping_at = ? WHERE id = ?",
            (status, ms, ping_at, host_id),
        )


def delete_host(host_id: int) -> bool:
    """Delete a host; return True if a row was deleted."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM hosts WHERE id = ?", (host_id,))
        return cursor.rowcount > 0