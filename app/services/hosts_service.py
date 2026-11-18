"""Host logic."""

from typing import Any

from ..db import hosts_repo


def list_hosts(container_id: int) -> list[dict[str, Any]]:
    """Return all hosts of a container."""
    return hosts_repo.list_hosts(container_id)


def create_host(container_id: int, name: str, address: str, os: str) -> dict[str, Any]:
    """Create a host in a container."""
    return hosts_repo.create_host(container_id, name, address, os)


def update_host(
    host_id: int,
    name: str | None = None,
    address: str | None = None,
    os: str | None = None,
) -> dict[str, Any] | None:
    """Update a host by id; None if it does not exist."""
    return hosts_repo.update_host(host_id, name=name, address=address, os=os)


def delete_host(host_id: int) -> bool:
    """Delete a host by id; True if it existed."""
    return hosts_repo.delete_host(host_id)