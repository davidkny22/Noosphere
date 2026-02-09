#!/usr/bin/env python3
"""Download and extract vocabulary sources for the 250K target.

Downloads external datasets, extracts English terms, and writes
plain-text files (one term per line) to pipeline/data/sources/.

Usage:
    uv run scripts/fetch_vocab_sources.py
    uv run scripts/fetch_vocab_sources.py --source conceptnet
    uv run scripts/fetch_vocab_sources.py --source wordnet --source mesh
"""
from __future__ import annotations

import gzip
import json
import logging
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path

import click

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

PIPELINE_DIR = Path(__file__).parent.parent
SOURCES_DIR = PIPELINE_DIR / "data" / "sources"
CACHE_DIR = PIPELINE_DIR / "data" / "cache" / "vocab_downloads"

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
    words = term.split()
    if len(words) > 3:
        return False
    return True


def download_file(url: str, dest: Path) -> Path:
    """Download a file with progress, using cache."""
    if dest.exists():
        logger.info("Using cached: %s", dest.name)
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading: %s", url)
    logger.info("         to: %s", dest)
    urllib.request.urlretrieve(url, dest)
    logger.info("Downloaded: %.1f MB", dest.stat().st_size / 1e6)
    return dest


def write_terms(terms: set[str], output_path: Path) -> None:
    """Write terms to a text file, sorted, one per line."""
    filtered = sorted(t for t in terms if filter_term(t))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(filtered) + "\n")
    logger.info("Wrote %d terms to %s", len(filtered), output_path.name)


# ── ConceptNet 5.7.0 ──────────────────────────────────────────────

CONCEPTNET_URL = "https://s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz"


CONCEPTNET_TOP_N = 150_000


def fetch_conceptnet() -> None:
    """Extract English concepts from ConceptNet 5.7.0, ranked by edge count.

    Terms with more relationships to other concepts are more semantically
    connected and produce richer neighborhoods in the embedding space.
    We count edges per term and keep the top CONCEPTNET_TOP_N.
    """
    cache_file = CACHE_DIR / "conceptnet-assertions-5.7.0.csv.gz"
    download_file(CONCEPTNET_URL, cache_file)

    logger.info("Extracting English concepts from ConceptNet (this takes a few minutes)...")
    from collections import Counter

    edge_counts: Counter[str] = Counter()
    uri_re = re.compile(r"^/c/en/([^/]+)")

    with gzip.open(cache_file, "rt", encoding="utf-8") as f:
        for line in f:
            parts = line.split("\t")
            if len(parts) < 5:
                continue
            # Filter by weight for quality
            try:
                meta = json.loads(parts[4])
                if meta.get("weight", 0) < 1.0:
                    continue
            except (json.JSONDecodeError, IndexError):
                continue

            for col in (2, 3):
                m = uri_re.match(parts[col])
                if m:
                    label = m.group(1).replace("_", " ").lower().strip()
                    if filter_term(label):
                        edge_counts[label] += 1

    # Take the most-connected terms
    top_terms = {term for term, _ in edge_counts.most_common(CONCEPTNET_TOP_N)}
    logger.info(
        "ConceptNet: %d total terms, keeping top %d by edge count (min edges in top: %d)",
        len(edge_counts),
        len(top_terms),
        edge_counts.most_common(CONCEPTNET_TOP_N)[-1][1] if top_terms else 0,
    )

    write_terms(top_terms, SOURCES_DIR / "conceptnet.txt")


# ── WordNet ────────────────────────────────────────────────────────


def fetch_wordnet() -> None:
    """Extract all lemma names from WordNet via NLTK."""
    try:
        import nltk
    except ImportError:
        logger.error("nltk not installed. Run: pip install nltk")
        return

    nltk.download("wordnet", quiet=True)
    from nltk.corpus import wordnet as wn

    terms: set[str] = set()
    for synset in wn.all_synsets():
        for lemma in synset.lemmas():
            name = lemma.name().replace("_", " ").lower()
            terms.add(name)

    write_terms(terms, SOURCES_DIR / "wordnet.txt")


# ── MeSH ───────────────────────────────────────────────────────────

MESH_URL = "https://nlmpubs.nlm.nih.gov/projects/mesh/MESH_FILES/xmlmesh/desc2026.gz"


