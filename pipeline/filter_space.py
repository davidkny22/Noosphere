#!/usr/bin/env python3
"""Filter an existing space JSON down to a cleaner, smaller version.

Removes junk terms, deduplicates by stem, prioritizes clustered points,
rebuilds cluster metadata, generates vocab mapping, and optionally rebuilds FAISS.

Usage:
    uv run filter_space.py --input ../web/public/spaces/minilm-250k.json.gz \
                           --output ../web/public/spaces/minilm-150k.json.gz \
                           --target 150000
    uv run filter_space.py --input ../web/public/spaces/minilm-250k.json.gz \
                           --output ../web/public/spaces/minilm-150k.json.gz \
                           --target 150000 --rebuild-faiss --embeddings-cache data/cache
"""
from __future__ import annotations

import gzip
import json
import logging
import re
import sys
from collections import defaultdict
from pathlib import Path

import click

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Stemmer / filters
# ---------------------------------------------------------------------------

def rough_stem(word: str) -> str:
    """Simple suffix-stripping stemmer for dedup grouping."""
    w = word.lower().strip()
    if " " in w:
        return " ".join(rough_stem(part) for part in w.split())
    for suffix in ["ation", "tion", "sion", "ness", "ment", "ity", "ous",
                    "ive", "ing", "ful", "less", "able", "ible", "ical",
                    "ally", "ely", "ize", "ise", "ated", "ting", "ted",
                    "ies", "es", "ly", "ed", "er", "al", "en", "s"]:
        if len(w) > len(suffix) + 3 and w.endswith(suffix):
            return w[: -len(suffix)]
    return w


_JUNK = [
    re.compile(r"^\d"),
    re.compile(r"^[a-z]-"),
    re.compile(r"lipoxygenase|transferase|dehydrogenase|reductase|kinase|synthase|oxidase"),
    re.compile(r"perchlorate|phosphate|sulfate|acetate|carbonate|hydroxide|chloride"),
    re.compile(r"\d{2,}-"),
]


def is_junk(term: str) -> bool:
    return any(p.search(term) for p in _JUNK)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

@click.command()
@click.option("--input", "input_path", required=True, type=click.Path(exists=True),
              help="Input space JSON (.json.gz)")
@click.option("--output", "output_path", required=True, type=click.Path(),
              help="Output filtered space JSON (.json.gz)")
@click.option("--target", type=int, default=150000, show_default=True,
              help="Target number of points")
@click.option("--min-cluster-size", type=int, default=5, show_default=True,
              help="Drop clusters smaller than this after filtering")
@click.option("--rebuild-faiss", is_flag=True, default=False,
              help="Rebuild FAISS index for the filtered space")
@click.option("--embeddings-cache", type=click.Path(),
              help="Cache dir containing {model}_{size}_embeddings.npy (required with --rebuild-faiss)")
def main(
    input_path: str,
    output_path: str,
    target: int,
    min_cluster_size: int,
    rebuild_faiss: bool,
    embeddings_cache: str | None,
):
    # Load
    logger.info("Loading %s...", input_path)
    with gzip.open(input_path, "rt") as f:
        data = json.load(f)

    points = data["points"]
    logger.info("  %d points, %d clusters", len(points), len(data["clusters"]))

    # Step 1: Remove junk
    clean = [p for p in points if not is_junk(p["term"])]
    logger.info("  Removed %d junk terms → %d remaining", len(points) - len(clean), len(clean))

    # Step 2: Deduplicate by stem
    stem_groups: dict[str, list] = defaultdict(list)
    for p in clean:
        stem_groups[rough_stem(p["term"])].append(p)

    deduped = []
    removed_dupes = 0
    for group in stem_groups.values():
        group.sort(key=lambda p: (p["cluster"] == -1, len(p["term"])))
        deduped.append(group[0])
        removed_dupes += len(group) - 1
    logger.info("  Removed %d near-duplicates → %d remaining", removed_dupes, len(deduped))

    # Step 3: Prioritize clustered, fill with noise
    clustered = [p for p in deduped if p["cluster"] != -1]
    noise = [p for p in deduped if p["cluster"] == -1]
    logger.info("  Clustered: %d, Noise: %d", len(clustered), len(noise))

    if len(clustered) >= target:
        clustered.sort(key=lambda p: len(p["term"]))
        final = clustered[:target]
    else:
        noise.sort(key=lambda p: len(p["term"]))
        final = clustered + noise[: target - len(clustered)]
    logger.info("  Final: %d points", len(final))

    # Step 4: Rebuild cluster metadata
    cluster_members: dict[int, list] = defaultdict(list)
    for p in final:
        if p["cluster"] != -1:
            cluster_members[p["cluster"]].append(p)

    old_clusters = {c["id"]: c for c in data["clusters"]}
    new_clusters = []
    dropped = 0
    for cid, members in sorted(cluster_members.items()):
        if len(members) < min_cluster_size:
            for p in members:
                p["cluster"] = -1
            dropped += 1
            continue
        old = old_clusters.get(cid)
        if not old:
            continue
        cx = sum(p["pos"][0] for p in members) / len(members)
        cy = sum(p["pos"][1] for p in members) / len(members)
        cz = sum(p["pos"][2] for p in members) / len(members)
        new_clusters.append({
            "id": cid,
            "label": old["label"],
            "representative_terms": old["representative_terms"],
            "size": len(members),
            "centroid": [round(cx, 3), round(cy, 3), round(cz, 3)],
        })
    logger.info("  Clusters: %d (dropped %d with <%d members)", len(new_clusters), dropped, min_cluster_size)

    # Round positions
    for p in final:
        p["pos"] = [round(v, 3) for v in p["pos"]]

    # Step 5: Write filtered space
    out = {
        "version": data["version"],
        "model": data["model"],
        "model_full": data["model_full"],
        "embedding_dim": data["embedding_dim"],
        "num_points": len(final),
        "num_clusters": len(new_clusters),
        "pacmap_params": data["pacmap_params"],
        "hdbscan_params": data["hdbscan_params"],
        "points": final,
        "clusters": new_clusters,
    }

    logger.info("Writing %s...", output_path)
    with gzip.open(output_path, "wt") as f:
        json.dump(out, f, separators=(",", ":"))

    # Step 6: Write vocab mapping
    vocab_path = output_path.replace(".json.gz", "-vocab.json.gz")
    vocab_map = {p["term"]: i for i, p in enumerate(final)}
    with gzip.open(vocab_path, "wt") as f:
        json.dump(vocab_map, f, separators=(",", ":"))
    logger.info("Wrote vocab mapping to %s (%d terms)", vocab_path, len(vocab_map))

    # Step 7: Rebuild FAISS if requested
    if rebuild_faiss:
        if not embeddings_cache:
            logger.error("--embeddings-cache is required with --rebuild-faiss")
            sys.exit(1)
        _rebuild_faiss(data, final, output_path, embeddings_cache)

    logger.info("Done!")


