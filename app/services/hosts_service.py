"""Host logic."""

from datetime import datetime, timezone
from typing import Any

from ..db import hosts_repo, logs_repo, web_services_repo
from . import docker_service
from .netcheck import ping_host
from .ssh_service import check_ssh, run_command
from .webcheck import check_health


def _utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _with_web_services(host: dict[str, Any]) -> dict[str, Any]:
    host = dict(host)
    host["web_services"] = web_services_repo.list_web_services(host["id"])
    return host


def list_hosts(container_id: int) -> list[dict[str, Any]]:
    """Return all hosts of a container, with their web services."""
    return [_with_web_services(host) for host in hosts_repo.list_hosts(container_id)]


def get_host(host_id: int) -> dict[str, Any] | None:
    """Return a host by id, with its web services, or None if it does not exist."""
    host = hosts_repo.get_host(host_id)
    return _with_web_services(host) if host is not None else None


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
    docker_enabled: int | None = None,
    docker_command: str | None = None,
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
        docker_enabled=docker_enabled,
        docker_command=docker_command,
    )
    if row is None:
        return None
    changed = [
        field
        for field in (
            "name",
            "address",
            "os",
            "auto_refresh",
            "ssh_auth",
            "ssh_user",
            "ssh_port",
            "docker_enabled",
            "docker_command",
        )
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
    """Ping a host, check SSH, check web services and log the results; None if the host does not exist."""
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
    check_host_ssh(host_id)
    check_host_web_services(host_id)
    return get_host(host_id)


def list_web_services(host_id: int) -> list[dict[str, Any]]:
    """Return all web services of a host."""
    return web_services_repo.list_web_services(host_id)


def get_web_service(web_service_id: int) -> dict[str, Any] | None:
    """Return a web service by id, or None if it does not exist."""
    return web_services_repo.get_web_service(web_service_id)


def create_web_service(host_id: int, name: str, port: int, health_url: str) -> dict[str, Any]:
    """Create a web service for a host and log the event."""
    row = web_services_repo.create_web_service(host_id, name, port, health_url)
    logs_repo.add_log(host_id, "info", f"Web service added: {name} (:{port})")
    return row


def update_web_service(
    web_service_id: int,
    name: str | None = None,
    port: int | None = None,
    health_url: str | None = None,
) -> dict[str, Any] | None:
    """Update a web service by id and log the event; None if it does not exist."""
    previous = web_services_repo.get_web_service(web_service_id)
    if previous is None:
        return None
    row = web_services_repo.update_web_service(web_service_id, name=name, port=port, health_url=health_url)
    if row is None:
        return None
    changed = [
        field
        for field in ("name", "port", "health_url")
        if previous.get(field) != row.get(field)
    ]
    if changed:
        logs_repo.add_log(row["host_id"], "info", f"Web service updated: {', '.join(changed)}")
    return row


def delete_web_service(host_id: int, web_service_id: int) -> bool:
    """Delete a web service by id; True if it existed."""
    service = web_services_repo.get_web_service(web_service_id)
    if service is None:
        return False
    ok = web_services_repo.delete_web_service(web_service_id)
    if ok:
        logs_repo.add_log(host_id, "info", f"Web service removed: {service['name']}")
    return ok


def get_host_docker(host_id: int) -> dict[str, Any] | None:
    """Run the configured docker command over SSH and return parsed containers; None if the host does not exist."""
    host = hosts_repo.get_host(host_id)
    if host is None:
        return None
    if not host.get("docker_enabled"):
        return {"enabled": False, "containers": [], "error": None}
    if not (host.get("ssh_user") or "").strip():
        return {
            "enabled": True,
            "containers": [],
            "error": "SSH is not configured for this host",
        }
    command = (host.get("docker_command") or "sudo docker ps").strip()
    hostname = host.get("address")
    try:
        exit_code, out, err = run_command(host, command)
    except Exception as exc:
        logs_repo.add_log(host_id, "error", f"Docker check failed: {exc}")
        return {"enabled": True, "containers": [], "error": str(exc)}
    if exit_code != 0:
        message = (err or out or f"Command exited with code {exit_code}").strip()
        logs_repo.add_log(host_id, "error", f"Docker check failed ({hostname}): {message}")
        return {"enabled": True, "containers": [], "error": message}
    containers = docker_service.parse_docker_ps(out)
    logs_repo.add_log(host_id, "ok", f"Docker OK ({hostname}): {len(containers)} container(s)")
    return {"enabled": True, "containers": containers, "error": None}


def check_host_web_services(host_id: int) -> list[dict[str, Any]]:
    """Check health of all web services of a host, store results and log them."""
    host = hosts_repo.get_host(host_id)
    if host is None:
        return []
    address = (host.get("address") or "").strip()
    services = web_services_repo.list_web_services(host_id)
    for service in services:
        result = check_health(address, service["health_url"], service["port"])
        status = "ok" if result["ok"] else "fail"
        web_services_repo.set_web_service_result(service["id"], status, result["error"], _utc_now())
        label = f"{service['name']} (:{service['port']})"
        if result["ok"]:
            code = result["status"] if result["status"] is not None else ""
            logs_repo.add_log(host_id, "ok", f"Web service OK [{code}]: {label}")
        else:
            logs_repo.add_log(host_id, "error", f"Web service failed: {label} — {result['error']}")
    return get_host(host_id)["web_services"]


def list_logs(host_id: int, limit: int = 200) -> list[dict[str, Any]]:
    """Return the most recent logs of a host, oldest first."""
    return logs_repo.list_logs(host_id, limit)


def clear_logs(host_id: int) -> int:
    """Delete all logs of a host; return the number of deleted rows."""
    return logs_repo.clear_logs(host_id)