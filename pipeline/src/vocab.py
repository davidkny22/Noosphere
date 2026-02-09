from __future__ import annotations

import json
import logging
from pathlib import Path

from .types import VocabularyResult

logger = logging.getLogger(__name__)

STOPWORDS = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an",
    "and", "any", "are", "aren't", "as", "at", "be", "because", "been",
    "before", "being", "below", "between", "both", "but", "by", "can",
    "can't", "cannot", "could", "couldn't", "did", "didn't", "do", "does",
    "doesn't", "doing", "don't", "down", "during", "each", "few", "for",
    "from", "further", "get", "got", "had", "hadn't", "has", "hasn't",
    "have", "haven't", "having", "he", "her", "here", "hers", "herself",
    "him", "himself", "his", "how", "i", "if", "in", "into", "is", "isn't",
    "it", "it's", "its", "itself", "just", "let", "let's", "me", "more",
    "most", "mustn't", "my", "myself", "no", "nor", "not", "of", "off",
    "on", "once", "only", "or", "other", "ought", "our", "ours", "ourselves",
    "out", "over", "own", "same", "shan't", "she", "should", "shouldn't",
    "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
    "themselves", "then", "there", "these", "they", "this", "those",
    "through", "to", "too", "under", "until", "up", "very", "was", "wasn't",
    "we", "were", "weren't", "what", "when", "where", "which", "while",
    "who", "whom", "why", "will", "with", "won't", "would", "wouldn't",
    "you", "your", "yours", "yourself", "yourselves",
}

DEFAULT_CONFIG = "vocab_config.json"


def filter_term(term: str) -> bool:
    if len(term) < 2:
        return False
    if term.isnumeric():
        return False
    if term in STOPWORDS:
        return False
    if not term.isascii():
        return False
    return True


def _load_source_terms(data_dir: Path, filename: str) -> list[str]:
    """Load terms from a source file (one per line, preserving file order as rank)."""
    filepath = data_dir / "sources" / filename
    if not filepath.exists():
        logger.info("Source file %s not found — skipping", filename)
        return []

    terms = []
    with open(filepath) as f:
        for line in f:
            raw = line.strip()
            # Skip comments (curated_concepts uses #)
            if raw.startswith("#"):
                continue
            term = raw.lower()
            if term and filter_term(term):
                terms.append(term)

    logger.info("Loaded %d terms from %s", len(terms), filename)
    return terms


def _load_config(data_dir: Path) -> dict:
    """Load vocab composition config."""
    config_path = data_dir / DEFAULT_CONFIG
    if not config_path.exists():
        logger.warning("No vocab_config.json found — using legacy mode")
        return {}
    with open(config_path) as f:
        return json.load(f)


def assemble_vocabulary(target_size: int, data_dir: Path) -> VocabularyResult:
    config = _load_config(data_dir)

    if not config or "sources" not in config:
        return _assemble_legacy(target_size, data_dir)

    return _assemble_configured(target_size, data_dir, config)


