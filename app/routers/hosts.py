"""Hosts router: list, create, update and delete hosts."""

from fastapi import APIRouter, HTTPException, status

from ..db.hosts_repo import ContainerNotFoundError
from ..schemas.hosts import HostIn, HostOut, HostPatch
from ..services import hosts_service

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
        row = hosts_service.create_host(container_id, body.name, body.address, body.os.value)
    except ContainerNotFoundError:
        raise HTTPException(status_code=404, detail="Container not found") from None
    return HostOut(**row)


@router.patch("/api/hosts/{host_id}", response_model=HostOut)
def patch_host(host_id: int, body: HostPatch) -> HostOut:
    row = hosts_service.update_host(host_id, name=body.name, address=body.address, os=body.os.value if body.os else None)
    if row is None:
        raise HTTPException(status_code=404, detail="Host not found")
    return HostOut(**row)


@router.delete("/api/hosts/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_host(host_id: int) -> None:
    if not hosts_service.delete_host(host_id):
        raise HTTPException(status_code=404, detail="Host not found")