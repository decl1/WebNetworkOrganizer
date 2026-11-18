"""Settings logic: defaults, reads and updates."""

import json
from functools import lru_cache
from typing import Any

from ..config import DEFAULTS_FILE
from ..db import settings_repo


@lru_cache(maxsize=1)
def get_defaults() -> dict[str, str]:
    """Default settings from public/defaults.json."""
    with DEFAULTS_FILE.open(encoding="utf-8") as file:
        raw: dict[str, Any] = json.load(file)
    return {key: str(value) for key, value in raw.items()}


def get_settings() -> dict[str, str]:
    """Effective settings: defaults overridden by saved values."""
    merged = dict(get_defaults())
    merged.update(settings_repo.get_all_settings())
    return merged


def update_settings(patch: dict[str, str]) -> dict[str, str]:
    """Apply a partial update and return the effective settings."""
    current = get_settings()
    current.update(patch)
    settings_repo.save_settings(current)
    return current