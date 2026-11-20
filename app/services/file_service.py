"""File system operations on hosts over SSH: listing, reading, writing, transferring.

SFTP is the primary transport; operations that the SSH user cannot access fall
back to shell commands with the sudo attempt chain (same as Docker/SysInfo).
"""

import base64
import posixpath
import shlex
import stat as statmod
import time
from typing import Any, Iterator

from . import ssh_service

READ_LIMIT = 512 * 1024
CHUNK = 256 * 1024
SAFE_COPY_DEPTH = 64


class FsError(Exception):
    """User-facing file operation error."""


def resolve_path(host: dict[str, Any], raw: str) -> str:
    """Normalize a browser-supplied path; ``~`` is expanded to the SSH user home."""
    value = (raw or "").strip().replace("\\", "/")
    if value in ("", "~", "~/"):
        return home_dir(host)
    if value.startswith("~/"):
        return posixpath.normpath(posixpath.join(home_dir(host), value[2:]))
    path = posixpath.normpath(value)
    if path in ("", "."):
        return "/"
    if not path.startswith("/"):
        path = "/" + path
    return path


def home_dir(host: dict[str, Any]) -> str:
    try:
        code, out, err = ssh_service.run_command(host, "printf '%s' \"$HOME\"", timeout=10)
        if code == 0:
            home = out.strip()
            if home.startswith("/"):
                return home
    except Exception:
        pass
    return "/"


def _run_shell_success(
    host: dict[str, Any],
    plain_cmd: str,
    sudo_cmd: str,
    timeout: int = 45,
) -> tuple[bool, str, str]:
    """Run ``plain_cmd``, then the sudo attempt chain for ``sudo_cmd``.

    Returns ``(True, stdout, stderr)`` on the first successful attempt and
    ``(False, "", last_stderr)`` when every attempt failed. A pipeline reports
    the exit code of its last command, so an attempt with empty stdout but
    non-empty stderr counts as a failure too.
    """
    last_err = ""

    def _ok(code: int, out: str, err: str) -> bool:
        return code == 0 and not (err.strip() and not out.strip())

    if plain_cmd:
        try:
            code, out, err = ssh_service.run_command(host, plain_cmd, timeout)
        except Exception as exc:
            last_err = str(exc)
        else:
            if _ok(code, out, err):
                return True, out, err
            last_err = (err or out).strip()
    if sudo_cmd:
        # Iterate the attempt chain manually: run_command_variants stops at the
        # first exit code 0, but a pipeline reports the last command's exit
        # code, so a failing head/dd would mask permission errors.
        attempts = ssh_service.command_attempts(sudo_cmd, host.get("sudo_password") or "")
        for _label, variant in attempts:
            try:
                code, out, err = ssh_service.run_command(host, variant, timeout)
            except Exception as exc:
                last_err = str(exc)
                continue
            if _ok(code, out, err):
                return True, out, err
            last_err = (err or out).strip() or last_err
    return False, "", last_err


def _shell_error(path: str, last_err: str) -> FsError:
    if "No such file or directory" in last_err:
        return FsError(f"Path not found: {path}")
    return FsError(f"Access denied: {path}")


def _entry(path: str, name: str, kind: str, size: int, mtime: float, mode: str = "") -> dict:
    return {
        "name": name,
        "path": posixpath.join(path, name),
        "type": kind,
        "size": size,
        "mtime": mtime,
        "mode": mode,
    }


def list_dir(host: dict[str, Any], raw_path: str) -> dict:
    """List directory entries; returns ``{"path", "entries"}`` or raises FsError."""
    path = resolve_path(host, raw_path)
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        attrs = sftp.listdir_attr(path)
    except FileNotFoundError as exc:
        raise FsError(f"Path not found: {path}") from None
    except Exception as exc:
        entries = _shell_list(host, path)
        if entries is None:
            raise FsError(f"Access denied: {path} ({exc})") from None
        return {"path": path, "entries": entries}
    finally:
        _close_sftp(client, sftp)

    entries: list[dict] = []
    for attr in attrs:
        kind = _attr_kind(attr.st_mode)
        entries.append(
            _entry(
                path,
                attr.filename,
                kind,
                attr.st_size if kind != "dir" else 0,
                float(attr.st_mtime or 0),
                statmod.filemode(attr.st_mode),
            )
        )
    entries.sort(key=lambda item: (item["type"] != "dir", item["name"].lower()))
    return {"path": path, "entries": entries}


