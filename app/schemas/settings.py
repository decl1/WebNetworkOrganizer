"""Application settings schemas."""

from enum import Enum

from pydantic import BaseModel


class Theme(str, Enum):
    DARK = "dark"
    LIGHT = "light"


class Language(str, Enum):
    EN = "en"
    RU = "ru"


class Settings(BaseModel):
    theme: Theme
    language: Language


class SettingsPatch(BaseModel):
    """Partial settings update: only the provided fields are changed."""

    theme: Theme | None = None
    language: Language | None = None