def _rebuild_faiss(
    original_data: dict,
    filtered_points: list[dict],
    output_path: str,
    cache_dir: str,
):
    """Rebuild FAISS index for the filtered space using cached embeddings."""
    import numpy as np
    import subprocess

    model = original_data["model"]
    dim = original_data["embedding_dim"]
    original_size = original_data["num_points"]

    # Find the embeddings cache file
    # Try the original vocab size first (embeddings are cached at vocab assembly size)
    cache_path = Path(cache_dir)
    candidates = sorted(cache_path.glob(f"{model}_*_embeddings.npy"), reverse=True)
    if not candidates:
        logger.error("No embeddings cache found in %s for model %s", cache_dir, model)
        sys.exit(1)

    emb_file = candidates[0]  # largest available
    logger.info("Loading embeddings from %s...", emb_file)
    all_embeddings = np.load(str(emb_file))
    logger.info("  Embeddings shape: %s", all_embeddings.shape)

    # Reconstruct the vocab to get term→embedding_index mapping
    logger.info("Reconstructing vocab for embedding index mapping...")
    from src.vocab import assemble_vocabulary
    vocab = assemble_vocabulary(target_size=all_embeddings.shape[0], data_dir=Path("data"))
    term_to_emb_idx = {t: i for i, t in enumerate(vocab.terms)}

    # Extract filtered embeddings — strict mode, no missing allowed
    indices = []
    missing = []
    for p in filtered_points:
        idx = term_to_emb_idx.get(p["term"])
        if idx is not None:
            indices.append(idx)
        else:
            missing.append(p["term"])

    if missing:
        logger.error(
            "%d terms not found in embedding cache! First 10: %s\n"
            "Vocab reconstruction doesn't match the original build — aborting.",
            len(missing), missing[:10],
        )
        sys.exit(1)

    filtered_emb = all_embeddings[indices].astype(np.float32)
    logger.info("  Filtered embeddings: %s", filtered_emb.shape)

    # Save temp embeddings and build FAISS in subprocess
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".npy", delete=False) as tmp:
        np.save(tmp.name, filtered_emb)
        tmp_path = tmp.name

    faiss_path = output_path.replace(".json.gz", ".faiss")

    faiss_script = '''
import sys, json, numpy as np
embeddings = np.load(sys.argv[1]).astype(np.float32)
import faiss
faiss.normalize_L2(embeddings)
index = faiss.IndexFlatIP(int(sys.argv[3]))
batch_size = 10_000
for start in range(0, len(embeddings), batch_size):
    end = min(start + batch_size, len(embeddings))
    index.add(embeddings[start:end])
D, I = index.search(embeddings[:1], 1)
assert I[0, 0] == 0
faiss.write_index(index, sys.argv[2])
with open(sys.argv[4], "w") as f:
    json.dump({"status": "ok", "ntotal": int(index.ntotal)}, f)
'''

    import os
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as status_tmp:
        status_path = status_tmp.name

    logger.info("Building FAISS index in subprocess (%d vectors × %d dims)...", len(filtered_emb), dim)
    result = subprocess.run(
        [sys.executable, "-c", faiss_script, tmp_path, faiss_path, str(dim), status_path],
        capture_output=True, text=True,
        env={**os.environ, "OMP_NUM_THREADS": "1"},
    )

    os.unlink(tmp_path)

    if result.returncode != 0:
        logger.error("FAISS subprocess failed:\n%s", result.stderr)
        sys.exit(1)

    status = json.loads(Path(status_path).read_text())
    os.unlink(status_path)
    logger.info("FAISS index: %d vectors, saved to %s", status["ntotal"], faiss_path)

    # Also export HD embeddings .bin/.json for local browser service
    prefix = Path(output_path).name.replace(".json.gz", "")
    bin_path = Path(output_path).parent / f"{prefix}-embeddings.bin"
    meta_path = Path(output_path).parent / f"{prefix}-embeddings.json"

    filtered_emb.tofile(str(bin_path))
    size_mb = bin_path.stat().st_size / (1024 * 1024)
    logger.info("HD embeddings: %s (%.0f MB)", bin_path, size_mb)

    meta_path.write_text(json.dumps({
        "model": original_data["model"],
        "model_full": original_data.get("model_full", original_data["model"]),
        "num_points": len(filtered_points),
        "embedding_dim": dim,
        "dtype": "float32",
        "byte_order": "little",
        "file": f"{prefix}-embeddings.bin",
    }, indent=2))
    logger.info("HD embeddings meta: %s", meta_path)


if __name__ == "__main__":
    main()
