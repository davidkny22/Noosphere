from __future__ import annotations

import json
import logging
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

from .types import EmbeddingResult, ReductionResult

logger = logging.getLogger(__name__)

# PaCMAP uses numba JIT. When torch is loaded in the same process,
# their OpenMP runtimes conflict and cause segfaults on macOS ARM64.
# The fix: run PaCMAP in a subprocess where torch is never imported.

_SUBPROCESS_SCRIPT = '''
import sys, types, os, json

# Mock annoy — it segfaults on macOS ARM64 + Python 3.13
_mock = types.ModuleType("annoy")
_mock.AnnoyIndex = type("AnnoyIndex", (), {"__init__": lambda self, *a, **kw: None})
sys.modules["annoy"] = _mock

import numpy as np
import pacmap
import pacmap.pacmap as pacmap_internal
from sklearn.neighbors import NearestNeighbors

def _generate_pair_sklearn(X, n_neighbors, n_MN, n_FP, distance="euclidean", verbose=True):
    """sklearn-based neighbor search — drop-in replacement for annoy-based generate_pair."""
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
    pacmap_internal.print_verbose("Found nearest neighbors (sklearn)", verbose)
    sig = np.maximum(np.mean(knn_distances[:, 3:6], axis=1), 1e-10)
    pacmap_internal.print_verbose("Calculated sigma", verbose)
    scaled_dist = pacmap_internal.scale_dist(knn_distances, sig, nbrs)
    pacmap_internal.print_verbose("Found scaled dist", verbose)
    pair_neighbors = pacmap_internal.sample_neighbors_pair(X, scaled_dist, nbrs, n_neighbors)
    option = pacmap_internal.distance_to_option(distance=distance)
    if pacmap_internal._RANDOM_STATE is None:
        pair_MN = pacmap_internal.sample_MN_pair(X, n_MN, option)
        pair_FP = pacmap_internal.sample_FP_pair(X, pair_neighbors, n_neighbors, n_FP)
    else:
        pair_MN = pacmap_internal.sample_MN_pair_deterministic(X, n_MN, pacmap_internal._RANDOM_STATE, option)
        pair_FP = pacmap_internal.sample_FP_pair_deterministic(X, pair_neighbors, n_neighbors, n_FP, pacmap_internal._RANDOM_STATE)
    return pair_neighbors, pair_MN, pair_FP, None

pacmap_internal.generate_pair = _generate_pair_sklearn

# Read config from stdin
config = json.loads(sys.stdin.readline())
embeddings = np.load(config["embeddings_path"]).astype(np.float64)

reducer = pacmap.PaCMAP(
    n_components=3,
    n_neighbors=config["n_neighbors"],
    MN_ratio=config["mn_ratio"],
    FP_ratio=config["fp_ratio"],
    verbose=True,
)
positions_3d = reducer.fit_transform(embeddings)
np.save(config["output_path"], positions_3d)
print(json.dumps({"status": "ok", "shape": list(positions_3d.shape)}))
'''


def reduce_to_3d(
    embedding: EmbeddingResult,
    n_neighbors: int = 15,
    mn_ratio: float = 0.5,
    fp_ratio: float = 2.0,
    cache_dir: Path | None = None,
) -> ReductionResult:
    params = {
        "n_neighbors": n_neighbors,
        "MN_ratio": mn_ratio,
        "FP_ratio": fp_ratio,
        "n_components": 3,
    }

    logger.info(
        "Reducing %d x %d embeddings to 3D with PaCMAP (n_neighbors=%d, MN_ratio=%.1f, FP_ratio=%.1f)...",
        *embedding.embeddings.shape,
        n_neighbors,
        mn_ratio,
        fp_ratio,
    )

    # Save embeddings to temp file for subprocess
    with tempfile.TemporaryDirectory() as tmpdir:
        emb_path = Path(tmpdir) / "embeddings.npy"
        out_path = Path(tmpdir) / "positions_3d.npy"
        np.save(emb_path, embedding.embeddings)

        config = json.dumps({
            "embeddings_path": str(emb_path),
            "output_path": str(out_path),
            "n_neighbors": n_neighbors,
            "mn_ratio": mn_ratio,
            "fp_ratio": fp_ratio,
        })

        # Run PaCMAP in a subprocess (avoids torch + numba OMP conflict)
        logger.info("Running PaCMAP in subprocess (avoids torch/numba OMP conflict)...")
        result = subprocess.run(
            [sys.executable, "-c", _SUBPROCESS_SCRIPT],
            input=config,
            capture_output=True,
            text=True,
            cwd=str(Path(__file__).parent.parent),
        )

        if result.returncode != 0:
            logger.error("PaCMAP subprocess stderr:\n%s", result.stderr)
            raise RuntimeError(
                f"PaCMAP subprocess failed (exit code {result.returncode}).\n"
                f"stderr: {result.stderr[-500:]}"
            )

        # Log subprocess output (PaCMAP's verbose progress)
        if result.stderr:
            for line in result.stderr.strip().split("\n"):
                logger.info("[PaCMAP] %s", line)

        # Parse result
        last_line = result.stdout.strip().split("\n")[-1]
        status = json.loads(last_line)
        if status.get("status") != "ok":
            raise RuntimeError(f"PaCMAP subprocess returned unexpected status: {status}")

        positions_3d = np.load(out_path)

    if np.isnan(positions_3d).any():
        raise RuntimeError("PaCMAP produced NaN values. Check embeddings for issues.")

    if np.std(positions_3d) < 1e-6:
        raise RuntimeError(
            "PaCMAP produced collapsed output (near-zero variance). "
            "Try different parameters."
        )

    # Normalize: center at origin, scale so 95th percentile maps to 50.0
    positions_3d -= positions_3d.mean(axis=0)
    p95 = np.percentile(np.abs(positions_3d), 95)

    if p95 < 1e-10:
        raise RuntimeError(
            "PaCMAP output has near-zero spread (95th percentile ~ 0). "
            "All points collapsed to the origin."
        )

    outlier_mask = np.any(np.abs(positions_3d) > p95, axis=1)
    outlier_indices = np.where(outlier_mask)[0].tolist()

    positions_3d = positions_3d / p95 * 50.0

    coord_min = float(positions_3d.min())
    coord_max = float(positions_3d.max())

    logger.info(
        "3D reduction complete: coordinate range [%.1f, %.1f], %d outlier points beyond +/-50",
        coord_min,
        coord_max,
        len(outlier_indices),
    )

    return ReductionResult(
        positions_3d=positions_3d,
        pacmap_params=params,
        coordinate_range=(coord_min, coord_max),
        outlier_indices=outlier_indices,
    )
