"""Containers router: list, create, rename and delete containers."""

from fastapi import APIRouter, HTTPException, status

from ..schemas.containers import ContainerIn, ContainerOut
from ..services import containers_service

router = APIRouter(prefix="/api/containers", tags=["containers"])


@router.get("", response_model=list[ContainerOut])
def get_containers() -> list[ContainerOut]:
    return [ContainerOut(**row) for row in containers_service.list_containers()]


@router.post("", response_model=ContainerOut, status_code=status.HTTP_201_CREATED)
def post_container(body: ContainerIn) -> ContainerOut:
    return ContainerOut(**containers_service.create_container(body.name))


@router.patch("/{container_id}", response_model=ContainerOut)
def patch_container(container_id: int, body: ContainerIn) -> ContainerOut:
    row = containers_service.rename_container(container_id, body.name)
    if row is None:
        raise HTTPException(status_code=404, detail="Container not found")
    return ContainerOut(**row)


@router.delete("/{container_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_container(container_id: int) -> None:
    if not containers_service.delete_container(container_id):
        raise HTTPException(status_code=404, detail="Container not found")