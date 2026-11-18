"""Container logic."""

from typing import Any

from ..db import containers_repo


def list_containers() -> list[dict[str, Any]]:
    """Return all containers."""
    return containers_repo.list_containers()


def create_container(name: str) -> dict[str, Any]:
    """Create a container by name."""
    return containers_repo.create_container(name)


def rename_container(container_id: int, name: str) -> dict[str, Any] | None:
    """Rename a container by id; None if it does not exist."""
    return containers_repo.rename_container(container_id, name)


def delete_container(container_id: int) -> bool:
    """Delete a container by id; True if it existed."""
    return containers_repo.delete_container(container_id)