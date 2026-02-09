"""Step 6: Build FAISS cosine-similarity index from L2-normalized embeddings.

Runs in a subprocess to avoid torch + FAISS OMP conflicts on macOS ARM64.
"""
from __future__ import annotations

import json
import logging
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from .types import EmbeddingResult

logger = logging.getLogger(__name__)

_SUBPROCESS_SCRIPT = '''
import sys, json, numpy as np

embeddings_path = sys.argv[1]
output_path = sys.argv[2]
dim = int(sys.argv[3])
status_path = sys.argv[4]
batch_size = 10_000

embeddings = np.load(embeddings_path).astype(np.float32)
n = len(embeddings)

import faiss
faiss.normalize_L2(embeddings)

index = faiss.IndexFlatIP(dim)
for start in range(0, n, batch_size):
    end = min(start + batch_size, n)
    index.add(embeddings[start:end])
    print(f"  FAISS: added {end} / {n} vectors", flush=True)

# Sanity check
D, I = index.search(embeddings[:1], 1)
assert I[0, 0] == 0, f"Self-query failed: top-1 index is {I[0, 0]}, expected 0"

faiss.write_index(index, output_path)
size_kb = int(open(output_path, "rb").seek(0, 2)) // 1024

with open(status_path, "w") as f:
    json.dump({"status": "ok", "ntotal": int(index.ntotal), "size_kb": size_kb}, f)
'''


def build_faiss_index(
    embedding: EmbeddingResult,
    output_dir: str | Path,
) -> Path:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    num_k = len(embedding.terms) // 1000
    filename = f"{embedding.model_name}-{num_k}k.faiss"
    filepath = output_dir / filename

    with tempfile.TemporaryDirectory() as tmpdir:
        emb_path = Path(tmpdir) / "embeddings.npy"
        status_path = Path(tmpdir) / "status.json"

        np.save(emb_path, embedding.embeddings)

        logger.info(
            "Running FAISS indexing in subprocess (%d vectors × %d dims)...",
            len(embedding.terms),
            embedding.embedding_dim,
        )

        result = subprocess.run(
            [sys.executable, "-c", _SUBPROCESS_SCRIPT,
             str(emb_path), str(filepath), str(embedding.embedding_dim), str(status_path)],
            capture_output=True,
            text=True,
        )

        if result.stdout:
            for line in result.stdout.strip().split("\n"):
                logger.info(line)

        if result.returncode != 0:
            logger.error("FAISS subprocess stderr:\n%s", result.stderr)
            raise RuntimeError(
                f"FAISS subprocess failed (exit code {result.returncode}).\n"
                f"stderr: {result.stderr[-500:]}"
            )

        status = json.loads(status_path.read_text())
        if status["status"] != "ok":
            raise RuntimeError(f"FAISS subprocess returned unexpected status: {status}")

        logger.info(
            "FAISS index: %d vectors × %d dims, saved to %s",
            status["ntotal"],
            embedding.embedding_dim,
            filepath,
        )

    return filepath
