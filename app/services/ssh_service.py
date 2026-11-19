"""SSH connectivity: organizer key management, checks and interactive shells."""

import os
from typing import Any

import paramiko

from ..config import DATA_DIR

KEY_DIR = DATA_DIR / "ssh"
_KEY_FILE = KEY_DIR / "id_ed25519"
_RSA_FALLBACK = KEY_DIR / "id_rsa"


def get_public_key() -> str:
    """Return the organizer's public key (generating the key if needed)."""
    with _ensure_key_file().with_suffix(".pub").open(encoding="utf-8") as handle:
        return handle.read().strip()


def _ensure_key_file() -> os.PathLike:
    if _KEY_FILE.exists():
        return _KEY_FILE
    if _RSA_FALLBACK.exists():
        return _RSA_FALLBACK
    KEY_DIR.mkdir(parents=True, exist_ok=True)
    try:
        key = paramiko.Ed25519Key.generate()
        key_file = _KEY_FILE
    except (AttributeError, NotImplementedError, ValueError):
        key = paramiko.RSAKey.generate(bits=2048)
        key_file = _RSA_FALLBACK
    key.write_private_key_file(str(key_file))
    os.chmod(key_file, 0o600)
    key_file.with_suffix(".pub").write_text(
        f"{key.get_name()} {key.get_base64()} organizer@webnetworkorganizer\n",
        encoding="utf-8",
    )
    return key_file


def _load_key() -> paramiko.PKey:
    key_file = _ensure_key_file()
    for cls in (paramiko.Ed25519Key, paramiko.RSAKey):
        try:
            return cls.from_private_key_file(str(key_file))
        except (paramiko.SSHException, OSError, ValueError):
            continue
    raise RuntimeError("Unable to load the organizer SSH key")


def _connect(host: dict[str, Any], timeout: int = 5) -> paramiko.SSHClient:
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    address = (host.get("address") or "").strip()
    user = (host.get("ssh_user") or "").strip()
    if not address or not user:
        raise ValueError("SSH is not configured: address or login is empty")
    kwargs: dict[str, Any] = {
        "hostname": address,
        "port": int(host.get("ssh_port") or 22),
        "username": user,
        "timeout": timeout,
        "banner_timeout": timeout,
        "auth_timeout": timeout,
        "allow_agent": False,
        "look_for_keys": False,
    }
    if host.get("ssh_auth") == "password":
        password = host.get("ssh_password") or ""
        if not password:
            raise ValueError("SSH password is empty")
        kwargs["password"] = password
    else:
        kwargs["pkey"] = _load_key()
    client.connect(**kwargs)
    return client


def check_ssh(host: dict[str, Any], timeout: int = 5) -> dict:
    """Connect to the host and run a trivial command; return {ok, error}."""
    client = None
    try:
        client = _connect(host, timeout)
        _, stdout, _ = client.exec_command("echo ok", timeout=timeout)
        stdout.read()
        return {"ok": True, "error": None}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}
    finally:
        if client is not None:
            client.close()


def run_command(host: dict[str, Any], command: str, timeout: int = 15) -> tuple[int, str, str]:
    """Connect to the host, run a shell command and return (exit code, stdout, stderr)."""
    client = None
    try:
        client = _connect(host, timeout)
        _, stdout, stderr = client.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", "replace")
        err = stderr.read().decode("utf-8", "replace")
        exit_code = stdout.channel.recv_exit_status()
        return exit_code, out, err
    finally:
        if client is not None:
            client.close()


def open_shell(host: dict[str, Any]) -> tuple[paramiko.SSHClient, paramiko.Channel]:
    """Connect to the host and start an interactive PTY shell."""
    client = _connect(host, 8)
    try:
        channel = client.invoke_shell(term="xterm-256color", width=100, height=30)
    except Exception:
        client.close()
        raise
    return client, channel