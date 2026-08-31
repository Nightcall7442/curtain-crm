"""Точка входа FastAPI-приложения.

Запуск: uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import dashboard, history, journal, tables, tariffs
from app.config import APP_TITLE, APP_VERSION, SEED_INITIAL_DATA
from app.database import SessionLocal, init_db
from app.seed import seed_initial_data
from app.services.errors import ConflictError, NotFoundError

STATIC_DIR = Path(__file__).resolve().parent / "static"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    if SEED_INITIAL_DATA:
        with SessionLocal() as db:
            seed_initial_data(db)
    yield


app = FastAPI(title=APP_TITLE, version=APP_VERSION, lifespan=lifespan)


@app.exception_handler(NotFoundError)
async def not_found_handler(_request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


@app.exception_handler(ConflictError)
async def conflict_handler(_request: Request, exc: ConflictError) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


app.include_router(tables.router)
app.include_router(tariffs.router)
app.include_router(dashboard.router)
app.include_router(history.router)
app.include_router(journal.router)


@app.get("/", include_in_schema=False)
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
