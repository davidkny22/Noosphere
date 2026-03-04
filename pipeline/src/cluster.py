from __future__ import annotations

import logging

import numpy as np
from openai import OpenAI
from sklearn.cluster import HDBSCAN

from .types import ClusterInfo, ClusterResult, EmbeddingResult, ReductionResult

logger = logging.getLogger(__name__)


def generate_cluster_label(representative_terms: list[str], client: OpenAI | None) -> str:
    """Generate a concise cluster label using LLM, with medoid fallback."""
    if not client:
        return representative_terms[0]

    try:
        response = client.responses.create(
            model="gpt-5-nano",
            reasoning={"effort": "medium"},
            input=f"Create a concise 1-3 word category label for a 3D visualization cluster containing these related terms: {', '.join(representative_terms[:10])}. Reply with ONLY the label, nothing else.",
        )
        label = response.output_text.strip()
        if label:
            return label
    except Exception as e:
        logger.warning("LLM label generation failed: %s — using medoid fallback", e)

    return representative_terms[0]


def cluster_points(
    embedding: EmbeddingResult,
    reduction: ReductionResult,
    min_cluster_size: int = 30,
    min_samples: int = 5,
    label_client: OpenAI | None = None,
) -> ClusterResult:
    params = {
        "min_cluster_size": min_cluster_size,
        "min_samples": min_samples,
        "metric": "euclidean",
    }

    # Cluster on 3D positions rather than HD embeddings. Rationale:
    # 1. HDBSCAN struggles with high-dimensional data (curse of dimensionality)
    # 2. For a 3D visualization, clusters need to be *visually* coherent
    # 3. PaCMAP's 3D layout preserves semantic structure, so 3D clusters are
    #    semantically meaningful AND visually grouped
    logger.info(
        "Clustering %d points with HDBSCAN on 3D positions (min_cluster_size=%d)...",
        len(embedding.terms),
        min_cluster_size,
    )

    clusterer = HDBSCAN(
        min_cluster_size=min_cluster_size,
        min_samples=min_samples,
        metric="euclidean",
    )
    labels = clusterer.fit_predict(reduction.positions_3d)

    # Build cluster metadata
    unique_labels = sorted(set(labels))
    unique_labels = [lbl for lbl in unique_labels if lbl != -1]
    noise_count = int(np.sum(labels == -1))

    clusters: list[ClusterInfo] = []
    for cluster_id in unique_labels:
        mask = labels == cluster_id
        indices = np.where(mask)[0]
        cluster_terms = [embedding.terms[i] for i in indices]
        cluster_embeddings = embedding.embeddings[indices]
        cluster_positions = reduction.positions_3d[indices]

        # HD centroid for medoid labeling (use full embeddings for semantic accuracy)
        centroid_hd = cluster_embeddings.mean(axis=0)
        distances = np.linalg.norm(cluster_embeddings - centroid_hd, axis=1)

        # Top-5 most central terms
        top5_local = np.argsort(distances)[:5]
        representative_terms = [cluster_terms[int(i)] for i in top5_local]

        # Cluster label: LLM-generated or medoid fallback
        label = generate_cluster_label(representative_terms, label_client)

        # 3D centroid for label positioning
        centroid_3d = cluster_positions.mean(axis=0).tolist()

        clusters.append(
            ClusterInfo(
                id=int(cluster_id),
                label=label,
                representative_terms=representative_terms,
                size=int(mask.sum()),
                centroid_3d=centroid_3d,
            )
        )

    logger.info(
        "Found %d clusters, %d noise points (%.1f%%)",
        len(clusters),
        noise_count,
        noise_count / len(labels) * 100,
    )

    return ClusterResult(
        labels=labels,
        clusters=clusters,
        noise_count=noise_count,
        hdbscan_params=params,
    )
