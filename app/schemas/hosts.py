"""Host schemas."""

from enum import Enum

from pydantic import BaseModel, Field, field_validator


class OS(str, Enum):
    LINUX = "linux"


class SSHAuth(str, Enum):
    KEY = "key"
    PASSWORD = "password"


class HostIn(BaseModel):
    name: str = Field(max_length=100)
    address: str = Field(max_length=255)
    os: OS = OS.LINUX
    auto_refresh: int = Field(default=0, ge=0, le=86400)
    ssh_auth: SSHAuth = SSHAuth.KEY
    ssh_user: str = Field(default="", max_length=100)
    ssh_port: int = Field(default=22, ge=1, le=65535)
    ssh_password: str = Field(default="", max_length=500)
    docker_enabled: bool = False
    docker_command: str = Field(default="sudo docker ps", max_length=500)

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

    @field_validator("ssh_user")
    @classmethod
    def _normalize_ssh_user(cls, value: str) -> str:
        return value.strip()

    @field_validator("ssh_password")
    @classmethod
    def _normalize_ssh_password(cls, value: str) -> str:
        return value.strip()

    @field_validator("docker_command")
    @classmethod
    def _normalize_docker_command(cls, value: str) -> str:
        return value.strip()


class HostPatch(BaseModel):
    """Partial host update: only the provided fields are changed."""

    name: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=255)
    os: OS | None = None
    auto_refresh: int | None = Field(default=None, ge=0, le=86400)
    ssh_auth: SSHAuth | None = None
    ssh_user: str | None = Field(default=None, max_length=100)
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    ssh_password: str | None = Field(default=None, max_length=500)
    docker_enabled: bool | None = None
    docker_command: str | None = Field(default=None, max_length=500)

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

    @field_validator("ssh_user")
    @classmethod
    def _normalize_ssh_user(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("ssh_password")
    @classmethod
    def _normalize_ssh_password(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("docker_command")
    @classmethod
    def _normalize_docker_command(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

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


class WebServiceIn(BaseModel):
    name: str = Field(max_length=100)
    port: int = Field(ge=1, le=65535)
    health_url: str = Field(default="", max_length=500)

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Web service name cannot be empty")
        return name

    @field_validator("health_url")
    @classmethod
    def _normalize_health_url(cls, value: str) -> str:
        return value.strip()


class WebServicePatch(BaseModel):
    """Partial web service update: only the provided fields are changed."""

    name: str | None = Field(default=None, max_length=100)
    port: int | None = Field(default=None, ge=1, le=65535)
    health_url: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        name = value.strip()
        if not name:
            raise ValueError("Web service name cannot be empty")
        return name

    @field_validator("health_url")
    @classmethod
    def _normalize_health_url(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None


class WebServiceOut(BaseModel):
    id: int
    host_id: int
    name: str
    port: int
    health_url: str = ""
    status: str = "unknown"
    checked_at: str | None = None
    error: str | None = None
    created_at: str


class HostOut(BaseModel):
    id: int
    container_id: int
    name: str
    address: str
    os: OS
    auto_refresh: int = 0
    ping_status: str = "unknown"
    ping_at: str | None = None
    ping_ms: float | None = None
    ssh_auth: SSHAuth = SSHAuth.KEY
    ssh_user: str = ""
    ssh_port: int = 22
    ssh_password: str = ""
    ssh_status: str = "unknown"
    ssh_at: str | None = None
    ssh_error: str | None = None
    docker_enabled: bool = False
    docker_command: str = "sudo docker ps"
    web_services: list[WebServiceOut] = []
    created_at: str


class DockerContainerOut(BaseModel):
    id: str
    image: str
    command: str = ""
    created: str = ""
    status: str = ""
    ports: str = ""
    names: str = ""


class DockerOut(BaseModel):
    enabled: bool
    containers: list[DockerContainerOut] = []
    error: str | None = None


class LogOut(BaseModel):
    id: int
    host_id: int
    ts: str
    level: str
    message: str