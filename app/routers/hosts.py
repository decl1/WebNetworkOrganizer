"""Hosts router: list, create, update, delete, refresh, logs and SSH console."""

import asyncio
import json
import threading

from fastapi import APIRouter, HTTPException, Query, status, WebSocket, WebSocketDisconnect

from ..db.hosts_repo import ContainerNotFoundError
from ..db.web_services_repo import HostNotFoundError
from ..schemas.hosts import (
    DockerOut,
    HostIn,
    HostOut,
    HostPatch,
    LogOut,
    WebServiceIn,
    WebServiceOut,
    WebServicePatch,
)
from ..services import hosts_service, ssh_service

router = APIRouter(tags=["hosts"])


@router.get("/api/containers/{container_id}/hosts", response_model=list[HostOut])
def get_hosts(container_id: int) -> list[HostOut]:
    return [HostOut(**row) for row in hosts_service.list_hosts(container_id)]


@router.post(
    "/api/containers/{container_id}/hosts",
    response_model=HostOut,
    status_code=status.HTTP_201_CREATED,
)
def post_host(container_id: int, body: HostIn) -> HostOut:
    try:
        row = hosts_service.create_host(
            container_id,
            body.name,
            body.address,
            body.os.value,
            body.auto_refresh,
            ssh_auth=body.ssh_auth.value,
            ssh_user=body.ssh_user,
            ssh_port=body.ssh_port,
            ssh_password=body.ssh_password,
            docker_enabled=int(body.docker_enabled) if body.docker_enabled else 0,
            docker_command=body.docker_command,
            sudo_password=body.sudo_password,
        )
    except ContainerNotFoundError:
        raise HTTPException(status_code=404, detail="Container not found") from None
    return HostOut(**row)


