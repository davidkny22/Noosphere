"""Step 6: Build FAISS cosine-similarity index from L2-normalized embeddings."""
from __future__ import annotations

import logging
from pathlib import Path

import faiss
import numpy as np

from .types import EmbeddingResult

logger = logging.getLogger(__name__)


def build_faiss_index(
    embedding: EmbeddingResult,
    output_dir: str | Path,
) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    embeddings = embedding.embeddings.astype(np.float32).copy()
    faiss.normalize_L2(embeddings)

    index = faiss.IndexFlatIP(embedding.embedding_dim)
    index.add(embeddings)

    # Sanity check: query first vector, should return itself as top-1
    D, I = index.search(embeddings[:1], 1)
    assert I[0, 0] == 0, f"Self-query failed: top-1 index is {I[0, 0]}, expected 0"

    num_k = len(embedding.terms) // 1000
    filename = f"{embedding.model_name}-{num_k}k.faiss"
    filepath = output_dir / filename
    faiss.write_index(index, str(filepath))

    size_kb = filepath.stat().st_size / 1024
    logger.info(
        "FAISS index: %d vectors × %d dims, saved to %s (%.0f KB)",
        index.ntotal,
        embedding.embedding_dim,
        filepath,
        size_kb,
    )
    return filepath
