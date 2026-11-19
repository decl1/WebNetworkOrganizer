"""Host reachability checks via ICMP ping."""

import re
import subprocess

_TIME_RE = re.compile(r"time[=<]([\d.]+)\s*ms")


def ping_host(address: str, timeout: int = 5) -> dict:
    """Ping a host once and return {ok, ms, error}.

    ms is the round-trip time in milliseconds, or None when it could not be
    parsed. error is a short reason when the check did not succeed.
    """
    address = (address or "").strip()
    if not address:
        return {"ok": False, "ms": None, "error": "address is not set"}
    if re.fullmatch(r"[A-Za-z0-9._:%+-]+", address) is None:
        return {"ok": False, "ms": None, "error": "invalid address"}
    try:
        proc = subprocess.run(
            ["ping", "-c", "1", "-W", str(max(1, timeout - 1)), "-n", address],
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "ms": None, "error": "timeout"}
    except FileNotFoundError:
        return {"ok": False, "ms": None, "error": "ping is not available"}
    if proc.returncode != 0:
        return {"ok": False, "ms": None, "error": "no response"}
    match = _TIME_RE.search(proc.stdout)
    ms: float | None
    try:
        ms = round(float(match.group(1)), 2) if match else None
    except ValueError:
        ms = None
    return {"ok": True, "ms": ms, "error": None}