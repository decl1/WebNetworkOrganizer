"""Web service health checks over HTTP."""

import urllib.error
import urllib.request
from urllib.parse import urlparse


def build_health_url(address: str, health_url: str, port: int) -> str:
    """Build the URL used to probe a web service.

    A full http(s):// URL is used as-is; a bare path is joined to the host
    address and port; an empty value probes the service root.
    """
    path = (health_url or "").strip()
    if path.lower().startswith(("http://", "https://")):
        return path
    address = (address or "").strip()
    if not address:
        raise ValueError("host address is not set")
    prefix = f"http://{address}:{int(port)}"
    if not path:
        return prefix + "/"
    if not path.startswith("/"):
        path = "/" + path
    return prefix + path


def check_health(address: str, health_url: str, port: int, timeout: int = 4) -> dict:
    """Probe a web service and return {ok, status, error}.

    ok is True when the endpoint responds with an HTTP 2xx status.
    """
    try:
        url = build_health_url(address, health_url, port)
    except ValueError as exc:
        return {"ok": False, "status": None, "error": str(exc)}
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return {"ok": False, "status": None, "error": "invalid health URL"}
    request = urllib.request.Request(url, method="GET", headers={"User-Agent": "WebNetworkOrganizer/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            code = response.getcode()
            return {"ok": 200 <= code < 300, "status": code, "error": None}
    except urllib.error.HTTPError as exc:
        return {"ok": False, "status": exc.code, "error": f"HTTP {exc.code}"}
    except urllib.error.URLError as exc:
        reason = getattr(exc, "reason", exc)
        return {"ok": False, "status": None, "error": str(reason)}
    except TimeoutError:
        return {"ok": False, "status": None, "error": "timeout"}