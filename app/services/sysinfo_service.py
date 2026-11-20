"""SysInfo: custom per-host console parameters evaluated over SSH."""

import re
from typing import Any

from ..db import hosts_repo, logs_repo, sysinfo_repo
from .ssh_service import run_command_variants

VALUE_LIMIT = 2000


def list_params(host_id: int) -> list[dict[str, Any]]:
    """Return the sysinfo parameters of a host, seeding defaults when it has none."""
    sysinfo_repo.seed_defaults(host_id)
    return sysinfo_repo.list_params(host_id)


def replace_params(host_id: int, params: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Replace all sysinfo parameters of a host (missing name or command are skipped) and log the change."""
    cleaned: list[dict[str, str]] = []
    for param in params:
        name = str(param.get("name") or "").strip()
        command = str(param.get("command") or "").strip()
        if not (name and command):
            continue
        cleaned.append(
            {
                "name": name,
                "command": command,
                "parse": str(param.get("parse") or "").strip(),
            }
        )
    rows = sysinfo_repo.replace_params(host_id, cleaned)
    if rows:
        logs_repo.add_log(host_id, "info", f"SysInfo params updated: {len(rows)} parameter(s)")
    return rows


def _parse_output(raw: str, pattern: str) -> tuple[str, str | None]:
    """Extract the value from the raw output with a regex pattern.

    Returns (value, error). With a capture group the group is used, otherwise
    the whole match; empty pattern keeps the raw output untouched.
    """
    if not pattern:
        return raw, None
    try:
        match = re.search(pattern, raw)
    except re.error as exc:
        return "", f"Invalid parse pattern: {exc}"
    if match is None:
        return "", f"No match for pattern: {pattern}"
    value = match.group(1) if match.lastindex else match.group(0)
    return value, None


def _run_one(host: dict[str, Any], param: dict[str, Any]) -> dict[str, Any]:
    """Evaluate a single parameter over SSH; returns its result dict."""
    sudo_password = str(host.get("sudo_password") or "")
    results = run_command_variants(host, param["command"], sudo_password, timeout=10)
    base = {
        "id": param["id"],
        "name": param["name"],
        "command": param["command"],
        "parse": param.get("parse") or "",
    }
    for label, exit_code, out, err in results:
        if exit_code == 0:
            value, parse_error = _parse_output(out.strip(), base["parse"])
            if parse_error is not None:
                return {**base, "value": None, "error": parse_error}
            return {**base, "value": value[:VALUE_LIMIT], "error": None}
    if results:
        label, exit_code, out, err = results[-1]
        message = (err or out or f"Command exited with code {exit_code}").strip()
    else:
        message = "Command failed"
    return {**base, "value": None, "error": message}


def check_sysinfo(host_id: int) -> dict[str, Any] | None:
    """Evaluate all sysinfo parameters of a host; None if the host does not exist."""
    host = hosts_repo.get_host(host_id)
    if host is None:
        return None
    params = list_params(host_id)
    if not (host.get("ssh_user") or "").strip():
        return {"error": "SSH is not configured for this host", "results": []}
    results = [_run_one(host, param) for param in params]
    ok = sum(1 for result in results if result["error"] is None)
    hostname = host.get("address")
    if ok == 0 and results:
        logs_repo.add_log(host_id, "error", f"SysInfo failed ({hostname}): no parameter returned data")
    else:
        logs_repo.add_log(host_id, "ok", f"SysInfo OK ({hostname}): {ok}/{len(results)} parameter(s)")
    return {"error": None, "results": results}