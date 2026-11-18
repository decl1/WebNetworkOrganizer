"""FastAPI application WebNetworkOrganizer: REST API and static files."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import PUBLIC_DIR
from .db.database import init_db
from .routers import containers, health, hosts, settings


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    yield


app = FastAPI(title="WebNetworkOrganizer", lifespan=lifespan)

app.include_router(containers.router)
app.include_router(hosts.router)
app.include_router(settings.router)
app.include_router(health.router)

app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="static")