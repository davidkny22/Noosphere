"""FastAPI application — loads all space engines at startup, serves API routes."""
from __future__ import annotations

import logging
import os
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sentence_transformers import SentenceTransformer

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
    space_dir = Path(os.environ.get(
        "NOOSPHERE_SPACE_DIR",
        str(Path(__file__).parent.parent.parent / "web" / "public" / "spaces"),
    ))

    # Discover all spaces by scanning for .faiss files
    faiss_files = sorted(space_dir.glob("*.faiss"))
    if not faiss_files:
        raise RuntimeError(f"No .faiss files found in {space_dir}")

    # Group prefixes by model name (e.g., "minilm-10k" → "minilm")
    prefixes_by_model: dict[str, list[str]] = defaultdict(list)
    for f in faiss_files:
        prefix = f.stem  # e.g., "minilm-10k"
        model_name = prefix.split("-")[0]  # e.g., "minilm"
        prefixes_by_model[model_name].append(prefix)

    logger.info("Discovered spaces: %s", dict(prefixes_by_model))

    # Load one encoder per model, shared across spaces
    encoders: dict[str, SentenceTransformer] = {}
    for model_name in prefixes_by_model:
        model_id = SpaceEngine.MODEL_MAP.get(model_name)
        if not model_id:
            logger.warning("Unknown model '%s' — skipping spaces: %s", model_name, prefixes_by_model[model_name])
            continue
        logger.info("Loading encoder for %s: %s", model_name, model_id)
        encoders[model_name] = SentenceTransformer(model_id)

    # Create a SpaceEngine for each discovered space
    engines: dict[str, SpaceEngine] = {}
    for model_name, prefixes in prefixes_by_model.items():
        if model_name not in encoders:
            continue
        for prefix in prefixes:
            try:
                engines[prefix] = SpaceEngine(
                    space_dir=space_dir,
                    prefix=prefix,
                    encoder=encoders[model_name],
                    model_name=model_name,
                )
                logger.info("Engine ready: %s (%d points)", prefix, engines[prefix].num_points)
            except Exception as e:
                logger.error("Failed to load space %s: %s", prefix, e)

    if not engines:
        raise RuntimeError("No space engines loaded successfully")

    app.state.engines = engines
    logger.info("All engines ready: %s", list(engines.keys()))
    yield


app = FastAPI(title="Noosphere API", lifespan=lifespan)

cors_origins = os.environ.get(
    "CORS_ORIGINS",
    "http://localhost:5173,http://localhost:5174,http://localhost:5175,"
    "http://127.0.0.1:5173,http://127.0.0.1:5174,http://127.0.0.1:5175",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in cors_origins],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(router)


def run():
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    reload = os.environ.get("RELOAD", "false").lower() == "true"
    uvicorn.run("app.main:app", host="0.0.0.0", port=port, reload=reload)
