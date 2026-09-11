"""Market Entry War Room API."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api import data, markets, scenarios
from app.db.database import init_db
from app.errors import WarRoomError


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

app.include_router(markets.router, prefix="/api/v1")
app.include_router(scenarios.router, prefix="/api/v1")
app.include_router(data.router, prefix="/api/v1")


@app.exception_handler(WarRoomError)
def handle_war_room_error(_request: Request, exc: WarRoomError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": type(exc).__name__, "detail": exc.message},
    )
