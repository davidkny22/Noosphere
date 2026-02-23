"""SpaceEngine — loads model artifacts and provides embedding/search/bias operations."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import sys
import types
from pathlib import Path

import faiss
import numpy as np
import torch
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


def _patch_annoy():
    """Mock annoy before importing parampacmap (segfaults on macOS ARM64)."""
    if "annoy" not in sys.modules:
        mock = types.ModuleType("annoy")
        mock.AnnoyIndex = type("AnnoyIndex", (), {"__init__": lambda self, *a, **kw: None})
        sys.modules["annoy"] = mock


class SpaceEngine:
    """Stateless engine operating on a single model's artifacts."""

    # Model name → HuggingFace model ID mapping (used by load_all_engines)
    MODEL_MAP = {
        "minilm": "sentence-transformers/all-MiniLM-L6-v2",
        "qwen3": "Qwen/Qwen3-Embedding-0.6B",
    }

    def __init__(
        self,
        space_dir: str | Path,
        prefix: str,
        encoder: SentenceTransformer,
        model_name: str = "minilm",
    ):
        space_dir = Path(space_dir)
        self.model_name = model_name
        self._prefix = prefix
        self.encoder = encoder

        # Load space JSON for term list
        json_gz = space_dir / f"{prefix}.json.gz"
        json_plain = space_dir / f"{prefix}.json"
        if json_gz.exists():
            import gzip
            with gzip.open(json_gz, "rt") as f:
                space_data = json.load(f)
        elif json_plain.exists():
            with open(json_plain) as f:
                space_data = json.load(f)
        else:
            raise FileNotFoundError(f"No space JSON found for {prefix} in {space_dir}")

        self.terms: list[str] = [p["term"] for p in space_data["points"]]
        self.positions_3d = np.array([p["pos"] for p in space_data["points"]], dtype=np.float32)
        self.num_points = len(self.terms)
        self._term_index: dict[str, int] = {t.lower(): i for i, t in enumerate(self.terms)}
        self._bias_cache: dict[tuple[str, str], np.ndarray] = {}
        logger.info("Loaded %d terms from %s", self.num_points, prefix)

        # Load FAISS index
        faiss_path = space_dir / f"{prefix}.faiss"
        self.faiss_index = faiss.read_index(str(faiss_path))
        logger.info("FAISS index: %d vectors", self.faiss_index.ntotal)

        if self.faiss_index.ntotal != self.num_points:
            raise ValueError(
                f"FAISS/space mismatch: FAISS has {self.faiss_index.ntotal} vectors "
                f"but space has {self.num_points} points. "
                f"Rebuild FAISS for {prefix} to fix."
            )

        # Load HD embeddings
        emb_bin = space_dir / f"{prefix}-embeddings.bin"
        emb_meta = space_dir / f"{prefix}-embeddings.json"
        if emb_bin.exists() and emb_meta.exists():
            meta = json.loads(emb_meta.read_text())
            self.hd_embeddings = np.fromfile(str(emb_bin), dtype=np.float32).reshape(
                meta["num_points"], meta["embedding_dim"]
            )
            self.embedding_dim = meta["embedding_dim"]
            logger.info("HD embeddings: %d × %d", *self.hd_embeddings.shape)

            # Ensure L2 normalization (dot products are used as cosine similarities)
            norms = np.linalg.norm(self.hd_embeddings, axis=1, keepdims=True)
            if not np.allclose(norms, 1.0, atol=1e-3):
                logger.warning("HD embeddings not L2-normalized — normalizing at load time")
                self.hd_embeddings /= np.maximum(norms, 1e-10)
        else:
            raise FileNotFoundError(f"HD embeddings not found for {prefix} in {space_dir}")

        # Load ParamPaCMAP model
        param_path = space_dir / f"{prefix}.parampacmap.pt"
        if param_path.exists():
            _patch_annoy()
            os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
            # Verify checksum if sidecar exists (guards against tampered pickle files)
            checksum_path = param_path.with_suffix(".pt.sha256")
            if checksum_path.exists():
                expected = checksum_path.read_text().strip()
                actual = hashlib.sha256(param_path.read_bytes()).hexdigest()
                if actual != expected:
                    raise ValueError(
                        f"Checksum mismatch for {param_path} — file may be corrupted or tampered"
                    )
                logger.info("ParamPaCMAP checksum verified for %s", prefix)
            else:
                raise FileNotFoundError(
                    f"Missing checksum sidecar {checksum_path} — refusing to load "
                    f"untrusted pickle file. Re-run the pipeline to regenerate."
                )
            # weights_only=False required: ParamPaCMAP is saved as a full object (not state_dict).
            self.param_model = torch.load(param_path, weights_only=False)
            logger.info("ParamPaCMAP model loaded from %s", param_path)
        else:
            self.param_model = None
            logger.warning("No ParamPaCMAP model found for %s — transform() unavailable", prefix)

    def _lookup(self, text: str) -> tuple[int, np.ndarray, tuple[float, float, float]] | None:
        """Look up a term in the space. Returns (index, hd_embedding, 3d_pos) or None."""
        i = self._term_index.get(text.strip().lower())
        if i is None:
            return None
        return i, self.hd_embeddings[i], tuple(float(x) for x in self.positions_3d[i])

    def _encode(self, text: str) -> np.ndarray:
        """Encode text to HD embedding vector (L2-normalized)."""
        vec = self.encoder.encode([text], normalize_embeddings=True)
        return vec[0].astype(np.float32)

    def _resolve_pole(self, pole_text: str) -> np.ndarray:
        """Resolve a pole string to an embedding vector.

        For single words, uses _lookup (in-vocab) or _encode (OOV).
        For multi-word strings (e.g. "he him his man"), averages the individual
        word vectors — the correct approach for SemAxis pole construction.
        """
        words = pole_text.strip().lower().split()
        if len(words) <= 1:
            hit = self._lookup(pole_text)
            return hit[1] if hit else self._encode(pole_text)
        vecs = []
        for w in words:
            hit = self._lookup(w)
            vecs.append(hit[1] if hit else self._encode(w))
        avg = np.mean(vecs, axis=0).astype(np.float32)
        norm = np.linalg.norm(avg)
        if norm > 1e-10:
            avg /= norm
        return avg

    def _project(self, hd_vec: np.ndarray) -> tuple[float, float, float]:
        """Project HD vector to 3D via ParamPaCMAP or fallback weighted average."""
        if self.param_model is not None:
            coords = self.param_model.transform(hd_vec.reshape(1, -1))
            return tuple(float(x) for x in coords[0])

        # Fallback: weighted average of K nearest known positions
        vec = hd_vec.reshape(1, -1).copy()
        faiss.normalize_L2(vec)
        D, I = self.faiss_index.search(vec, 10)
        weights = np.exp(D[0] * 5)  # softmax-ish on cosine similarities
        weights /= weights.sum()
        pos = (weights[:, None] * self.positions_3d[I[0]]).sum(axis=0)
        return tuple(float(x) for x in pos)

    def embed_text(self, text: str, k: int = 10) -> tuple[tuple[float, float, float], list[tuple[int, float]]]:
        """Encode text → 3D coords + K nearest neighbors. Uses existing position if term is in space."""
        hit = self._lookup(text)
        if hit:
            idx, hd_vec, coords = hit
            neighbors = self.find_neighbors(idx, k)
            return coords, neighbors
        hd_vec = self._encode(text)
        coords = self._project(hd_vec)
        neighbors = self.find_neighbors_by_vector(hd_vec, k)
        return coords, neighbors

    def find_neighbors(self, index: int, k: int = 10) -> list[tuple[int, float]]:
        """Find K nearest neighbors for an existing point by index."""
        vec = self.hd_embeddings[index : index + 1].copy()
        faiss.normalize_L2(vec)
        D, I = self.faiss_index.search(vec, k + 1)
        # Exclude self
        results = [(int(I[0, j]), float(D[0, j])) for j in range(k + 1) if I[0, j] != index]
        return results[:k]

    def find_neighbors_by_vector(self, hd_vec: np.ndarray, k: int = 10) -> list[tuple[int, float]]:
        """Find K nearest neighbors for an arbitrary HD vector."""
        vec = hd_vec.reshape(1, -1).copy()
        faiss.normalize_L2(vec)
        D, I = self.faiss_index.search(vec, k)
        return [(int(I[0, j]), float(D[0, j])) for j in range(k)]

    def compute_bias_scores(self, pole_a: str, pole_b: str) -> tuple[
        list[tuple[int, str, float]], float, dict[str, float]
    ]:
        """Compute bias score for every term: cos(term, poleB) - cos(term, poleA), normalized to [-1, 1].

        Returns (scores_list, pole_similarity, stats_dict).
        """
        key_a = pole_a.strip().lower()
        key_b = pole_b.strip().lower()

        # Resolve pole embeddings (averages individual word vectors for multi-word poles)
        emb_a = self._resolve_pole(pole_a)
        emb_b = self._resolve_pole(pole_b)

        # Pole similarity (cosine, since embeddings are L2-normalized)
        pole_similarity = float(np.dot(emb_a, emb_b))

        # Get cached scores or compute
        scores = self._bias_scores_cached(key_a, key_b, emb_a, emb_b)

        # Compute stats
        stats = {
            "mean": float(np.mean(scores)),
            "std": float(np.std(scores)),
            "median": float(np.median(scores)),
            "abs_mean": float(np.mean(np.abs(scores))),
        }

        scores_list = [(i, self.terms[i], float(scores[i])) for i in range(len(self.terms))]
        return scores_list, pole_similarity, stats

    def _bias_scores_cached(
        self, pole_a_lower: str, pole_b_lower: str,
        emb_a: np.ndarray, emb_b: np.ndarray,
    ) -> np.ndarray:
        """Cache bias score vectors for repeated pole pairs."""
        key = (pole_a_lower, pole_b_lower)
        if key in self._bias_cache:
            return self._bias_cache[key]

        cos_a = self.hd_embeddings @ emb_a
        cos_b = self.hd_embeddings @ emb_b
        raw_scores = cos_b - cos_a

        max_abs = float(np.abs(raw_scores).max())
        if max_abs < 1e-4:
            # Degenerate axis (poles too similar) — return zeros instead of amplified noise
            result = np.zeros_like(raw_scores)
        else:
            result = raw_scores / max_abs

        # Evict oldest entry if cache is full
        if len(self._bias_cache) >= 32:
            self._bias_cache.pop(next(iter(self._bias_cache)))
        self._bias_cache[key] = result
        return result

    def analogy(self, a: str, b: str, c: str, k: int = 10) -> tuple[str, int, tuple[float, float, float], list[tuple[int, float]], int | None, int | None, int | None]:
        """a is to b as c is to ? → d = b - a + c, find nearest. Uses existing embeddings for known terms.
        Returns (result_term, result_idx, result_coords, neighbors, index_a, index_b, index_c)."""
        hit_a = self._lookup(a)
        hit_b = self._lookup(b)
        hit_c = self._lookup(c)
        emb_a = hit_a[1] if hit_a else self._encode(a)
        emb_b = hit_b[1] if hit_b else self._encode(b)
        emb_c = hit_c[1] if hit_c else self._encode(c)
        emb_d = emb_b - emb_a + emb_c
        emb_d = emb_d / (np.linalg.norm(emb_d) + 1e-10)

        # Exclude input terms from results (standard analogy evaluation practice)
        exclude = set()
        if hit_a: exclude.add(hit_a[0])
        if hit_b: exclude.add(hit_b[0])
        if hit_c: exclude.add(hit_c[0])
        raw_neighbors = self.find_neighbors_by_vector(emb_d, k + len(exclude))
        neighbors = [(idx, dist) for idx, dist in raw_neighbors if idx not in exclude][:k]
        best_idx = neighbors[0][0]
        # Use the existing 3D position of the nearest term, not the projected synthetic vector
        coords = tuple(float(x) for x in self.positions_3d[best_idx])
        return (
            self.terms[best_idx], best_idx, coords, neighbors,
            hit_a[0] if hit_a else None,
            hit_b[0] if hit_b else None,
            hit_c[0] if hit_c else None,
        )

    def compare(self, text_a: str, text_b: str) -> tuple[float, tuple[float, float, float], tuple[float, float, float], int | None, int | None]:
        """Compare two texts: cosine similarity + both 3D coords + found indices. Uses existing positions for known terms."""
        hit_a = self._lookup(text_a)
        hit_b = self._lookup(text_b)
        emb_a = hit_a[1] if hit_a else self._encode(text_a)
        emb_b = hit_b[1] if hit_b else self._encode(text_b)
        similarity = float(np.dot(emb_a, emb_b))
        coords_a = hit_a[2] if hit_a else self._project(emb_a)
        coords_b = hit_b[2] if hit_b else self._project(emb_b)
        return similarity, coords_a, coords_b, (hit_a[0] if hit_a else None), (hit_b[0] if hit_b else None)
