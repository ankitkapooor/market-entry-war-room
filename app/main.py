"""Market Entry War Room API."""

from __future__ import annotations

from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import data, markets, scenarios
from app.db.database import init_db
from app.errors import WarRoomError

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Market Entry War Room",
    description=(
        "Ranks US metropolitan markets for business expansion using Census data "
        "and an explicit, adjustable scoring model."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# The Vite dev server runs on another origin; the built UI is same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(markets.router, prefix="/api/v1")
app.include_router(scenarios.router, prefix="/api/v1")
app.include_router(data.router, prefix="/api/v1")

if FRONTEND_DIST.is_dir():
    app.mount("/ui", StaticFiles(directory=FRONTEND_DIST, html=True), name="ui")


@app.exception_handler(WarRoomError)
def handle_war_room_error(_request: Request, exc: WarRoomError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": type(exc).__name__, "detail": exc.message},
    )
