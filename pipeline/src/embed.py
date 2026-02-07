from __future__ import annotations

import logging
from pathlib import Path

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from .types import EmbeddingResult, VocabularyResult

logger = logging.getLogger(__name__)

MODEL_MAP = {
    "minilm": "sentence-transformers/all-MiniLM-L6-v2",
    "qwen3": "Qwen/Qwen3-Embedding-0.6B",
}


def detect_device(requested: str = "auto") -> str:
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def _cache_path(cache_dir: Path, model_name: str, num_terms: int) -> Path:
    return cache_dir / f"{model_name}_{num_terms}_embeddings.npy"


def embed_vocabulary(
    vocab: VocabularyResult,
    model_name: str = "minilm",
    device: str = "auto",
    batch_size: int = 512,
    cache_dir: Path | None = None,
) -> EmbeddingResult:
    model_id = MODEL_MAP[model_name]
    device = detect_device(device)
    logger.info("Using device: %s", device)

    # Check cache
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = _cache_path(cache_dir, model_name, len(vocab.terms))
        if cache_file.exists():
            logger.info("Loading cached embeddings from %s", cache_file)
            embeddings = np.load(cache_file)
            if embeddings.shape[0] == len(vocab.terms):
                return EmbeddingResult(
                    terms=vocab.terms,
                    embeddings=embeddings,
                    model_name=model_name,
                    model_id=model_id,
                    embedding_dim=embeddings.shape[1],
                    device_used=device,
                )
            else:
                logger.warning(
                    "Cache shape mismatch (%d vs %d terms) — re-embedding",
                    embeddings.shape[0],
                    len(vocab.terms),
                )

    # Load model
    logger.info("Loading model %s (%s)...", model_name, model_id)
    try:
        model = SentenceTransformer(model_id, device=device)
    except RuntimeError as e:
        if device == "mps":
            logger.warning("MPS failed (%s), falling back to CPU", e)
            device = "cpu"
            model = SentenceTransformer(model_id, device=device)
        else:
            raise

    # Encode
    logger.info(
        "Embedding %d terms with %s on %s (batch_size=%d)...",
        len(vocab.terms),
        model_name,
        device,
        batch_size,
    )
    try:
        embeddings = model.encode(
            vocab.terms,
            batch_size=batch_size,
            show_progress_bar=True,
            normalize_embeddings=True,
        )
    except (RuntimeError, OSError) as e:
        if device == "mps":
            logger.warning("MPS encoding failed (%s), retrying on CPU", e)
            device = "cpu"
            model = SentenceTransformer(model_id, device=device)
            embeddings = model.encode(
                vocab.terms,
                batch_size=batch_size,
                show_progress_bar=True,
                normalize_embeddings=True,
            )
        else:
            raise

    embedding_dim = embeddings.shape[1]
    assert embeddings.shape == (
        len(vocab.terms),
        embedding_dim,
    ), f"Shape mismatch: {embeddings.shape} vs ({len(vocab.terms)}, {embedding_dim})"

    logger.info(
        "Embedded %d terms → %d dimensions on %s",
        len(vocab.terms),
        embedding_dim,
        device,
    )

    # Save cache
    if cache_dir is not None:
        cache_file = _cache_path(cache_dir, model_name, len(vocab.terms))
        np.save(cache_file, embeddings)
        logger.info("Saved embedding cache to %s", cache_file)

    return EmbeddingResult(
        terms=vocab.terms,
        embeddings=embeddings,
        model_name=model_name,
        model_id=model_id,
        embedding_dim=embedding_dim,
        device_used=device,
    )
