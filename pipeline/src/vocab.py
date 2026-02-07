from __future__ import annotations

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


def load_google_20k(data_dir: Path) -> list[str]:
    filepath = data_dir / "sources" / "google_20k.txt"
    if not filepath.exists():
        logger.warning("Google 20K file not found at %s — skipping", filepath)
        return []

    terms = []
    with open(filepath) as f:
        for line in f:
            term = line.strip().lower()
            if term and filter_term(term):
                terms.append(term)

    logger.info("Loaded %d terms from Google 20K (after filtering)", len(terms))
    return terms


def load_curated_concepts(data_dir: Path) -> list[str]:
    filepath = data_dir / "sources" / "curated_concepts.txt"
    if not filepath.exists():
        logger.warning("Curated concepts file not found at %s — skipping", filepath)
        return []

    terms = []
    with open(filepath) as f:
        for line in f:
            term = line.strip().lower()
            if term and not term.startswith("#") and filter_term(term):
                terms.append(term)

    logger.info("Loaded %d terms from curated concepts (after filtering)", len(terms))
    return terms


def assemble_vocabulary(target_size: int, data_dir: Path) -> VocabularyResult:
    source_counts: dict[str, int] = {}
    seen: set[str] = set()
    ordered: list[str] = []

    # Priority 1: Google 20K frequency list
    google_terms = load_google_20k(data_dir)
    for t in google_terms:
        if t not in seen:
            seen.add(t)
            ordered.append(t)
    source_counts["google_20k"] = len(google_terms)

    # Priority 2: Curated domain concepts
    curated_terms = load_curated_concepts(data_dir)
    added_curated = 0
    for t in curated_terms:
        if t not in seen:
            seen.add(t)
            ordered.append(t)
            added_curated += 1
    source_counts["curated"] = added_curated

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