def _attr_kind(mode: int) -> str:
    if statmod.S_ISDIR(mode):
        return "dir"
    if statmod.S_ISREG(mode):
        return "file"
    if statmod.S_ISLNK(mode):
        return "link"
    return "file"


def _shell_list(host: dict[str, Any], path: str) -> list[dict] | None:
    """Fallback directory listing via ``find -printf`` (GNU find, Linux hosts)."""
    quoted = shlex.quote(path)
    cmd = f"find {quoted} -maxdepth 1 -mindepth 1 -printf '%y\\t%f\\t%s\\t%T@\\n'"
    ok, out, last_err = _run_shell_success(host, cmd, f"sudo {cmd}")
    if not ok:
        err = _shell_error(path, last_err)
        raise err from None
    entries: list[dict] = []
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) != 4:
            continue
        kind_char, name, size, mtime = parts
        kind = "dir" if kind_char == "d" else "link" if kind_char == "l" else "file"
        try:
            size_value = int(size) if kind == "file" else 0
            mtime_value = float(mtime) if mtime else 0.0
        except ValueError:
            size_value, mtime_value = 0, 0.0
        entries.append(_entry(path, name, kind, size_value, mtime_value))
    entries.sort(key=lambda item: (item["type"] != "dir", item["name"].lower()))
    return entries


def read_file(host: dict[str, Any], raw_path: str) -> dict:
    """Read a file for the editor; returns content metadata or raises FsError."""
    path = resolve_path(host, raw_path)
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        try:
            with sftp.open(path, "rb") as handle:
                data = handle.read(READ_LIMIT + 1)
        except FileNotFoundError:
            raise FsError(f"Path not found: {path}") from None
        except Exception as exc:
            data = _shell_read(host, path)
            if data is None:
                raise FsError(f"Access denied: {path} ({exc})") from None
    finally:
        _close_sftp(client, sftp)

    truncated = len(data) > READ_LIMIT
    data = data[:READ_LIMIT]
    binary = b"\0" in data
    return {
        "path": path,
        "size": len(data),
        "binary": binary,
        "truncated": truncated,
        "content": data.decode("utf-8", "replace") if not binary else "",
    }


def _shell_read(host: dict[str, Any], path: str) -> bytes | None:
    """Fallback file read: ``head -c`` piped through base64 as plain commands.

    ``sudo`` only accepts a bare command line, so the payload must not contain
    shell assignments; the failure of ``head`` on an unreadable file surfaces
    on stderr and is caught by the empty-stdout heuristic.
    """
    quoted = shlex.quote(path)
    cmd = f"head -c {READ_LIMIT + 1} {quoted} | base64 -w0"
    ok, out, last_err = _run_shell_success(host, cmd, f"sudo {cmd}")
    if not ok:
        raise _shell_error(path, last_err) from None
    try:
        return base64.b64decode(out.strip())
    except Exception:
        return None


def write_file(host: dict[str, Any], raw_path: str, content: str) -> dict:
    """Write text content to a file; returns ``{"path", "bytes"}`` or raises FsError."""
    path = resolve_path(host, raw_path)
    data = content.encode("utf-8")
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        try:
            _sftp_write_all(sftp, path, data)
        except FileNotFoundError:
            raise FsError(f"Path not found: {path}") from None
        except Exception as exc:
            _shell_place(host, data, path, exc)
    finally:
        _close_sftp(client, sftp)
    return {"path": path, "bytes": len(data)}


def _sftp_write_all(sftp, path: str, data: bytes) -> None:
    with sftp.open(path, "wb") as handle:
        handle.write(data)