@router.patch("/api/hosts/{host_id}", response_model=HostOut)
def patch_host(host_id: int, body: HostPatch) -> HostOut:
    row = hosts_service.update_host(
        host_id,
        name=body.name,
        address=body.address,
        os=body.os.value if body.os else None,
        auto_refresh=body.auto_refresh,
        ssh_auth=body.ssh_auth.value if body.ssh_auth else None,
        ssh_user=body.ssh_user,
        ssh_port=body.ssh_port,
        ssh_password=body.ssh_password,
        docker_enabled=int(body.docker_enabled) if body.docker_enabled is not None else None,
        docker_command=body.docker_command,
        sudo_password=body.sudo_password,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return HostOut(**row)


@router.post("/api/hosts/{host_id}/refresh", response_model=HostOut)
def post_refresh(host_id: int) -> HostOut:
    row = hosts_service.refresh_host(host_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return HostOut(**row)


@router.get("/api/ssh/public-key")
def get_public_key() -> dict:
    """Return the organizer's public key for installing on hosts."""
    return {"public_key": ssh_service.get_public_key()}


@router.get("/api/hosts/{host_id}/docker", response_model=DockerOut)
def get_docker(host_id: int) -> DockerOut:
    result = hosts_service.get_host_docker(host_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return DockerOut(**result)


@router.get("/api/hosts/{host_id}/web-services", response_model=list[WebServiceOut])
def get_web_services(host_id: int) -> list[WebServiceOut]:
    if hosts_service.get_host(host_id) is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return [WebServiceOut(**row) for row in hosts_service.list_web_services(host_id)]


@router.post(
    "/api/hosts/{host_id}/web-services",
    response_model=WebServiceOut,
    status_code=status.HTTP_201_CREATED,
)
def post_web_service(host_id: int, body: WebServiceIn) -> WebServiceOut:
    try:
        row = hosts_service.create_web_service(host_id, body.name, body.port, body.health_url)
    except HostNotFoundError:
        raise HTTPException(status_code=404, detail="Host not found") from None
    return WebServiceOut(**row)


@router.patch("/api/hosts/{host_id}/web-services/{web_service_id}", response_model=WebServiceOut)
def patch_web_service(host_id: int, web_service_id: int, body: WebServicePatch) -> WebServiceOut:
    service = hosts_service.get_web_service(web_service_id)
    if service is None or service["host_id"] != host_id:
        raise HTTPException(status_code=404, detail="Web service not found")
    row = hosts_service.update_web_service(
        web_service_id,
        name=body.name,
        port=body.port,
        health_url=body.health_url,
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Web service not found")
    return WebServiceOut(**row)


@router.delete(
    "/api/hosts/{host_id}/web-services/{web_service_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_web_service(host_id: int, web_service_id: int) -> None:
    if not hosts_service.delete_web_service(host_id, web_service_id):
        raise HTTPException(status_code=404, detail="Web service not found")


@router.post("/api/hosts/{host_id}/web-services/check", response_model=list[WebServiceOut])
def post_check_web_services(host_id: int) -> list[WebServiceOut]:
    if hosts_service.get_host(host_id) is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return [WebServiceOut(**row) for row in hosts_service.check_host_web_services(host_id)]


@router.post("/api/hosts/{host_id}/ssh-check", response_model=HostOut)
def post_ssh_check(host_id: int) -> HostOut:
    row = hosts_service.check_host_ssh(host_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return HostOut(**row)


@router.websocket("/ws/hosts/{host_id}/ssh")
async def ssh_console_ws(websocket: WebSocket, host_id: int) -> None:
    """Relay an interactive shell between the browser and the host via SSH."""
    await websocket.accept()
    host = hosts_service.get_host(host_id)
    if host is None:
        await websocket.send_json({"type": "error", "message": "Host not found"})
        await websocket.close()
        return
    if not (host.get("ssh_user") or "").strip():
        await websocket.send_json({"type": "error", "message": "SSH is not configured for this host"})
        await websocket.close()
        return
    try:
        client, channel = ssh_service.open_shell(host)
    except Exception as exc:
        await websocket.send_json({"type": "error", "message": f"Connection failed: {exc}"})
        await websocket.close()
        return

    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue()

    def reader() -> None:
        try:
            while True:
                data = channel.recv(4096)
                if not data:
                    break
                loop.call_soon_threadsafe(queue.put_nowait, data)
        except Exception:
            pass
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    threading.Thread(target=reader, daemon=True).start()

    async def sender() -> None:
        try:
            while True:
                item = await queue.get()
                if item is None:
                    await websocket.send_json({"type": "closed", "message": "Connection closed"})
                    break
                await websocket.send_bytes(item)
        except Exception:
            pass

    async def receiver() -> None:
        try:
            while True:
                message = await websocket.receive()
                if message.get("type") != "websocket.receive":
                    continue
                payload = message.get("text")
                if payload is None:
                    data = message.get("bytes")
                    if data is None:
                        continue
                    channel.send(data)
                    continue
                try:
                    message_data = json.loads(payload)
                except Exception:
                    continue
                msg_type = message_data.get("type")
                if msg_type == "input":
                    channel.send(str(message_data.get("data", "")).encode("utf-8"))
                elif msg_type == "resize":
                    try:
                        channel.resize_pty(
                            width=int(message_data.get("cols", 100)),
                            height=int(message_data.get("rows", 30)),
                        )
                    except Exception:
                        pass
        except Exception:
            pass

    sender_task = asyncio.create_task(sender())
    receiver_task = asyncio.create_task(receiver())
    try:
        done, pending = await asyncio.wait(
            {sender_task, receiver_task},
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    except WebSocketDisconnect:
        pass
    finally:
        try:
            channel.close()
        except Exception:
            pass
        client.close()


@router.get("/api/hosts/{host_id}/logs", response_model=list[LogOut])
def get_logs(host_id: int, limit: int = Query(default=200, ge=1, le=1000)) -> list[LogOut]:
    if hosts_service.get_host(host_id) is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return [LogOut(**row) for row in hosts_service.list_logs(host_id, limit)]


@router.delete("/api/hosts/{host_id}/logs", status_code=status.HTTP_204_NO_CONTENT)
def delete_logs(host_id: int) -> None:
    if hosts_service.get_host(host_id) is None:
        raise HTTPException(status_code=404, detail="Host not found")
    hosts_service.clear_logs(host_id)


@router.delete("/api/hosts/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_host(host_id: int) -> None:
    if not hosts_service.delete_host(host_id):
        raise HTTPException(status_code=404, detail="Host not found")