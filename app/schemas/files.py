"""File system schemas for host file browsing and editing."""

from pydantic import BaseModel


class FsEntry(BaseModel):
    name: str
    path: str
    type: str = "file"
    size: int = 0
    mtime: float = 0.0
    mode: str = ""


class FsListOut(BaseModel):
    path: str = ""
    error: str | None = None
    entries: list[FsEntry] = []


class FsReadOut(BaseModel):
    path: str = ""
    error: str | None = None
    size: int = 0
    binary: bool = False
    truncated: bool = False
    content: str = ""