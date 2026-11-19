"""Host logic."""

from datetime import datetime, timezone
from typing import Any

from ..db import hosts_repo, logs_repo
from .netcheck import ping_host
from .ssh_service import check_ssh


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def list_hosts(container_id: int) -> list[dict[str, Any]]:
    """Return all hosts of a container."""
    return hosts_repo.list_hosts(container_id)


def get_host(host_id: int) -> dict[str, Any] | None:
    """Return a host by id, or None if it does not exist."""
    return hosts_repo.get_host(host_id)


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
    """Create a host in a container and log the event."""
    row = hosts_repo.create_host(
        container_id,
        name,
        address,
        os,
        auto_refresh,
        ssh_auth=ssh_auth,
        ssh_user=ssh_user,
        ssh_port=ssh_port,
        ssh_password=ssh_password,
    )
    logs_repo.add_log(row["id"], "info", "Host created")
    return row


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
    """Update a host by id and log the event; None if it does not exist."""
    previous = hosts_repo.get_host(host_id)
    if previous is None:
        return None
    row = hosts_repo.update_host(
        host_id,
        name=name,
        address=address,
        os=os,
        auto_refresh=auto_refresh,
        ssh_auth=ssh_auth,
        ssh_user=ssh_user,
        ssh_port=ssh_port,
        ssh_password=ssh_password,
    )
    if row is None:
        return None
    changed = [
        field
        for field in ("name", "address", "os", "auto_refresh", "ssh_auth", "ssh_user", "ssh_port")
        if previous.get(field) != row.get(field)
    ]
    if (previous.get("ssh_password") or "") != (row.get("ssh_password") or ""):
        changed.append("ssh_password")
    if changed:
        logs_repo.add_log(host_id, "info", f"Host updated: {', '.join(changed)}")
    return row


def delete_host(host_id: int) -> bool:
    """Delete a host by id; True if it existed."""
    return hosts_repo.delete_host(host_id)


def check_host_ssh(host_id: int) -> dict[str, Any] | None:
    """Check SSH connectivity of a host, store the result and log it; None if the host does not exist."""
    host = hosts_repo.get_host(host_id)
    if host is None:
        return None
    if not (host.get("ssh_user") or "").strip():
        hosts_repo.set_ssh_result(host_id, "unknown", None, None)
        return hosts_repo.get_host(host_id)

    result = check_ssh(host)
    status = "ok" if result["ok"] else "fail"
    hosts_repo.set_ssh_result(host_id, status, result["error"], _utc_now())
    user = host.get("ssh_user")
    port = host.get("ssh_port")
    if result["ok"]:
        logs_repo.add_log(host_id, "ok", f"SSH OK: {user}@{host.get('address')}:{port}")
    else:
        logs_repo.add_log(host_id, "error", f"SSH failed: {result['error']}")
    return hosts_repo.get_host(host_id)


def refresh_host(host_id: int) -> dict[str, Any] | None:
    """Ping a host, check SSH and log the results; None if it does not exist."""
    host = hosts_repo.get_host(host_id)
    if host is None:
        return None
    address = (host.get("address") or "").strip()
    if not address:
        hosts_repo.set_ping_result(host_id, "unknown", None, None)
        logs_repo.add_log(host_id, "warn", "Ping skipped: address is not set")
    else:
        result = ping_host(address)
        hosts_repo.set_ping_result(host_id, "ok" if result["ok"] else "fail", result["ms"], _utc_now())
        if result["ok"]:
            ms = f"{result['ms']:.2f}" if result["ms"] is not None else "<1"
            logs_repo.add_log(host_id, "ok", f"Ping OK: {ms} ms")
        else:
            logs_repo.add_log(host_id, "error", f"Ping failed: {result['error']}")
    return check_host_ssh(host_id)


def list_logs(host_id: int, limit: int = 200) -> list[dict[str, Any]]:
    """Return the most recent logs of a host, oldest first."""
    return logs_repo.list_logs(host_id, limit)


def clear_logs(host_id: int) -> int:
    """Delete all logs of a host; return the number of deleted rows."""
    return logs_repo.clear_logs(host_id)