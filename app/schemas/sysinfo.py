"""Sysinfo parameters schemas."""

from pydantic import BaseModel, Field, field_validator


class SysInfoParamIn(BaseModel):
    name: str = Field(max_length=100)
    command: str = Field(max_length=1000)
    parse: str = Field(default="", max_length=500)

    @field_validator("name")
    @classmethod
    def _normalize_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("command")
    @classmethod
    def _normalize_command(cls, value: str) -> str:
        return value.strip()

    @field_validator("parse")
    @classmethod
    def _normalize_parse(cls, value: str) -> str:
        return value.strip()


class SysInfoParamsReplace(BaseModel):
    params: list[SysInfoParamIn] = []


class SysInfoParamOut(BaseModel):
    id: int
    host_id: int
    name: str
    command: str
    parse: str = ""
    position: int = 0
    created_at: str


class SysInfoResultOut(BaseModel):
    id: int
    name: str
    command: str
    parse: str = ""
    value: str | None = None
    error: str | None = None


class SysInfoCheckOut(BaseModel):
    error: str | None = None
    results: list[SysInfoResultOut] = []