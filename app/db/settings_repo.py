"""Application settings repository."""

from typing import Any

from .database import connect


def get_all_settings() -> dict[str, str]:
    """Return all saved settings as {key: value}."""
    with connect() as conn:
        rows = conn.execute("SELECT key, value FROM settings")
        return {str(row["key"]): str(row["value"]) for row in rows}


def save_settings(values: dict[str, str]) -> None:
    """Save (upsert) a batch of settings."""
    with connect() as conn:
        conn.executemany(
            "INSERT INTO settings (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            list(values.items()),
        )