def _shell_place(host: dict[str, Any], data: bytes, target: str, cause: Exception) -> None:
    """Write through a /tmp staging file when the target is not writable directly.

    The file is uploaded to /tmp via SFTP (writable anywhere), then moved onto
    the target with the sudo attempt chain; ``cp`` is used when a cross-device
    move fails.
    """
    tmp = f"/tmp/wno-{time.time_ns()}"
    move = f"mv {shlex.quote(tmp)} {shlex.quote(target)}"
    copy = f"cp {shlex.quote(tmp)} {shlex.quote(target)} && rm -f {shlex.quote(tmp)}"
    remove = f"rm -f {shlex.quote(tmp)}"
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        try:
            _sftp_write_all(sftp, tmp, data)
        except Exception:
            raise FsError(f"Access denied: {target} ({cause})") from None
        ok, _, _ = _run_shell_success(host, move, f"sudo {move}", timeout=30)
        if not ok:
            ok, _, _ = _run_shell_success(host, copy, f"sudo {copy}", timeout=60)
        if not ok:
            raise FsError(f"Access denied: {target} ({cause})") from None
    finally:
        if sftp is not None and client is not None:
            try:
                ssh_service.run_command(host, remove, timeout=15)
            except Exception:
                pass
        _close_sftp(client, sftp)


def upload_file(
    host: dict[str, Any],
    raw_path: str,
    filename: str,
    handle: Any,
) -> dict:
    """Upload a file into a directory, streaming from ``handle`` in chunks."""
    path = resolve_path(host, raw_path)
    safe_name = posixpath.basename((filename or "").replace("\\", "/")) or "upload"
    target = posixpath.join(path, safe_name)
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        try:
            with sftp.open(target, "wb") as remote:
                while True:
                    chunk = handle.read(CHUNK)
                    if not chunk:
                        break
                    remote.write(chunk)
        except FileNotFoundError:
            raise FsError(f"Path not found: {path}") from None
        except Exception as exc:
            _shell_place(host, _read_all(handle), target, exc)
    finally:
        _close_sftp(client, sftp)
    return {"path": target}


def _read_all(handle: Any) -> bytes:
    if hasattr(handle, "seek"):
        try:
            handle.seek(0)
        except Exception:
            pass
    chunks: list[bytes] = []
    while True:
        chunk = handle.read(CHUNK)
        if not chunk:
            break
        chunks.append(chunk)
    return b"".join(chunks)


def download_file(host: dict[str, Any], raw_path: str) -> tuple[str, int | None, Iterator[bytes]]:
    """Open a streaming download; returns ``(resolved_path, size, chunk iterator)``."""
    path = resolve_path(host, raw_path)
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        try:
            remote = sftp.open(path, "rb")
        except FileNotFoundError:
            raise FsError(f"Path not found: {path}") from None
        except Exception:
            remote = None
    except Exception:
        remote = None
    if remote is not None:
        try:
            size = int(sftp.stat(path).st_size)
        except Exception:
            size = None
        stream = _finish_sftp_stream(client, sftp, remote)
        return path, size, stream
    _close_sftp(client, sftp)

    size = _shell_size(host, path)
    if size is None:
        quoted = shlex.quote(path)
        cmd = f"cat {quoted}"
        ok, _out, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=20)
        if ok:
            return path, None, iter([_out.encode("utf-8", "replace")])
        raise _shell_error(path, last_err) from None
    return path, size, _shell_download_chunks(host, path, size)


def _shell_size(host: dict[str, Any], path: str) -> int | None:
    quoted = shlex.quote(path)
    cmd = f"stat -c %s {quoted}"
    ok, out, _last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=20)
    if not ok:
        return None
    try:
        return int(out.strip().splitlines()[0])
    except (ValueError, IndexError):
        return None


def _shell_download_chunks(host: dict[str, Any], path: str, size: int) -> Iterator[bytes]:
    quoted = shlex.quote(path)
    offset = 0
    while offset < size:
        count = min(CHUNK, size - offset)
        cmd = f"dd if={quoted} bs=1 skip={offset} count={count} status=none | base64 -w0"
        ok, out, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=60)
        if not ok:
            raise _shell_error(path, last_err) from None
        chunk = base64.b64decode(out.strip())
        if not chunk:
            break
        yield chunk
        offset += len(chunk)


def _finish_sftp_stream(client, sftp, remote) -> Iterator[bytes]:
    def stream() -> Iterator[bytes]:
        try:
            while True:
                chunk = remote.read(CHUNK)
                if not chunk:
                    break
                yield chunk
        finally:
            _close_sftp(client, sftp)

    return stream()


def _close_sftp(client, sftp) -> None:
    if sftp is not None:
        try:
            sftp.close()
        except Exception:
            pass
    if client is not None:
        try:
            client.close()
        except Exception:
            pass


