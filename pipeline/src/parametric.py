"""Step 7: Train ParamPaCMAP (parametric HD → 3D) via subprocess.

Runs in a subprocess to avoid torch + numba/FAISS OMP conflicts.
Annoy is mocked out (segfaults on macOS ARM64) and replaced with
sklearn NearestNeighbors — same approach as reduce.py.
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
import sys, types, os, json
import numpy as np

# Mock annoy — segfaults on macOS ARM64
_mock = types.ModuleType("annoy")
_mock.AnnoyIndex = type("AnnoyIndex", (), {"__init__": lambda self, *a, **kw: None})
sys.modules["annoy"] = _mock

# Must set before torch import to avoid OMP conflict with numba
os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

from sklearn.neighbors import NearestNeighbors
import parampacmap.utils.data as pm_data

def _generate_pair_sklearn(X, n_neighbors, n_MN, n_FP, distance="euclidean", verbose=True, random_state=None):
    """sklearn-based neighbor search — drop-in for annoy-based generate_pair."""
    n, dim = X.shape
    n_neighbors_extra = min(n_neighbors + 50, n - 1)
    n_neighbors = min(n_neighbors, n - 1)
    n_FP = min(n_FP, n - 1)
    n_MN = min(n_MN, n - 1)
    metric = "cosine" if distance == "angular" else distance
    nn = NearestNeighbors(n_neighbors=n_neighbors_extra + 1, metric=metric, algorithm="auto", n_jobs=-1)
    nn.fit(X)
    knn_distances, knn_indices = nn.kneighbors(X)
    nbrs = knn_indices[:, 1:].astype(np.int32)
    knn_distances = knn_distances[:, 1:].astype(np.float32)
    sig = np.maximum(np.mean(knn_distances[:, 3:6], axis=1), 1e-10)
    scaled_dist = pm_data.scale_dist(knn_distances, sig, nbrs)
    pair_neighbors = pm_data.sample_neighbors_pair(X, scaled_dist, nbrs, np.int32(n_neighbors))
    option = pm_data.distance_to_option(distance=distance)
    if random_state is None:
        pair_MN = pm_data.sample_MN_pair(X, np.int32(n_MN), np.int32(option))
        pair_FP = pm_data.sample_FP_pair(X, pair_neighbors, n_neighbors, n_FP)
    else:
        pair_MN = pm_data.sample_MN_pair_deterministic(X, np.int32(n_MN), random_state, option)
        pair_FP = pm_data.sample_FP_pair_deterministic(X, pair_neighbors, n_neighbors, np.int32(n_FP), random_state)
    return pair_neighbors, pair_MN, pair_FP, None

pm_data.generate_pair = _generate_pair_sklearn

import torch
from parampacmap import ParamPaCMAP

config = json.loads(sys.stdin.readline())
embeddings = np.load(config["embeddings_path"]).astype(np.float32)

print(f"Training ParamPaCMAP on {embeddings.shape[0]} x {embeddings.shape[1]} embeddings...", file=sys.stderr)

model = ParamPaCMAP(n_components=3)
coords_3d = model.fit_transform(embeddings)

print(f"fit_transform done: {coords_3d.shape}, range [{coords_3d.min():.1f}, {coords_3d.max():.1f}]", file=sys.stderr)

# Verify transform works on new data
test_vec = np.random.randn(1, embeddings.shape[1]).astype(np.float32)
test_coords = model.transform(test_vec)
print(f"transform test: {test_coords.shape}, coords {test_coords[0].tolist()}", file=sys.stderr)

# Save model
torch.save(model, config["model_path"])
np.save(config["coords_path"], coords_3d)

model_size = os.path.getsize(config["model_path"]) / (1024 * 1024)
print(json.dumps({
    "status": "ok",
    "shape": list(coords_3d.shape),
    "coord_range": [float(coords_3d.min()), float(coords_3d.max())],
    "model_size_mb": round(model_size, 2),
}))
'''


def train_parametric(
    embedding: EmbeddingResult,
    output_dir: str | Path,
) -> tuple[Path, np.ndarray]:
    """Train ParamPaCMAP and return (model_path, coords_3d).

    The returned coords_3d are the raw ParamPaCMAP positions (unnormalized).
    These can be compared against PaCMAP positions to verify consistency.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    num_k = len(embedding.terms) // 1000
    prefix = f"{embedding.model_name}-{num_k}k"

    logger.info(
        "Training ParamPaCMAP on %d × %d embeddings (subprocess)...",
        *embedding.embeddings.shape,
    )

    with tempfile.TemporaryDirectory() as tmpdir:
        emb_path = Path(tmpdir) / "embeddings.npy"
        coords_path = Path(tmpdir) / "coords_3d.npy"
        model_path = output_dir / f"{prefix}.parampacmap.pt"

        np.save(emb_path, embedding.embeddings)

        config = json.dumps({
            "embeddings_path": str(emb_path),
            "model_path": str(model_path),
            "coords_path": str(coords_path),
        })

        result = subprocess.run(
            [sys.executable, "-c", _SUBPROCESS_SCRIPT],
            input=config,
            capture_output=True,
            text=True,
            cwd=str(Path(__file__).parent.parent),
        )

        if result.returncode != 0:
            logger.error("ParamPaCMAP subprocess stderr:\n%s", result.stderr)
            raise RuntimeError(
                f"ParamPaCMAP subprocess failed (exit code {result.returncode}).\n"
                f"stderr: {result.stderr[-500:]}"
            )

        if result.stderr:
            for line in result.stderr.strip().split("\n"):
                logger.info("[ParamPaCMAP] %s", line)

        last_line = result.stdout.strip().split("\n")[-1]
        status = json.loads(last_line)
        if status.get("status") != "ok":
            raise RuntimeError(f"ParamPaCMAP subprocess returned unexpected status: {status}")

        coords_3d = np.load(coords_path)

    logger.info(
        "ParamPaCMAP trained: coord range [%.1f, %.1f], model %.1f MB → %s",
        status["coord_range"][0],
        status["coord_range"][1],
        status["model_size_mb"],
        model_path,
    )

    return model_path, coords_3d
