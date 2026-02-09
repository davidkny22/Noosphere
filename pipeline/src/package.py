from __future__ import annotations

import gzip
import json
import logging
from pathlib import Path

import numpy as np
from pydantic import BaseModel

from .types import ClusterResult, EmbeddingResult, ReductionResult

logger = logging.getLogger(__name__)


class PointSchema(BaseModel):
    term: str
    pos: list[float]
    cluster: int


class ClusterSchema(BaseModel):
    id: int
    label: str
    representative_terms: list[str]
    size: int
    centroid: list[float]


class SpaceManifest(BaseModel):
    version: int = 1
    model: str
    model_full: str
    embedding_dim: int
    num_points: int
    num_clusters: int
    pacmap_params: dict
    hdbscan_params: dict
    points: list[PointSchema]
    clusters: list[ClusterSchema]


def _validate(manifest: SpaceManifest) -> None:
    assert manifest.num_points == len(manifest.points), (
        f"num_points ({manifest.num_points}) != len(points) ({len(manifest.points)})"
    )
    assert manifest.num_clusters == len(manifest.clusters), (
        f"num_clusters ({manifest.num_clusters}) != len(clusters) ({len(manifest.clusters)})"
    )

    valid_cluster_ids = {c.id for c in manifest.clusters} | {-1}
    for i, p in enumerate(manifest.points):
        assert len(p.pos) == 3, f"Point {i} ({p.term}) has {len(p.pos)} coords, expected 3"
        assert all(np.isfinite(v) for v in p.pos), (
            f"Point {i} ({p.term}) has non-finite coordinates: {p.pos}"
        )
        assert p.cluster in valid_cluster_ids, (
            f"Point {i} ({p.term}) has invalid cluster {p.cluster}"
        )


def package_space(
    embedding: EmbeddingResult,
    reduction: ReductionResult,
    cluster: ClusterResult,
    output_dir: str | Path,
    compress: bool = True,
) -> str:
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    points = []
    for i, term in enumerate(embedding.terms):
        pos = [round(float(reduction.positions_3d[i, j]), 3) for j in range(3)]
        points.append(PointSchema(term=term, pos=pos, cluster=int(cluster.labels[i])))

    clusters = [
        ClusterSchema(
            id=c.id,
            label=c.label,
            representative_terms=c.representative_terms,
            size=c.size,
            centroid=[round(v, 3) for v in c.centroid_3d],
        )
        for c in cluster.clusters
    ]

    manifest = SpaceManifest(
        model=embedding.model_name,
        model_full=embedding.model_id,
        embedding_dim=embedding.embedding_dim,
        num_points=len(points),
        num_clusters=len(clusters),
        pacmap_params=reduction.pacmap_params,
        hdbscan_params=cluster.hdbscan_params,
        points=points,
        clusters=clusters,
    )

    # Validate before writing
    _validate(manifest)

    # Write
    num_k = len(points) // 1000
    filename = f"{embedding.model_name}-{num_k}k.json"
    if compress:
        filename += ".gz"

    filepath = output_dir / filename
    data = manifest.model_dump_json()

    if compress:
        with gzip.open(filepath, "wt", encoding="utf-8") as f:
            f.write(data)
    else:
        with open(filepath, "w") as f:
            f.write(data)

    size_kb = filepath.stat().st_size / 1024
    logger.info("Wrote space to %s (%.0f KB)", filepath, size_kb)

    # Save vocab mapping: term -> embedding index (for later filtering/FAISS rebuilds)
    vocab_path = output_dir / f"{embedding.model_name}-{num_k}k-vocab.json.gz"
    vocab_map = {term: i for i, term in enumerate(embedding.terms)}
    with gzip.open(vocab_path, "wt", encoding="utf-8") as f:
        json.dump(vocab_map, f, separators=(",", ":"))
    logger.info("Wrote vocab mapping to %s (%d terms)", vocab_path, len(vocab_map))

    return str(filepath)
