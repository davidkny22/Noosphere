#!/usr/bin/env python3
"""Rebuild a FAISS index for an existing space using cached embeddings.

Usage:
    uv run rebuild_faiss.py --space ../web/public/spaces/minilm-150k.json.gz \
                            --embeddings-cache data/cache
"""
from __future__ import annotations

import gzip
import json
import logging
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import click
import numpy as np

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

_FAISS_SCRIPT = '''
import sys, json, numpy as np
embeddings = np.load(sys.argv[1]).astype(np.float32)
import faiss
faiss.normalize_L2(embeddings)
index = faiss.IndexFlatIP(int(sys.argv[3]))
batch_size = 10_000
for start in range(0, len(embeddings), batch_size):
    end = min(start + batch_size, len(embeddings))
    index.add(embeddings[start:end])
    print(f"  Added {end}/{len(embeddings)} vectors", flush=True)
D, I = index.search(embeddings[:1], 1)
assert I[0, 0] == 0, f"Self-search sanity failed: {I[0,0]}"
faiss.write_index(index, sys.argv[2])
with open(sys.argv[4], "w") as f:
    json.dump({"status": "ok", "ntotal": int(index.ntotal)}, f)
'''


@click.command()
@click.option("--space", required=True, type=click.Path(exists=True),
              help="Space JSON (.json.gz) to build FAISS for")
@click.option("--embeddings-cache", required=True, type=click.Path(exists=True),
              help="Cache dir containing {model}_{size}_embeddings.npy")
@click.option("--output", type=click.Path(), default=None,
              help="Output FAISS path (default: same dir as space, .faiss extension)")
def main(space: str, embeddings_cache: str, output: str | None):
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

    # Extract embeddings for space terms
    indices = []
    missing = []
    for term in terms:
        idx = term_to_idx.get(term)
        if idx is not None:
            indices.append(idx)
        else:
            missing.append(term)

    if missing:
        logger.warning("%d terms not found in embeddings (first 5: %s)", len(missing), missing[:5])

    space_embeddings = all_embeddings[indices].astype(np.float32)
    logger.info("  Extracted %d embeddings", len(space_embeddings))

    # Build FAISS in subprocess
    faiss_path = output or space.replace(".json.gz", ".faiss")

    with tempfile.NamedTemporaryFile(suffix=".npy", delete=False) as tmp:
        np.save(tmp.name, space_embeddings)
        tmp_path = tmp.name

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        status_path = tmp.name

    logger.info("Building FAISS in subprocess (%d vectors × %d dims)...", len(space_embeddings), dim)
    result = subprocess.run(
        [sys.executable, "-c", _FAISS_SCRIPT, tmp_path, faiss_path, str(dim), status_path],
        capture_output=True, text=True,
        env={**os.environ, "OMP_NUM_THREADS": "1"},
    )

    os.unlink(tmp_path)

    if result.stdout:
        for line in result.stdout.strip().split("\n"):
            logger.info(line)

    if result.returncode != 0:
        logger.error("FAISS subprocess failed:\n%s", result.stderr)
        sys.exit(1)

    status = json.loads(Path(status_path).read_text())
    os.unlink(status_path)

    size_mb = Path(faiss_path).stat().st_size / (1024 * 1024)
    logger.info("Done! FAISS index: %d vectors, %.0f MB → %s", status["ntotal"], size_mb, faiss_path)


if __name__ == "__main__":
    main()
