"""SpaceEngine — loads model artifacts and provides embedding/search/bias operations."""
from __future__ import annotations

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

    def __init__(
        self,
        space_dir: str | Path,
        model_name: str = "qwen3",
        space_prefix: str | None = None,
    ):
        space_dir = Path(space_dir)
        self.model_name = model_name

        # Discover artifact prefix (e.g., "qwen3-10k")
        if space_prefix:
            # Explicit prefix — deterministic
            prefix = space_prefix
            faiss_path = space_dir / f"{prefix}.faiss"
            if not faiss_path.exists():
                raise FileNotFoundError(f"FAISS index not found: {faiss_path}")
        else:
            # Legacy glob discovery — picks first match (non-deterministic)
            faiss_files = list(space_dir.glob(f"{model_name}-*.faiss"))
            if not faiss_files:
                raise FileNotFoundError(f"No FAISS index found for {model_name} in {space_dir}")
            prefix = faiss_files[0].stem
            logger.warning(
                "No explicit space prefix — glob matched %d files, using '%s'. "
                "Set NOOSPHERE_SPACE_PREFIX for deterministic behavior.",
                len(faiss_files), prefix,
            )
        self._prefix = prefix

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
        logger.info("Loaded %d terms from %s", self.num_points, prefix)

        # Load FAISS index
        self.faiss_index = faiss.read_index(str(faiss_files[0]))
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
        else:
            raise FileNotFoundError(f"HD embeddings not found for {prefix} in {space_dir}")

        # Load ParamPaCMAP model
        param_path = space_dir / f"{prefix}.parampacmap.pt"
        if param_path.exists():
            _patch_annoy()
            os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"
            self.param_model = torch.load(param_path, weights_only=False)
            logger.info("ParamPaCMAP model loaded from %s", param_path)
        else:
            self.param_model = None
            logger.warning("No ParamPaCMAP model found — transform() unavailable")

        # Load sentence transformer for encoding novel text
        model_map = {
            "minilm": "sentence-transformers/all-MiniLM-L6-v2",
            "qwen3": "Qwen/Qwen3-Embedding-0.6B",
        }
        model_id = model_map[model_name]
        logger.info("Loading sentence transformer: %s", model_id)
        self.encoder = SentenceTransformer(model_id)
        logger.info("Encoder ready")

    def _encode(self, text: str) -> np.ndarray:
        """Encode text to HD embedding vector (L2-normalized)."""
        vec = self.encoder.encode([text], normalize_embeddings=True)
        return vec[0].astype(np.float32)

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
        """Encode text → 3D coords + K nearest neighbors."""
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

    def compute_bias_scores(self, pole_a: str, pole_b: str) -> list[tuple[int, str, float]]:
        """Compute bias score for every term: cos(term, poleB) - cos(term, poleA), normalized to [-1, 1]."""
        emb_a = self._encode(pole_a)
        emb_b = self._encode(pole_b)

        # Cosine similarity (embeddings are already L2-normalized in FAISS index)
        cos_a = self.hd_embeddings @ emb_a  # (N,)
        cos_b = self.hd_embeddings @ emb_b  # (N,)
        raw_scores = cos_b - cos_a  # positive = closer to B

        # Normalize to [-1, 1]
        max_abs = max(np.abs(raw_scores).max(), 1e-10)
        scores = raw_scores / max_abs

        return [(i, self.terms[i], float(scores[i])) for i in range(len(self.terms))]

    def analogy(self, a: str, b: str, c: str, k: int = 10) -> tuple[str, int, tuple[float, float, float], list[tuple[int, float]]]:
        """a is to b as c is to ? → d = b - a + c, find nearest."""
        emb_a = self._encode(a)
        emb_b = self._encode(b)
        emb_c = self._encode(c)
        emb_d = emb_b - emb_a + emb_c
        emb_d = emb_d / (np.linalg.norm(emb_d) + 1e-10)

        neighbors = self.find_neighbors_by_vector(emb_d, k)
        best_idx = neighbors[0][0]
        coords = self._project(emb_d)
        return self.terms[best_idx], best_idx, coords, neighbors

    def compare(self, text_a: str, text_b: str) -> tuple[float, tuple[float, float, float], tuple[float, float, float]]:
        """Compare two texts: cosine similarity + both 3D coords."""
        emb_a = self._encode(text_a)
        emb_b = self._encode(text_b)
        similarity = float(np.dot(emb_a, emb_b))
        coords_a = self._project(emb_a)
        coords_b = self._project(emb_b)
        return similarity, coords_a, coords_b
