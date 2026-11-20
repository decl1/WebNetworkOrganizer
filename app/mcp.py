"""MCP server for WebNetworkOrganizer.

Mounted into the FastAPI app as an ASGI app at /mcp (streamable HTTP).
Tools read the status snapshot and can trigger live actions via the
service layer.
"""

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

from .services import hosts_service
from .services.snapshot import load_snapshot, public_host

mcp = FastMCP("WebNetworkOrganizer")


def _flatten_hosts(snapshot: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        host
        for container in snapshot.get("containers", [])
        for host in container.get("hosts", [])
    ]


@mcp.tool()
def get_hosts() -> dict[str, Any]:
    """Return the status snapshot of all containers and hosts (ping, SSH, docker flag, web services)."""
    return load_snapshot()


@mcp.tool()
def get_host(host_id: int) -> dict[str, Any] | None:
    """Return the current status of a single host by its id."""
    for host in _flatten_hosts(load_snapshot()):
        if host["id"] == host_id:
            return host
    return None


@mcp.tool()
def get_hosts_by_ping_status(status: str) -> list[dict[str, Any]]:
    """Return hosts whose ping status equals status: ok, fail or unknown."""
    return [host for host in _flatten_hosts(load_snapshot()) if host.get("ping_status") == status]


@mcp.tool()
def refresh_host(host_id: int) -> dict[str, Any] | None:
    """Run a live check of a host (ping, SSH, web services) and return its updated public status."""
    row = hosts_service.refresh_host(host_id)
    return public_host(row) if row is not None else None


@mcp.tool()
def docker_containers(host_id: int) -> dict[str, Any]:
    """Return Docker containers of a host fetched via SSH (host must have Docker enabled in settings)."""
    result = hosts_service.get_host_docker(host_id)
    if result is None:
        return {"enabled": False, "containers": [], "error": "Host not found"}
    return result


@mcp.resource("wno://snapshot")
def snapshot_resource() -> str:
    """The latest status snapshot as JSON."""
    return json.dumps(load_snapshot(), ensure_ascii=False, indent=2)


class _RewriteRoot:
    """Force the scope path to '/' before delegating to the MCP app.

    The MCP app is configured to serve at its root, so both the bare
    /mcp route and the /mcp/... mount reach the same handler.
    """

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] in ("http", "websocket"):
            scope["path"] = "/"
        await self.app(scope, receive, send)


def build_mcp_handlers() -> tuple[Any, Any]:
    """Create the /mcp ASGI handler and its session manager.

    The session manager must be entered from the host app's lifespan:
        async with session_manager.run(): yield
    """
    mcp.settings.streamable_http_path = "/"
    asgi = mcp.streamable_http_app()
    return _RewriteRoot(asgi), mcp._session_manager