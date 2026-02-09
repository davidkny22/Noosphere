#!/usr/bin/env python3
"""Build a 3D embedding space from vocabulary.

Usage:
    uv run build_space.py --model minilm
    uv run build_space.py --model qwen3 --batch-size 256 --device mps
"""
from __future__ import annotations

import logging
import sys
import time
from pathlib import Path

import click

from src.cluster import cluster_points
from src.embed import embed_vocabulary
from src.export_embeddings import export_embeddings
from src.faiss_index import build_faiss_index
from src.package import package_space
from src.parametric import train_parametric
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
    default=200000,
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
    default=20,
    show_default=True,
    help="PaCMAP n_neighbors (5-50). Higher preserves more global structure.",
)
@click.option(
    "--pacmap-mn-ratio",
    type=float,
    default=1.0,
    show_default=True,
    help="PaCMAP MN_ratio.",
)
@click.option(
    "--pacmap-fp-ratio",
    type=float,
    default=4.0,
    show_default=True,
    help="PaCMAP FP_ratio.",
)
@click.option(
    "--hdbscan-min-cluster",
    type=int,
    default=50,
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
    "--skip-faiss",
    is_flag=True,
    default=False,
    help="Skip FAISS index building.",
)
@click.option(
    "--skip-parametric",
    is_flag=True,
    default=False,
    help="Skip ParamPaCMAP training.",
)
@click.option(
    "--skip-embeddings-export",
    is_flag=True,
    default=False,
    help="Skip HD embeddings export.",
)
@click.option(
    "--cache-dir",
    type=click.Path(),
    default=str(PIPELINE_DIR / "data" / "cache"),
    show_default=True,
    help="Directory for embedding cache.",
)
@click.option(
    "--label-model",
    type=click.Choice(["5-nano", "medoid"]),
    default="5-nano",
    show_default=True,
    help="Cluster labeling method. 5-nano uses OpenAI API (requires OPENAI_API_KEY).",
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
    skip_faiss: bool,
    skip_parametric: bool,
    skip_embeddings_export: bool,
    cache_dir: str,
    label_model: str,
) -> None:
    total_start = time.time()
    data_dir = PIPELINE_DIR / "data"

    total_steps = 5 + (not skip_faiss) + (not skip_parametric) + (not skip_embeddings_export)
    step = 0

    # Step 1: Vocabulary
    step += 1
    logger.info("=" * 60)
    logger.info("Step %d/%d: Assembling vocabulary (target: %d terms)", step, total_steps, vocab_size)
    logger.info("=" * 60)
    t0 = time.time()
    vocab = assemble_vocabulary(target_size=vocab_size, data_dir=data_dir)
    logger.info("Step %d done (%.1fs) — %d terms", step, time.time() - t0, len(vocab.terms))

    # Step 2: Embedding
    step += 1
    logger.info("=" * 60)
    logger.info("Step %d/%d: Embedding %d terms with %s", step, total_steps, len(vocab.terms), model)
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
        "Step %d done (%.1fs) — %d × %d on %s",
        step,
        time.time() - t0,
        *embedding.embeddings.shape,
        embedding.device_used,
    )

    # Step 3: PaCMAP reduction
    step += 1
    logger.info("=" * 60)
    logger.info("Step %d/%d: PaCMAP reduction to 3D", step, total_steps)
    logger.info("=" * 60)
    t0 = time.time()
    reduction = reduce_to_3d(
        embedding=embedding,
        n_neighbors=pacmap_neighbors,
        mn_ratio=pacmap_mn_ratio,
        fp_ratio=pacmap_fp_ratio,
    )
    logger.info(
        "Step %d done (%.1fs) — range [%.1f, %.1f], %d outliers",
        step,
        time.time() - t0,
        *reduction.coordinate_range,
        len(reduction.outlier_indices),
    )

    # Create label client if using LLM labels
    label_client = None
    if label_model == "5-nano":
        import os
        api_key = os.environ.get("OPENAI_API_KEY")
        if api_key:
            from openai import OpenAI
            label_client = OpenAI(api_key=api_key)
            logger.info("Using 5-nano for cluster labels")
        else:
            logger.warning("OPENAI_API_KEY not set — falling back to medoid labels")

    # Step 4: Clustering
    step += 1
    logger.info("=" * 60)
    logger.info("Step %d/%d: HDBSCAN clustering", step, total_steps)
    logger.info("=" * 60)
    t0 = time.time()
    cluster = cluster_points(
        embedding=embedding,
        reduction=reduction,
        min_cluster_size=hdbscan_min_cluster,
        label_client=label_client,
    )
    logger.info(
        "Step %d done (%.1fs) — %d clusters, %d noise",
        step,
        time.time() - t0,
        len(cluster.clusters),
        cluster.noise_count,
    )

    # Step 5: Packaging
    step += 1
    logger.info("=" * 60)
    logger.info("Step %d/%d: Packaging space JSON", step, total_steps)
    logger.info("=" * 60)
    t0 = time.time()
    output_path = package_space(
        embedding=embedding,
        reduction=reduction,
        cluster=cluster,
        output_dir=output,
        compress=compress,
    )
    logger.info("Step %d done (%.1fs) — %s", step, time.time() - t0, output_path)

    # Step 6: FAISS index
    if not skip_faiss:
        step += 1
        logger.info("=" * 60)
        logger.info("Step %d/%d: Building FAISS index", step, total_steps)
        logger.info("=" * 60)
        t0 = time.time()
        faiss_path = build_faiss_index(embedding=embedding, output_dir=output)
        logger.info("Step %d done (%.1fs) — %s", step, time.time() - t0, faiss_path)

    # Step 7: ParamPaCMAP training
    if not skip_parametric:
        step += 1
        logger.info("=" * 60)
        logger.info("Step %d/%d: Training ParamPaCMAP", step, total_steps)
        logger.info("=" * 60)
        t0 = time.time()
        param_path, _ = train_parametric(embedding=embedding, output_dir=output)
        logger.info("Step %d done (%.1fs) — %s", step, time.time() - t0, param_path)

    # Step 8: Export HD embeddings
    if not skip_embeddings_export:
        step += 1
        logger.info("=" * 60)
        logger.info("Step %d/%d: Exporting HD embeddings", step, total_steps)
        logger.info("=" * 60)
        t0 = time.time()
        emb_path = export_embeddings(embedding=embedding, output_dir=output)
        logger.info("Step %d done (%.1fs) — %s", step, time.time() - t0, emb_path)

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
