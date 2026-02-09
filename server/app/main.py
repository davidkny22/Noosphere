"""FastAPI application — loads SpaceEngine at startup, serves API routes."""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .engine import SpaceEngine
from .routes import router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    space_dir = os.environ.get(
        "NOOSPHERE_SPACE_DIR",
        str(Path(__file__).parent.parent.parent / "web" / "public" / "spaces"),
    )
    model_name = os.environ.get("NOOSPHERE_MODEL", "minilm")
    space_prefix = os.environ.get("NOOSPHERE_SPACE_PREFIX")  # e.g., "minilm-250k"

    logger.info("Loading SpaceEngine: model=%s, prefix=%s, space_dir=%s", model_name, space_prefix, space_dir)
    app.state.engine = SpaceEngine(space_dir=space_dir, model_name=model_name, space_prefix=space_prefix)
    logger.info("SpaceEngine ready — %d points loaded", app.state.engine.num_points)
    yield


app = FastAPI(title="Noosphere API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


def run():
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=True)