def rename_entry(host: dict[str, Any], raw_path: str, new_name: str) -> str:
    """Rename a file or folder; returns the new path or raises FsError."""
    path = resolve_path(host, raw_path)
    if path == "/":
        raise FsError("Cannot rename the root directory")
    name = (new_name or "").strip().replace("\\", "/")
    if not name or "/" in name or name in (".", ".."):
        raise FsError(f"Invalid name: {new_name!r}")
    target = posixpath.join(posixpath.dirname(path), name)
    if target == path:
        return path
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        try:
            sftp.rename(path, target)
            return target
        except FileNotFoundError:
            raise FsError(f"Path not found: {path}") from None
        except Exception:
            pass
    finally:
        _close_sftp(client, sftp)
    cmd = f"mv -- {shlex.quote(path)} {shlex.quote(target)}"
    ok, _, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=30)
    if not ok:
        raise _shell_error(path, last_err) from None
    return target


def delete_paths(host: dict[str, Any], raw_paths: list[str]) -> int:
    """Delete files/folders (recursively); returns the deleted count or raises FsError."""
    paths: list[str] = []
    for raw in raw_paths or []:
        path = resolve_path(host, raw)
        if path == "/":
            raise FsError("Refusing to delete the root directory")
        if path not in paths:
            paths.append(path)
    if not paths:
        raise FsError("No paths selected")
    quoted = " ".join(shlex.quote(p) for p in paths)
    cmd = f"rm -rf -- {quoted}"
    ok, _, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=120)
    if not ok:
        raise _shell_error(", ".join(paths), last_err) from None
    return len(paths)


def make_dir(host: dict[str, Any], raw_path: str, name: str) -> str:
    """Create a folder inside ``raw_path``; returns the new path or raises FsError."""
    parent = resolve_path(host, raw_path)
    value = (name or "").strip().replace("\\", "/")
    if not value or "/" in value or value in (".", ".."):
        raise FsError(f"Invalid name: {name!r}")
    target = posixpath.join(parent, value)
    cmd = f"mkdir -p {shlex.quote(target)}"
    ok, _, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=30)
    if not ok:
        raise _shell_error(target, last_err) from None
    return target


def create_archive(host: dict[str, Any], raw_paths: list[str]) -> tuple[str, int | None, Iterator[bytes]]:
    """Pack entries into a remote tar.gz and stream it; returns (name, size, stream)."""
    paths = [resolve_path(host, raw) for raw in raw_paths or [] if raw]
    if not paths:
        raise FsError("No paths selected")
    single = len(paths) == 1
    base = posixpath.basename(paths[0]) or "archive"
    name = f"{base}.tar.gz" if single else f"wno-archive-{time.strftime('%Y%m%d-%H%M%S')}.tar.gz"
    tmp = f"/tmp/wno-{time.time_ns()}.tar.gz"
    operands: list[str] = []
    for path in paths:
        parent = posixpath.dirname(path) or "/"
        basename = posixpath.basename(path) or path
        operands.extend(["-C", shlex.quote(parent), shlex.quote(basename)])
    cmd = f"tar czf {shlex.quote(tmp)} {' '.join(operands)}"
    ok, _, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=600)
    if not ok:
        raise FsError(f"Archive creation failed: {(last_err or 'tar error').strip()}") from None

    def cleanup() -> None:
        _run_shell_success(host, f"rm -f {shlex.quote(tmp)}", f"sudo rm -f {shlex.quote(tmp)}", timeout=30)

    try:
        _resolved, size, stream = download_file(host, tmp)
    except Exception:
        try:
            cleanup()
        except Exception:
            pass
        raise

    def gen() -> Iterator[bytes]:
        try:
            yield from stream
        finally:
            try:
                cleanup()
            except Exception:
                pass

    return name, size, gen()


def _path_kind(host: dict[str, Any], path: str) -> str:
    """Return "dir" when ``path`` is a directory, "file" otherwise (no raise)."""
    client = None
    sftp = None
    try:
        client, sftp = ssh_service.open_sftp(host)
        attrs = sftp.stat(path)
        return "dir" if statmod.S_ISDIR(attrs.st_mode) else "file"
    except Exception:
        pass
    finally:
        _close_sftp(client, sftp)
    cmd = f"stat -c %F {shlex.quote(path)}"
    ok, out, _last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=20)
    if ok and out.strip().startswith("directory"):
        return "dir"
    return "file"


