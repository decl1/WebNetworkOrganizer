"""Settings router: read and update settings."""

from fastapi import APIRouter

from ..schemas.settings import Settings, SettingsPatch
from ..services import settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("", response_model=Settings)
def get_settings() -> Settings:
    return Settings(**settings_service.get_settings())


@router.patch("", response_model=Settings)
def patch_settings(body: SettingsPatch) -> Settings:
    patch = {key: value for key, value in body.model_dump().items() if value is not None}
    return Settings(**settings_service.update_settings(patch))