"""Files router: browse, read, write, upload, download and manage files on hosts."""

import json

from fastapi import APIRouter, Body, File, Query, UploadFile
from fastapi.responses import StreamingResponse

from ..schemas.files import FsCopyIn, FsDeleteIn, FsListOut, FsMkdirIn, FsReadOut, FsRenameIn
from ..services import file_service, hosts_service

router = APIRouter(tags=["files"])

_FALLBACK_NAME = "download"


@router.get("/api/hosts/{host_id}/fs/list", response_model=FsListOut)
def fs_list(host_id: int, path: str = Query(default="~")) -> FsListOut:
    """List a directory on the host; ``~`` is expanded to the SSH user home."""
    host = _get_host(host_id)
    if host is None:
        return FsListOut(error="Host not found")
    try:
        result = file_service.list_dir(host, path)
    except file_service.FsError as exc:
        return FsListOut(error=str(exc))
    except Exception as exc:
        return FsListOut(error=f"Failed to list the folder: {exc}")
    return FsListOut(path=result["path"], entries=result["entries"])


@router.get("/api/hosts/{host_id}/fs/read", response_model=FsReadOut)
def fs_read(host_id: int, path: str = Query(...)) -> FsReadOut:
    """Read a text file for the built-in editor (binary content is not returned)."""
    host = _get_host(host_id)
    if host is None:
        return FsReadOut(error="Host not found")
    try:
        result = file_service.read_file(host, path)
    except file_service.FsError as exc:
        return FsReadOut(error=str(exc))
    except Exception as exc:
        return FsReadOut(error=f"Failed to read the file: {exc}")
    return FsReadOut(**result)


@router.get("/api/hosts/{host_id}/fs/download")
def fs_download(host_id: int, path: str = Query(...)) -> StreamingResponse:
    """Stream a file from the host."""
    host = _get_host(host_id)
    if host is None:
        return _json_error("Host not found", 404)
    try:
        resolved, size, stream = file_service.download_file(host, path)
    except file_service.FsError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(f"Download failed: {exc}", 500)
    headers = {"Content-Disposition": f'attachment; filename="{_header_filename(resolved)}"'}
    media_type = "application/octet-stream"
    return StreamingResponse(stream, media_type=media_type, headers=headers, status_code=200)


@router.post("/api/hosts/{host_id}/fs/upload")
def fs_upload(
    host_id: int,
    file: UploadFile = File(...),
    path: str = Query(default="~"),
) -> dict:
    """Upload a file (multipart) into a directory on the host."""
    host = _get_host(host_id)
    if host is None:
        return {"error": "Host not found"}
    name = file.filename or ""
    try:
        result = file_service.upload_file(host, path, name, file.file)
    except file_service.FsError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Upload failed: {exc}"}
    return {"ok": True, "path": result["path"]}


@router.put("/api/hosts/{host_id}/fs/write")
def fs_write(
    host_id: int,
    path: str = Query(...),
    body: str = Body(default="", media_type="text/plain"),
) -> dict:
    """Save editor text back to a file on the host."""
    host = _get_host(host_id)
    if host is None:
        return {"error": "Host not found"}
    try:
        result = file_service.write_file(host, path, body)
    except file_service.FsError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Failed to save the file: {exc}"}
    return {"ok": True, "path": result["path"], "bytes": result["bytes"]}


@router.post("/api/hosts/{host_id}/fs/rename")
def fs_rename(host_id: int, payload: FsRenameIn) -> dict:
    """Rename a file or folder."""
    host = _get_host(host_id)
    if host is None:
        return {"error": "Host not found"}
    try:
        new_path = file_service.rename_entry(host, payload.path, payload.new_name)
    except file_service.FsError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Rename failed: {exc}"}
    return {"ok": True, "path": new_path}


@router.post("/api/hosts/{host_id}/fs/delete")
def fs_delete(host_id: int, payload: FsDeleteIn) -> dict:
    """Delete selected files/folders (recursively)."""
    host = _get_host(host_id)
    if host is None:
        return {"error": "Host not found"}
    try:
        deleted = file_service.delete_paths(host, payload.paths)
    except file_service.FsError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Delete failed: {exc}"}
    return {"ok": True, "deleted": deleted}


@router.post("/api/hosts/{host_id}/fs/mkdir")
def fs_mkdir(host_id: int, payload: FsMkdirIn) -> dict:
    """Create a folder inside ``payload.path``."""
    host = _get_host(host_id)
    if host is None:
        return {"error": "Host not found"}
    try:
        path = file_service.make_dir(host, payload.path, payload.name)
    except file_service.FsError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Failed to create the folder: {exc}"}
    return {"ok": True, "path": path}


@router.post("/api/hosts/{host_id}/fs/copy")
def fs_copy(host_id: int, payload: FsCopyIn) -> dict:
    """Copy or move entries to another folder on the same host, or to another host."""
    src = _get_host(host_id)
    dst = _get_host(payload.target_host_id)
    if src is None or dst is None:
        return {"error": "Host not found"}
    try:
        count = file_service.copy_paths(src, dst, payload.paths, payload.target_dir, payload.move)
    except file_service.FsError as exc:
        return {"error": str(exc)}
    except Exception as exc:
        return {"error": f"Copy failed: {exc}"}
    return {"ok": True, "items": count, "moved": payload.move}


@router.get("/api/hosts/{host_id}/fs/zip")
def fs_zip(host_id: int, paths: list[str] = Query(...)) -> StreamingResponse:
    """Stream a tar.gz archive of the selected entries."""
    host = _get_host(host_id)
    if host is None:
        return _json_error("Host not found", 404)
    try:
        name, _size, stream = file_service.create_archive(host, paths)
    except file_service.FsError as exc:
        return _json_error(str(exc), 400)
    except Exception as exc:
        return _json_error(f"Archive creation failed: {exc}", 500)
    headers = {"Content-Disposition": f'attachment; filename="{_header_filename(name)}"'}
    return StreamingResponse(stream, media_type="application/gzip", headers=headers, status_code=200)


def _get_host(host_id: int):
    return hosts_service.get_host(host_id)


def _header_filename(path: str) -> str:
    name = path.split("/")[-1].strip() or _FALLBACK_NAME
    return name.replace('"', "")


def _json_error(detail: str, status_code: int) -> StreamingResponse:
    payload = json.dumps({"error": detail}).encode("utf-8")
    return StreamingResponse(
        iter([payload]),
        media_type="application/json",
        status_code=status_code,
    )