def _ensure_dir(host: dict[str, Any], path: str) -> None:
    try:
        list_dir(host, path)
        return
    except FsError:
        pass
    cmd = f"mkdir -p {shlex.quote(path)}"
    ok, _, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=30)
    if not ok:
        raise FsError(f"Cannot create the folder: {path} ({last_err.strip()})") from None


class _StreamReader:
    """Adapter turning a byte iterator into a read()-able upload handle."""

    def __init__(self, stream: Iterator[bytes]):
        self._stream = stream
        self._buf = b""

    def read(self, size: int) -> bytes:
        while len(self._buf) < size:
            try:
                chunk = next(self._stream)
            except StopIteration:
                break
            if not chunk:
                break
            self._buf += chunk
        out, self._buf = self._buf[:size], self._buf[size:]
        return out


def copy_paths(
    src_host: dict[str, Any],
    dst_host: dict[str, Any],
    raw_paths: list[str],
    raw_target_dir: str,
    move: bool,
) -> int:
    """Copy or move entries to another folder or another host; returns the entry count."""
    src_paths = [resolve_path(src_host, raw) for raw in raw_paths or [] if raw]
    if not src_paths:
        raise FsError("No paths selected")
    target = resolve_path(dst_host, raw_target_dir)
    for path in src_paths:
        if path == "/":
            raise FsError("Cannot move or copy the root directory")
        if path == target or target.startswith(path.rstrip("/") + "/"):
            raise FsError(f"Cannot copy or move a folder into itself: {path}")
    same_host = src_host.get("id") == dst_host.get("id")
    if same_host:
        for path in src_paths:
            _shell_copy_entry(src_host, path, target, move)
    else:
        visited: set[str] = set()
        for path in src_paths:
            _copy_entry_recursive(src_host, dst_host, path, target, visited, 0)
        if move:
            delete_paths(src_host, src_paths)
    return len(src_paths)


def _shell_copy_entry(host: dict[str, Any], src: str, dst_dir: str, move: bool) -> None:
    """Move or copy one entry on the same host (a directory landing on an existing
    folder nests into it, like a file explorer would)."""
    dst = posixpath.join(dst_dir, posixpath.basename(src))
    if _path_kind(host, dst) == "dir":
        dst = posixpath.join(dst, posixpath.basename(src))
    if dst == src:
        return
    if move:
        cmd = f"mv -- {shlex.quote(src)} {shlex.quote(dst)}"
        ok, _, last_err = _run_shell_success(host, cmd, f"sudo {cmd}", timeout=60)
        if ok:
            return
        copy_cmd = f"cp -a -- {shlex.quote(src)} {shlex.quote(dst)}"
        ok, _, last_err = _run_shell_success(host, copy_cmd, f"sudo {copy_cmd}", timeout=600)
        if not ok:
            raise FsError(f"Move failed: {(last_err or 'error').strip()}") from None
        delete_paths(host, [src])
        return
    copy_cmd = f"cp -a -- {shlex.quote(src)} {shlex.quote(dst)}"
    ok, _, last_err = _run_shell_success(host, copy_cmd, f"sudo {copy_cmd}", timeout=600)
    if not ok:
        raise FsError(f"Copy failed: {(last_err or 'error').strip()}") from None


def _copy_entry_recursive(
    src_host: dict[str, Any],
    dst_host: dict[str, Any],
    src_path: str,
    dst_dir: str,
    visited: set[str],
    depth: int,
) -> None:
    """Copy a file or an entire folder tree between two different hosts."""
    if depth > SAFE_COPY_DEPTH or src_path in visited:
        return
    visited.add(src_path)
    kind = _path_kind(src_host, src_path)
    base = posixpath.basename(src_path)
    if kind == "dir":
        dst = posixpath.join(dst_dir, base)
        if _path_kind(dst_host, dst) != "dir":
            _ensure_dir(dst_host, dst)
        entries = list_dir(src_host, src_path)["entries"]
        for entry in entries:
            _copy_entry_recursive(src_host, dst_host, entry["path"], dst, visited, depth + 1)
        return
    dest_dir = dst_dir
    probe = posixpath.join(dst_dir, base)
    if _path_kind(dst_host, probe) == "dir":
        dest_dir = probe
    _resolved, _size, stream = download_file(src_host, src_path)
    upload_file(dst_host, dest_dir, base, _StreamReader(stream))