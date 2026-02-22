"""Auto-download vocabulary source files when missing.

Each source has a permissive license that allows use and redistribution:
  - ConceptNet Numberbatch: CC BY-SA 4.0
  - WordNet (via NLTK):     Princeton WordNet License (BSD-like)
  - MeSH:                   CC0 / Public Domain (US NLM)
  - Wikipedia titles:       CC BY-SA 4.0
  - Dariusk Corpora:        CC0 / Public Domain

Downloads are saved to pipeline/data/sources/ alongside manually curated files.
"""
from __future__ import annotations

import gzip
import io
import json
import logging
import tempfile
import urllib.request
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger(__name__)

_UA = "Noosphere-Pipeline/0.1 (https://github.com/davidkny22/Noosphere)"


def download_if_missing(key: str, filepath: Path) -> bool:
    """Download a vocabulary source if the file doesn't exist locally.

    Returns True if the file exists after this call.
    """
    if filepath.exists():
        return True

    downloader = _DOWNLOADERS.get(key)
    if not downloader:
        return False

    logger.info("Auto-downloading vocabulary source: %s", key)
    filepath.parent.mkdir(parents=True, exist_ok=True)
    try:
        downloader(filepath)
        count = sum(1 for _ in open(filepath, encoding="utf-8"))
        logger.info("  Saved %s (%d terms)", filepath.name, count)
        return True
    except Exception as e:
        logger.warning("  Download failed for %s: %s — skipping", key, e)
        if filepath.exists():
            filepath.unlink()
        return False


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

