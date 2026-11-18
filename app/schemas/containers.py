"""Container schemas."""

from pydantic import BaseModel, Field, field_validator

from .hosts import HostOut


class ContainerIn(BaseModel):
    name: str = Field(max_length=100)

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Container name cannot be empty")
        return name


class ContainerOut(BaseModel):
    id: int
    name: str
    created_at: str
    hosts: list[HostOut] = []