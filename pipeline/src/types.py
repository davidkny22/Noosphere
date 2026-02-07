from __future__ import annotations

from dataclasses import dataclass, field
import numpy as np


@dataclass
class VocabularyResult:
    """Output of Step 1: Vocabulary assembly."""

    terms: list[str]
    source_counts: dict[str, int]


@dataclass
class EmbeddingResult:
    """Output of Step 2: Bulk embedding."""

    terms: list[str]
    embeddings: np.ndarray  # (N, D)
    model_name: str  # "minilm" or "qwen3"
    model_id: str  # full HuggingFace model ID
    embedding_dim: int  # 384 for MiniLM, 1024 for Qwen3
    device_used: str  # "cuda", "mps", or "cpu"


@dataclass
class ReductionResult:
    """Output of Step 3: PaCMAP 3D reduction."""

    positions_3d: np.ndarray  # (N, 3), normalized to ~[-50, 50]
    pacmap_params: dict
    coordinate_range: tuple[float, float]  # actual min/max after normalization
    outlier_indices: list[int]  # indices beyond 95th percentile before scaling


@dataclass
class ClusterInfo:
    """Metadata for a single cluster."""

    id: int
    label: str  # medoid term
    representative_terms: list[str]  # top-5 closest to centroid
    size: int
    centroid_3d: list[float]  # [x, y, z]


@dataclass
class ClusterResult:
    """Output of Step 4: HDBSCAN clustering."""

    labels: np.ndarray  # (N,), cluster IDs, -1 = noise
    clusters: list[ClusterInfo]
    noise_count: int
    hdbscan_params: dict
