"""Containers repository."""

from typing import Any

from .database import connect

_COLUMNS = ("id", "name", "created_at")
_SELECT = "SELECT id, name, created_at FROM containers"


def list_containers() -> list[dict[str, Any]]:
    """Return all containers with their hosts and web services, top to bottom."""
    with connect() as conn:
        containers = [dict(row) for row in conn.execute(_SELECT + " ORDER BY id")]
        hosts = [
            dict(row)
            for row in conn.execute(
                "SELECT id, container_id, name, address, os, auto_refresh, ping_status, ping_at, ping_ms, "
                "ssh_auth, ssh_user, ssh_port, ssh_password, ssh_status, ssh_at, ssh_error, "
                "docker_enabled, docker_command, created_at "
                "FROM hosts ORDER BY id"
            )
        ]
        web_services = [dict(row) for row in conn.execute(
            "SELECT id, host_id, name, port, health_url, status, checked_at, error, created_at "
            "FROM web_services ORDER BY id"
        )]
    by_container: dict[int, list[dict[str, Any]]] = {}
    by_host: dict[int, list[dict[str, Any]]] = {}
    for host in hosts:
        by_container.setdefault(int(host["container_id"]), []).append(host)
        by_host.setdefault(int(host["id"]), [])
    for service in web_services:
        by_host.setdefault(int(service["host_id"]), []).append(service)
    for host in hosts:
        host["web_services"] = by_host.get(int(host["id"]), [])
    for container in containers:
        container["hosts"] = by_container.get(int(container["id"]), [])
    return containers


def create_container(name: str) -> dict[str, Any]:
    """Create a container and return it."""
    with connect() as conn:
        cursor = conn.execute("INSERT INTO containers (name) VALUES (?)", (name,))
        row = conn.execute(_SELECT + " WHERE id = ?", (cursor.lastrowid,)).fetchone()
    if row is None:
        raise RuntimeError("Failed to read back the created container")
    return dict(row)


def rename_container(container_id: int, name: str) -> dict[str, Any] | None:
    """Rename a container and return it, or None if it does not exist."""
    with connect() as conn:
        cursor = conn.execute("UPDATE containers SET name = ? WHERE id = ?", (name, container_id))
        if cursor.rowcount == 0:
            return None
        row = conn.execute(_SELECT + " WHERE id = ?", (container_id,)).fetchone()
    return dict(row) if row is not None else None


def delete_container(container_id: int) -> bool:
    """Delete a container; return True if a row was deleted."""
    with connect() as conn:
        cursor = conn.execute("DELETE FROM containers WHERE id = ?", (container_id,))
        return cursor.rowcount > 0