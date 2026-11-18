"""Host schemas."""

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class OS(str, Enum):
    LINUX = "linux"


class HostIn(BaseModel):
    name: str = Field(max_length=100)
    address: str = Field(max_length=255)
    os: OS = OS.LINUX

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Host name cannot be empty")
        return name

    @field_validator("address")
    @classmethod
    def _normalize_address(cls, value: str) -> str:
        address = value.strip()
        if not address:
            raise ValueError("Host address cannot be empty")
        return address


class HostPatch(BaseModel):
    """Partial host update: only the provided fields are changed."""

    name: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    os: OS | None = None

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = value.strip()
        if not name:
            raise ValueError("Host name cannot be empty")
        return name

    @field_validator("address")
    @classmethod
    def _normalize_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        address = value.strip()
        if not address:
            raise ValueError("Host address cannot be empty")
        return address


class HostOut(BaseModel):
    id: int
    container_id: int
    name: str
    address: str
    os: OS
    created_at: str