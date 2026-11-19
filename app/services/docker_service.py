"""Docker containers discovery over SSH."""

import re
from typing import Any

_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]")
_ID_RE = re.compile(r"[0-9a-f]{12}")


def _strip_ansi(text: str) -> str:
    return _ANSI_RE.sub("", text)


def parse_docker_ps(output: str) -> list[dict[str, Any]]:
    """Parse the standard ``docker ps`` table into container dicts.

    Columns are located by the header line, so cell values that contain
    single spaces (e.g. "2 hours ago", "0.0.0.0:80->80/tcp") stay intact.
    """
    lines = [_strip_ansi(line).rstrip() for line in output.splitlines()]
    lines = [line for line in lines if line.strip()]
    if not lines:
        return []
    header = lines[0]
    columns = [column for column in re.split(r"\s{2,}", header.rstrip()) if column]
    if not columns or columns[0] != "CONTAINER ID":
        return []
    starts: list[int] = []
    search_from = 0
    for column in columns:
        index = header.index(column, search_from)
        starts.append(index)
        search_from = index + len(column)

    containers: list[dict[str, Any]] = []
    for line in lines[1:]:
        row: dict[str, Any] = {}
        for index, column in enumerate(columns):
            start = starts[index]
            end = starts[index + 1] if index + 1 < len(columns) else len(line)
            row[column] = line[start:end].strip()
        if not _ID_RE.fullmatch(row.get("CONTAINER ID", "")):
            continue
        containers.append(
            {
                "id": row.get("CONTAINER ID", ""),
                "image": row.get("IMAGE", ""),
                "command": row.get("COMMAND", ""),
                "created": row.get("CREATED", ""),
                "status": row.get("STATUS", ""),
                "ports": row.get("PORTS", ""),
                "names": row.get("NAMES", ""),
            }
        )
    return containers