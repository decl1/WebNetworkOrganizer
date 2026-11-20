"""Status snapshot: a public JSON copy of all containers/hosts statuses.

The snapshot is written atomically after each refresh (and on startup),
and is the data source for the MCP server and other read-only consumers.
It intentionally excludes secrets (SSH passwords, keys).
"""

import json
import os
from datetime import datetime, timezone
from typing import Any

from ..config import DATA_DIR
from ..db import containers_repo

SNAPSHOT_FILE = DATA_DIR / "hosts_status.json"
SNAPSHOT_VERSION = 1


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def public_host(host: dict[str, Any]) -> dict[str, Any]:
    """Project a host row into its public (secret-free) representation."""
    return {
        "id": host["id"],
        "name": host.get("name", ""),
        "address": host.get("address", ""),
        "os": host.get("os", "linux"),
        "auto_refresh": host.get("auto_refresh", 0),
        "ping_status": host.get("ping_status", "unknown"),
        "ping_at": host.get("ping_at"),
        "ping_ms": host.get("ping_ms"),
        "ssh_status": host.get("ssh_status", "unknown"),
        "ssh_at": host.get("ssh_at"),
        "ssh_error": host.get("ssh_error"),
        "ssh_user": host.get("ssh_user", ""),
        "ssh_port": host.get("ssh_port", 22),
        "docker_enabled": bool(host.get("docker_enabled")),
        "web_services": [
            {
                "id": service["id"],
                "name": service.get("name", ""),
                "port": service.get("port"),
                "health_url": service.get("health_url", ""),
                "status": service.get("status", "unknown"),
                "checked_at": service.get("checked_at"),
                "error": service.get("error"),
            }
            for service in host.get("web_services", [])
        ],
    }


def build_snapshot() -> dict[str, Any]:
    """Build a snapshot from the current database state."""
    containers = containers_repo.list_containers()
    return {
        "version": SNAPSHOT_VERSION,
        "generated_at": _utc_now(),
        "containers": [
            {
                "id": container["id"],
                "name": container.get("name", ""),
                "hosts": [public_host(host) for host in container.get("hosts", [])],
            }
            for container in containers
        ],
    }


def write_status_snapshot() -> None:
    """Write the snapshot atomically (tmp file + rename) to SNAPSHOT_FILE."""
    snapshot = build_snapshot()
    tmp = SNAPSHOT_FILE.with_name(SNAPSHOT_FILE.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(snapshot, handle, ensure_ascii=False, indent=2)
    os.replace(tmp, SNAPSHOT_FILE)


def load_snapshot() -> dict[str, Any]:
    """Read the latest snapshot; never raises, falls back to an empty snapshot."""
    try:
        with open(SNAPSHOT_FILE, encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict) or not isinstance(data.get("containers"), list):
            raise ValueError("invalid snapshot format")
        return data
    except FileNotFoundError:
        return {"version": SNAPSHOT_VERSION, "generated_at": None, "containers": []}
    except (OSError, ValueError) as exc:
        return {
            "version": SNAPSHOT_VERSION,
            "generated_at": None,
            "containers": [],
            "snapshot_error": str(exc),
        }