def _fetch(url: str, desc: str = "") -> bytes:
    """Download a URL and return raw bytes with progress logging."""
    label = desc or url.split("/")[-1]
    logger.info("  Fetching %s ...", label)
    req = urllib.request.Request(url, headers={"User-Agent": _UA})
    with urllib.request.urlopen(req, timeout=300) as resp:
        total = int(resp.headers.get("Content-Length", 0))
        chunks: list[bytes] = []
        downloaded = 0
        last_log_mb = 0.0
        while True:
            chunk = resp.read(256 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
            downloaded += len(chunk)
            mb = downloaded / (1024 * 1024)
            if total > 0 and mb - last_log_mb >= 20:
                logger.info("  ... %.0f / %.0f MB", mb, total / (1024 * 1024))
                last_log_mb = mb
    data = b"".join(chunks)
    logger.info("  Downloaded %.1f MB", len(data) / (1024 * 1024))
    return data


def _atomic_write(filepath: Path, terms: list[str]) -> None:
    """Write terms to a file atomically via temp file + rename."""
    with tempfile.NamedTemporaryFile(
        mode="w", dir=filepath.parent, suffix=".tmp",
        delete=False, encoding="utf-8",
    ) as f:
        for t in terms:
            f.write(t + "\n")
        tmp = Path(f.name)
    tmp.rename(filepath)


# ---------------------------------------------------------------------------
# ConceptNet (via Numberbatch embeddings — CC BY-SA 4.0)
# ---------------------------------------------------------------------------

def _download_conceptnet(output: Path) -> None:
    """Extract English concept names from ConceptNet Numberbatch.

    Source: https://github.com/commonsense/conceptnet-numberbatch
    Format: word2vec text — first column is /c/en/CONCEPT, rest is vector.
    We only extract the concept names.
    """
    url = (
        "https://conceptnet.s3.amazonaws.com/downloads/2019/"
        "numberbatch/numberbatch-en-19.08.txt.gz"
    )
    data = _fetch(url, "ConceptNet Numberbatch (CC BY-SA 4.0)")

    terms: list[str] = []
    with gzip.open(io.BytesIO(data), "rt", encoding="utf-8") as f:
        f.readline()  # skip header: "516782 300"
        for line in f:
            concept = line.split(" ", 1)[0].strip()
            if not concept:
                continue
            # English-only file uses plain words; multilingual uses /c/en/ URIs
            if concept.startswith("/c/en/"):
                term = concept[6:].replace("_", " ")
            else:
                term = concept.replace("_", " ")
            if term and len(term) >= 2:
                terms.append(term)

    _atomic_write(output, terms)


# ---------------------------------------------------------------------------
# WordNet (via NLTK — Princeton WordNet License, BSD-like)
# ---------------------------------------------------------------------------

def _download_wordnet(output: Path) -> None:
    """Extract all WordNet lemma names via NLTK.

    License: https://wordnet.princeton.edu/license-and-commercial-use
    """
    import nltk
    nltk.download("wordnet", quiet=True)
    nltk.download("omw-1.4", quiet=True)
    from nltk.corpus import wordnet as wn

    logger.info("  Extracting WordNet lemma names ...")
    terms: set[str] = set()
    for synset in wn.all_synsets():
        for lemma in synset.lemma_names():
            term = lemma.replace("_", " ").lower()
            if len(term) >= 2:
                terms.add(term)

    _atomic_write(output, sorted(terms))


# ---------------------------------------------------------------------------
# MeSH — Medical Subject Headings (CC0 / Public Domain, US NLM)
# ---------------------------------------------------------------------------

def _download_mesh(output: Path) -> None:
    """Download MeSH descriptor headings from NLM.

    The ASCII format was discontinued in 2026. We try the XML supplement
    or fall back to the ASCII archive for 2024/2025.
    Source: https://www.nlm.nih.gov/databases/download/mesh.html
    """
    # Try ASCII descriptor files (archived years)
    for year in [2025, 2024]:
        url = (
            f"https://nlmpubs.nlm.nih.gov/projects/mesh/"
            f"MESH_FILES/asciimesh/d{year}.bin"
        )
        try:
            data = _fetch(url, f"MeSH {year} descriptors (Public Domain)")
            break
        except Exception:
            logger.info("  MeSH %d not available, trying older year...", year)
            continue
    else:
        raise RuntimeError("Could not download MeSH descriptors (ASCII format discontinued)")

    terms: list[str] = []
    for line in data.decode("utf-8", errors="replace").split("\n"):
        if line.startswith("MH = "):
            term = line[5:].strip().lower()
            if term:
                terms.append(term)

    _atomic_write(output, terms)


# ---------------------------------------------------------------------------
# Wikipedia article titles (CC BY-SA 4.0)
# ---------------------------------------------------------------------------

def _download_wikipedia_titles(output: Path) -> None:
    """Download Wikipedia article titles and filter to useful compound concepts.

    Source: https://dumps.wikimedia.org/enwiki/latest/
    We keep multi-word titles (compound concepts) since single words are
    covered by other sources. Filters out list pages, disambiguation, etc.
    """
    url = "https://dumps.wikimedia.org/enwiki/latest/enwiki-latest-all-titles-in-ns0.gz"
    data = _fetch(url, "Wikipedia article titles (CC BY-SA 4.0)")

    logger.info("  Filtering Wikipedia titles ...")
    terms: list[str] = []
    with gzip.open(io.BytesIO(data), "rt", encoding="utf-8") as f:
        for line in f:
            title = line.strip().replace("_", " ").lower()
            if not title or len(title) > 80:
                continue
            # Keep compound concepts — single words covered by other sources
            if " " not in title:
                continue
            # Skip meta/list pages
            if title.startswith(("list of", "lists of", "index of", "outline of")):
                continue
            if "disambiguation" in title:
                continue
            terms.append(title)

    _atomic_write(output, terms)


# ---------------------------------------------------------------------------
# Dariusk Corpora — curated concept lists (CC0 / Public Domain)
# ---------------------------------------------------------------------------

_DARIUSK_BASE = "https://raw.githubusercontent.com/dariusk/corpora/master/data"
_DARIUSK_FILES = [
    "animals/animals.json",
    "animals/cats.json",
    "animals/dinosaurs.json",
    "animals/dogs.json",
    "animals/birds_north_america.json",
    "foods/fruits.json",
    "foods/vegetables.json",
    "foods/herbs_n_spices.json",
    "foods/fish.json",
    "humans/occupations.json",
    "science/elements.json",
    "materials/fabrics.json",
    "materials/gemstones.json",
    "geography/oceans.json",
    "geography/rivers.json",
    "music/genres.json",
    "technology/computer_science.json",
]


def _download_dariusk(output: Path) -> None:
    """Download curated concept lists from Dariusk Corpora.

    Source: https://github.com/dariusk/corpora
    """
    all_terms: set[str] = set()
    for relpath in _DARIUSK_FILES:
        url = f"{_DARIUSK_BASE}/{relpath}"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _UA})
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read())
            _extract_strings(data, all_terms)
            logger.info("  %s: %d cumulative terms", relpath.split("/")[-1], len(all_terms))
        except Exception as e:
            logger.warning("  Skipping %s: %s", relpath, e)

    _atomic_write(output, sorted(all_terms))


def _extract_strings(obj: object, out: set[str]) -> None:
    """Recursively extract string values from a JSON structure."""
    if isinstance(obj, str):
        term = obj.strip().lower()
        if 2 <= len(term) <= 80:
            out.add(term)
    elif isinstance(obj, list):
        for item in obj:
            _extract_strings(item, out)
    elif isinstance(obj, dict):
        for v in obj.values():
            _extract_strings(v, out)


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_DOWNLOADERS: dict[str, Callable[[Path], None]] = {
    "conceptnet": _download_conceptnet,
    "wordnet": _download_wordnet,
    "mesh": _download_mesh,
    "wikipedia_titles": _download_wikipedia_titles,
    "dariusk_corpora": _download_dariusk,
}
