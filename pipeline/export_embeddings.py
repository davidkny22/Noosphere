#!/usr/bin/env python3
"""Export HD embeddings for any space as .bin + .json (for browser local service).

Extracts embeddings from the cached embedding matrix in the same order as the
space's points array, producing files compatible with localEmbeddingService.ts.

Usage:
    uv run export_embeddings.py --space ../web/public/spaces/minilm-150k.json.gz \
                                 --embeddings-cache data/cache
"""
from __future__ import annotations

import gzip
import json
import logging
import sys
from pathlib import Path

import click
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@click.command()
@click.option("--space", required=True, type=click.Path(exists=True),
              help="Space JSON (.json.gz) to export embeddings for")
@click.option("--embeddings-cache", required=True, type=click.Path(exists=True),
              help="Cache dir containing {model}_{size}_embeddings.npy")
@click.option("--output-dir", type=click.Path(), default=None,
              help="Output directory (default: same dir as space)")
def main(space: str, embeddings_cache: str, output_dir: str | None):
    # Load space
    logger.info("Loading space %s...", space)
    with gzip.open(space, "rt") as f:
        data = json.load(f)

    model = data["model"]
    dim = data["embedding_dim"]
    terms = [p["term"] for p in data["points"]]
    logger.info("  %d points, model=%s, dim=%d", len(terms), model, dim)

    # Find embeddings cache
    cache_path = Path(embeddings_cache)
    candidates = sorted(cache_path.glob(f"{model}_*_embeddings.npy"), reverse=True)
    if not candidates:
        logger.error("No embeddings cache found in %s for model %s", cache_path, model)
        sys.exit(1)

    emb_file = candidates[0]
    logger.info("Loading embeddings from %s...", emb_file)
    all_embeddings = np.load(str(emb_file))
    logger.info("  Shape: %s", all_embeddings.shape)

    # Reconstruct vocab to map terms to embedding indices
    logger.info("Reconstructing vocab for index mapping...")
    from src.vocab import assemble_vocabulary
    vocab = assemble_vocabulary(target_size=all_embeddings.shape[0], data_dir=Path("data"))
    term_to_idx = {t: i for i, t in enumerate(vocab.terms)}

    # Extract embeddings for space terms — strict mode, no missing allowed
    indices = []
    missing = []
    for term in terms:
        idx = term_to_idx.get(term)
        if idx is not None:
            indices.append(idx)
        else:
            missing.append(term)

    if missing:
        logger.error(
            "%d terms not found in embedding cache! First 10: %s",
            len(missing), missing[:10],
        )
        logger.error("This means vocab reconstruction doesn't match the original build.")
        sys.exit(1)

    space_embeddings = all_embeddings[indices].astype(np.float32)
    assert space_embeddings.shape == (len(terms), dim), (
        f"Shape mismatch: expected ({len(terms)}, {dim}), got {space_embeddings.shape}"
    )
    logger.info("  Extracted %d embeddings (%d dims)", len(space_embeddings), dim)

    # Determine output paths
    space_path = Path(space)
    out_dir = Path(output_dir) if output_dir else space_path.parent
    prefix = space_path.name.replace(".json.gz", "")

    bin_path = out_dir / f"{prefix}-embeddings.bin"
    meta_path = out_dir / f"{prefix}-embeddings.json"

    # Save binary (raw float32, same format as localEmbeddingService expects)
    space_embeddings.tofile(str(bin_path))
    size_mb = bin_path.stat().st_size / (1024 * 1024)
    logger.info("Wrote %s (%.0f MB)", bin_path, size_mb)

    # Save metadata JSON (matches format from package.py)
    meta = {
        "model": model,
        "model_full": data.get("model_full", model),
        "num_points": len(terms),
        "embedding_dim": dim,
        "dtype": "float32",
        "byte_order": "little",
        "file": f"{prefix}-embeddings.bin",
    }
    meta_path.write_text(json.dumps(meta, indent=2))
    logger.info("Wrote %s", meta_path)

    logger.info("Done! %d vectors × %d dims exported.", len(terms), dim)


if __name__ == "__main__":
    main()
