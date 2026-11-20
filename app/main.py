"""FastAPI application WebNetworkOrganizer: REST API and static files."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .config import PUBLIC_DIR
from .db.database import init_db
from .mcp import build_mcp_handlers
from .routers import containers, files, health, hosts, settings, sysinfo
from .services.snapshot import write_status_snapshot

mcp_handlers, mcp_session = build_mcp_handlers()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    init_db()
    write_status_snapshot()
    async with mcp_session.run():
        yield


app = FastAPI(title="WebNetworkOrganizer", lifespan=lifespan)

app.include_router(containers.router)
app.include_router(hosts.router)
app.include_router(sysinfo.router)
app.include_router(files.router)
app.include_router(settings.router)
app.include_router(health.router)

app.add_route("/mcp", mcp_handlers, methods=["GET", "POST"])
app.mount("/mcp", mcp_handlers)

app.mount("/", StaticFiles(directory=PUBLIC_DIR, html=True), name="static")