def fetch_mesh() -> None:
    """Extract medical/scientific terms from MeSH descriptors (XML format)."""
    cache_file = CACHE_DIR / "desc2026.gz"
    download_file(MESH_URL, cache_file)

    logger.info("Extracting MeSH headings and entry terms from XML...")
    terms: set[str] = set()

    import xml.etree.ElementTree as ET

    with gzip.open(cache_file, "rt", encoding="utf-8") as f:
        for event, elem in ET.iterparse(f, events=("end",)):
            # Main descriptor names
            if elem.tag == "DescriptorName":
                name_el = elem.find("String")
                if name_el is not None and name_el.text:
                    terms.add(name_el.text.strip().lower())
            # Concept names (includes entry terms / synonyms)
            elif elem.tag == "ConceptName":
                name_el = elem.find("String")
                if name_el is not None and name_el.text:
                    terms.add(name_el.text.strip().lower())
            # Term names (finest granularity)
            elif elem.tag == "Term":
                name_el = elem.find("String")
                if name_el is not None and name_el.text:
                    terms.add(name_el.text.strip().lower())
            # Free memory for completed descriptor records
            if elem.tag == "DescriptorRecord":
                elem.clear()

    write_terms(terms, SOURCES_DIR / "mesh.txt")


# ── Wikipedia Titles ───────────────────────────────────────────────

WIKI_TITLES_URL = "https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-all-titles-in-ns0.gz"


def fetch_wikipedia_titles() -> None:
    """Extract conceptual article titles from Wikipedia (1-3 words, no people/places)."""
    cache_file = CACHE_DIR / "enwiki-latest-all-titles-in-ns0.gz"
    download_file(WIKI_TITLES_URL, cache_file)

    logger.info("Extracting Wikipedia concept titles (this takes a minute)...")
    terms: set[str] = set()

    # Common patterns to skip
    skip_patterns = {
        "(disambiguation)", "list of", "lists of", "index of",
        "outline of", "history of", "geography of", "demographics of",
        "deaths in", "births in", "events in",
    }

    with gzip.open(cache_file, "rt", encoding="utf-8") as f:
        for line in f:
            title = line.strip().replace("_", " ")
            lower = title.lower()

            # Word count filter
            words = lower.split()
            if len(words) < 1 or len(words) > 3:
                continue

            # Skip numeric-leading titles (years, dates)
            if re.match(r"^\d", lower):
                continue

            # Skip disambiguation and list pages
            if any(pat in lower for pat in skip_patterns):
                continue

            # Skip titles with special characters
            if any(c in lower for c in ":/.()#"):
                continue

            terms.add(lower)

    write_terms(terms, SOURCES_DIR / "wikipedia_titles.txt")


# ── Dariusk Corpora ────────────────────────────────────────────────

DARIUSK_URL = "https://github.com/dariusk/corpora/archive/refs/heads/master.zip"


def fetch_dariusk() -> None:
    """Extract concept terms from Dariusk's curated corpora."""
    cache_file = CACHE_DIR / "corpora-master.zip"
    download_file(DARIUSK_URL, cache_file)

    import zipfile

    logger.info("Extracting terms from Dariusk corpora...")
    terms: set[str] = set()

    with zipfile.ZipFile(cache_file) as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            # Skip non-data files
            if "/data/" not in name:
                continue
            try:
                data = json.loads(zf.read(name))
                _extract_strings_recursive(data, terms)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue

    write_terms(terms, SOURCES_DIR / "dariusk_corpora.txt")


def _extract_strings_recursive(obj: object, terms: set[str]) -> None:
    """Recursively extract string values from nested JSON structures."""
    if isinstance(obj, str):
        term = obj.strip().lower()
        if term and len(term) < 80:
            terms.add(term)
    elif isinstance(obj, list):
        for item in obj:
            _extract_strings_recursive(item, terms)
    elif isinstance(obj, dict):
        for value in obj.values():
            _extract_strings_recursive(value, terms)


# ── Main ───────────────────────────────────────────────────────────

SOURCES = {
    "conceptnet": ("ConceptNet 5.7.0", fetch_conceptnet),
    "wordnet": ("WordNet (NLTK)", fetch_wordnet),
    "mesh": ("MeSH 2025", fetch_mesh),
    "wikipedia": ("Wikipedia Titles", fetch_wikipedia_titles),
    "dariusk": ("Dariusk Corpora", fetch_dariusk),
}


@click.command()
@click.option(
    "--source",
    multiple=True,
    type=click.Choice(list(SOURCES.keys())),
    help="Specific source(s) to fetch. Omit to fetch all.",
)
def main(source: tuple[str, ...]) -> None:
    """Download and extract vocabulary sources."""
    targets = source if source else tuple(SOURCES.keys())

    logger.info("Fetching %d vocabulary source(s)...", len(targets))
    for key in targets:
        name, func = SOURCES[key]
        logger.info("=" * 60)
        logger.info("Fetching: %s", name)
        logger.info("=" * 60)
        try:
            func()
        except Exception:
            logger.exception("Failed to fetch %s", name)
            continue

    # Summary
    logger.info("=" * 60)
    logger.info("Summary:")
    for f in sorted(SOURCES_DIR.glob("*.txt")):
        count = sum(1 for _ in f.open())
        logger.info("  %s: %d terms", f.name, count)
    logger.info("=" * 60)


if __name__ == "__main__":
    main()