def _assemble_configured(
    target_size: int, data_dir: Path, config: dict
) -> VocabularyResult:
    """Tag-and-quota vocabulary assembly with multi-source tiebreaking.

    1. Load ALL terms from all sources, tagging provenance
    2. Assign each term to its highest-priority source
    3. Sort each pool by source count (terms in more sources first), file order as tiebreaker
    4. Fill each source's quota; unfilled slots spill over to next highest-priority source
    5. Union = final vocabulary
    """
    sources_cfg = config["sources"]
    # Sort by priority descending
    sources_cfg.sort(key=lambda s: s["priority"], reverse=True)

    # Step 1: Load all sources and tag each term with provenance
    logger.info("Step 1: Loading all sources and tagging provenance...")
    source_terms: dict[str, list[str]] = {}  # key -> ordered terms
    for src in sources_cfg:
        terms = _load_source_terms(data_dir, src["file"])
        source_terms[src["key"]] = terms

    # Build term -> set of source keys (provenance count)
    term_sources: dict[str, set[str]] = {}
    for key, terms in source_terms.items():
        for t in terms:
            if t not in term_sources:
                term_sources[t] = set()
            term_sources[t].add(key)

    total_unique = len(term_sources)
    logger.info("Total unique terms across all sources: %d", total_unique)

    # Step 2: Assign each term to its highest-priority source
    logger.info("Step 2: Assigning terms to highest-priority source...")
    priority_map = {s["key"]: s["priority"] for s in sources_cfg}

    # term -> assigned source key (highest priority source it appears in)
    term_assignment: dict[str, str] = {}
    for term, srcs in term_sources.items():
        best = max(srcs, key=lambda s: priority_map.get(s, 0))
        term_assignment[term] = best

    # Build assigned pools, deduplicate, and sort by source count
    assigned_pools: dict[str, list[str]] = {s["key"]: [] for s in sources_cfg}
    for src in sources_cfg:
        key = src["key"]
        seen_in_source: set[str] = set()
        deduped: list[str] = []
        for t in source_terms[key]:
            if term_assignment.get(t) == key and t not in seen_in_source:
                seen_in_source.add(t)
                deduped.append(t)

        # Sort by source count descending, preserving file order within each tier
        # enumerate captures original file position for stable tiebreaking
        indexed = [(t, i) for i, t in enumerate(deduped)]
        indexed.sort(key=lambda ti: (-len(term_sources[ti[0]]), ti[1]))
        assigned_pools[key] = [t for t, _ in indexed]

        logger.info(
            "  %s: %d terms assigned (pool size), quota: %d",
            key, len(assigned_pools[key]), src.get("quota", 0),
        )

    # Step 3: Fill quotas with spillover for unfilled slots
    logger.info("Step 3: Filling quotas (with spillover)...")
    source_counts: dict[str, int] = {}
    ordered: list[str] = []
    seen: set[str] = set()
    spillover = 0

    for src in sources_cfg:
        key = src["key"]
        quota = src.get("quota", 0) + spillover
        pool = assigned_pools[key]
        picked = 0
        for t in pool:
            if picked >= quota:
                break
            if t not in seen:
                seen.add(t)
                ordered.append(t)
                picked += 1
        unfilled = quota - picked
        spillover = max(unfilled, 0)
        source_counts[key] = picked
        log_msg = "  %s: picked %d / %d quota (pool had %d)"
        if unfilled > 0:
            log_msg += f" — {unfilled} unfilled slots spill over"
        logger.info(log_msg, key, picked, quota, len(pool))

    # Cap at target size
    if len(ordered) > target_size:
        ordered = ordered[:target_size]
        logger.info("Capped vocabulary at %d terms", target_size)
    elif len(ordered) < target_size:
        logger.warning(
            "Vocabulary has only %d terms (target was %d) — proceeding with available terms",
            len(ordered),
            target_size,
        )

    logger.info(
        "Final vocabulary: %d terms (sources: %s)", len(ordered), source_counts
    )
    return VocabularyResult(terms=ordered, source_counts=source_counts)


def _assemble_legacy(target_size: int, data_dir: Path) -> VocabularyResult:
    """Legacy sequential assembly (no config file)."""
    source_counts: dict[str, int] = {}
    seen: set[str] = set()
    ordered: list[str] = []

    for key, filename in [
        ("google_20k", "google_20k.txt"),
        ("curated", "curated_concepts.txt"),
        ("conceptnet", "conceptnet.txt"),
        ("wordnet", "wordnet.txt"),
        ("mesh", "mesh.txt"),
        ("wikipedia_titles", "wikipedia_titles.txt"),
        ("dariusk_corpora", "dariusk_corpora.txt"),
    ]:
        if len(ordered) >= target_size:
            break
        terms = _load_source_terms(data_dir, filename)
        added = 0
        for t in terms:
            if t not in seen:
                seen.add(t)
                ordered.append(t)
                added += 1
        source_counts[key] = added

    if len(ordered) > target_size:
        ordered = ordered[:target_size]
    elif len(ordered) < target_size:
        logger.warning(
            "Vocabulary has only %d terms (target was %d)",
            len(ordered), target_size,
        )

    logger.info("Final vocabulary: %d terms (sources: %s)", len(ordered), source_counts)
    return VocabularyResult(terms=ordered, source_counts=source_counts)
