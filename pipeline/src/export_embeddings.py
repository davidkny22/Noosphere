"""Step 8: Export HD embeddings as Float32 binary + JSON metadata sidecar."""
from __future__ import annotations

import json
import logging
from pathlib import Path

import numpy as np

from .types import EmbeddingResult

logger = logging.getLogger(__name__)


def export_embeddings(
    embedding: EmbeddingResult,
    output_dir: str | Path,
) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    num_k = len(embedding.terms) // 1000
    prefix = f"{embedding.model_name}-{num_k}k"

    # Save raw embeddings as Float32 binary (no header — just N*D floats)
    bin_path = output_dir / f"{prefix}-embeddings.bin"
    embeddings_f32 = embedding.embeddings.astype(np.float32)
    embeddings_f32.tofile(bin_path)

    # Save metadata sidecar
    meta_path = output_dir / f"{prefix}-embeddings.json"
    meta = {
        "model": embedding.model_name,
        "model_full": embedding.model_id,
        "num_points": len(embedding.terms),
        "embedding_dim": embedding.embedding_dim,
        "dtype": "float32",
        "byte_order": "little",
        "file": bin_path.name,
    }
    meta_path.write_text(json.dumps(meta, indent=2))

    size_mb = bin_path.stat().st_size / (1024 * 1024)
    logger.info(
        "Exported HD embeddings: %d × %d → %s (%.1f MB)",
        len(embedding.terms),
        embedding.embedding_dim,
        bin_path,
        size_mb,
    )
    return bin_path
