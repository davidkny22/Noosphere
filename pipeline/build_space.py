#!/usr/bin/env python3
"""Build a 3D embedding space from vocabulary.

Usage:
    uv run build_space.py --model minilm --vocab-size 10000
    uv run build_space.py --model qwen3  --vocab-size 10000 --device mps
"""
from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

import click

from src.cluster import cluster_points
from src.embed import embed_vocabulary
from src.package import package_space
from src.reduce import reduce_to_3d
from src.vocab import assemble_vocabulary

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

PIPELINE_DIR = Path(__file__).parent


@click.command()
@click.option(
    "--model",
    type=click.Choice(["minilm", "qwen3"]),
    required=True,
    help="Embedding model to use.",
)
@click.option(
    "--vocab-size",
    type=int,
    default=10000,
    show_default=True,
    help="Target vocabulary size.",
)
@click.option(
    "--output",
    type=click.Path(),
    default=str(PIPELINE_DIR.parent / "web" / "public" / "spaces"),
    show_default=True,
    help="Output directory for space JSON.",
)
@click.option(
    "--device",
    type=click.Choice(["auto", "cuda", "mps", "cpu"]),
    default="auto",
    show_default=True,
    help="Compute device for embedding.",
)
@click.option(
    "--batch-size",
    type=int,
    default=512,
    show_default=True,
    help="Embedding batch size.",
)
@click.option(
    "--pacmap-neighbors",
    type=int,
    default=15,
    show_default=True,
    help="PaCMAP n_neighbors (5-50). Higher preserves more global structure.",
)
@click.option(
    "--pacmap-mn-ratio",
    type=float,
    default=0.5,
    show_default=True,
    help="PaCMAP MN_ratio.",
)
@click.option(
    "--pacmap-fp-ratio",
    type=float,
    default=2.0,
    show_default=True,
    help="PaCMAP FP_ratio.",
)
@click.option(
    "--hdbscan-min-cluster",
    type=int,
    default=20,
    show_default=True,
    help="HDBSCAN min_cluster_size.",
)
@click.option(
    "--compress/--no-compress",
    default=True,
    show_default=True,
    help="Gzip the output JSON.",
)
@click.option(
    "--cache-dir",
    type=click.Path(),
    default=str(PIPELINE_DIR / "data" / "cache"),
    show_default=True,
    help="Directory for embedding cache.",
)
def main(
    model: str,
    vocab_size: int,
    output: str,
    device: str,
    batch_size: int,
    pacmap_neighbors: int,
    pacmap_mn_ratio: float,
    pacmap_fp_ratio: float,
    hdbscan_min_cluster: int,
    compress: bool,
    cache_dir: str,
) -> None:
    total_start = time.time()
    data_dir = PIPELINE_DIR / "data"

    # Step 1: Vocabulary
    logger.info("=" * 60)
    logger.info("Step 1/5: Assembling vocabulary (target: %d terms)", vocab_size)
    logger.info("=" * 60)
    t0 = time.time()
    vocab = assemble_vocabulary(target_size=vocab_size, data_dir=data_dir)
    logger.info("Step 1/5 done (%.1fs) — %d terms", time.time() - t0, len(vocab.terms))

    # Step 2: Embedding
    logger.info("=" * 60)
    logger.info("Step 2/5: Embedding %d terms with %s", len(vocab.terms), model)
    logger.info("=" * 60)
    t0 = time.time()
    embedding = embed_vocabulary(
        vocab=vocab,
        model_name=model,
        device=device,
        batch_size=batch_size,
        cache_dir=Path(cache_dir),
    )
    logger.info(
        "Step 2/5 done (%.1fs) — %d × %d on %s",
        time.time() - t0,
        *embedding.embeddings.shape,
        embedding.device_used,
    )

    # Step 3: PaCMAP reduction
    logger.info("=" * 60)
    logger.info("Step 3/5: PaCMAP reduction to 3D")
    logger.info("=" * 60)
    t0 = time.time()
    reduction = reduce_to_3d(
        embedding=embedding,
        n_neighbors=pacmap_neighbors,
        mn_ratio=pacmap_mn_ratio,
        fp_ratio=pacmap_fp_ratio,
    )
    logger.info(
        "Step 3/5 done (%.1fs) — range [%.1f, %.1f], %d outliers",
        time.time() - t0,
        *reduction.coordinate_range,
        len(reduction.outlier_indices),
    )

    # Step 4: Clustering
    logger.info("=" * 60)
    logger.info("Step 4/5: HDBSCAN clustering")
    logger.info("=" * 60)
    t0 = time.time()
    cluster = cluster_points(
        embedding=embedding,
        reduction=reduction,
        min_cluster_size=hdbscan_min_cluster,
    )
    logger.info(
        "Step 4/5 done (%.1fs) — %d clusters, %d noise",
        time.time() - t0,
        len(cluster.clusters),
        cluster.noise_count,
    )

    # Step 5: Packaging
    logger.info("=" * 60)
    logger.info("Step 5/5: Packaging space JSON")
    logger.info("=" * 60)
    t0 = time.time()
    output_path = package_space(
        embedding=embedding,
        reduction=reduction,
        cluster=cluster,
        output_dir=output,
        compress=compress,
    )
    logger.info("Step 5/5 done (%.1fs) — %s", time.time() - t0, output_path)

    # Summary
    total_time = time.time() - total_start
    logger.info("=" * 60)
    logger.info("Pipeline complete in %.1fs", total_time)
    logger.info("  Model: %s (%s)", embedding.model_name, embedding.model_id)
    logger.info("  Terms: %d", len(vocab.terms))
    logger.info("  Dimensions: %d → 3", embedding.embedding_dim)
    logger.info("  Clusters: %d", len(cluster.clusters))
    logger.info("  Output: %s", output_path)
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
