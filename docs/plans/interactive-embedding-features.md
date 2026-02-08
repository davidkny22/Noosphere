# Noosphere — Phase 1 Implementation Plan

## Context

Phase 0 is complete: 10K-point 3D spaces with GL_POINTS rendering, search, fly-to, space switching, auto-orbit. Phase 0.5 rendering enhancements shipped (adaptive sizing, dynamic fog).

Phase 1 adds the core interactive features: real-time embedding of novel queries via ParamRepulsor, a FastAPI backend, client-side Transformers.js fallback, bias probing, and neighborhood exploration. This transforms Noosphere from a static visualizer into an interactive tool where the model navigates itself.

---

## Sprint 1: Pipeline Extensions

**Goal**: Add three new pipeline artifacts — FAISS index, trained ParamRepulsor model, exported HD embeddings matrix.

### New files

**`pipeline/src/faiss_index.py`** — Build `IndexFlatIP` on L2-normalized embeddings (inner product = cosine). Save as `{model}-{n}k.faiss`.

**`pipeline/src/parametric.py`** — Train ParamRepulsor:
```python
from parampacmap import ParamPaCMAP
model = ParamPaCMAP(n_components=3)
coords_3d = model.fit_transform(embeddings)  # learns HD → 3D mapping
# Save via torch (ParamRepulsor is PyTorch-native)
import torch
torch.save(model, f"{output_prefix}.parampacmap.pt")
```
Import is `parampacmap`, class is `ParamPaCMAP()`. Verify: `model.transform(np.random.randn(1, D))` returns shape `(1, 3)` in the same coordinate range as PaCMAP output.

**Pre-Sprint 0 gate**: Before building anything, verify ParamRepulsor installs and runs:
```bash
pip install git+https://github.com/hyhuang00/ParamRepulsor.git
python -c "from parampacmap import ParamPaCMAP; print('OK')"
```
If this fails, fall back to training a custom 3-layer MLP (384→256→128→3) on the PaCMAP input/output pairs. Same API surface, just a different model file.

**`pipeline/src/export_embeddings.py`** — Save HD embeddings as `Float32` binary (`{model}-{n}k-embeddings.bin`) + metadata JSON sidecar. For MiniLM spaces only (client-side fallback needs these for cosine search).

### Modified files

- **`pipeline/pyproject.toml`** — Add `faiss-cpu>=1.7.0`, `parampacmap @ git+https://github.com/hyhuang00/ParamRepulsor.git` (NOT on PyPI — GitHub install only). For MPS support: install extras `.[mps]`.
- **`pipeline/build_space.py`** — Add steps 6-8 after packaging (FAISS, ParamRepulsor, embeddings export). Add `--skip-faiss`, `--skip-parametric` flags.

### Verification

- `uv run build_space.py --model minilm --vocab-size 10000` produces `minilm-10k.faiss`, `minilm-10k.parampacmap.pt`, `minilm-10k-embeddings.bin`
- Same for qwen3
- FAISS: 10-NN query returns in <1ms
- ParamRepulsor: `transform(random_vector)` returns coordinates in [-50, 50] range

---

## Sprint 2: FastAPI Backend

**Goal**: Stateless API server loading Qwen3, ParamRepulsor, and FAISS index.

### New files

**`server/pyproject.toml`** — deps: fastapi, uvicorn, sentence-transformers, torch, faiss-cpu, `parampacmap @ git+https://github.com/hyhuang00/ParamRepulsor.git`, numpy, pydantic

**`server/app/main.py`** — FastAPI app, loads resources at startup, CORS middleware for dev.

**`server/app/engine.py`** — `SpaceEngine` class:
- `embed_text(text) → (hd_embedding, coords_3d)` — Qwen3 encode → ParamRepulsor transform
- `find_neighbors(embedding, k) → [(index, distance)]` — FAISS search
- `compute_bias_scores(pole_a_emb, pole_b_emb) → float[N]` — `cos(term, poleB) - cos(term, poleA)` normalized to [-1, 1]
- `analogy(a, b, c) → (term, index, coords_3d)` — `d = b - a + c`, FAISS nearest, project

**`server/app/models.py`** — Pydantic schemas matching the frontend `EmbeddingService` interface.

**`server/app/routes.py`** — Endpoints:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | `{"status":"ok","model":"qwen3","num_points":10000}` |
| POST | `/embed` | text → 3D coords + K neighbors |
| POST | `/neighbors` | point index → K nearest in HD via FAISS |
| POST | `/bias` | two poles → N scores in [-1, 1] |
| POST | `/analogy` | A, B, C → result term + 3D coords + neighbors |
| POST | `/compare` | two texts → similarity + both 3D coords |

### Verification

- `cd server && uv run serve` loads without error
- `curl localhost:8000/health` → 200
- `curl -X POST localhost:8000/embed -d '{"text":"black hole"}'` → valid 3D coords near astrophysics cluster
- `/embed` < 200ms, `/neighbors` < 10ms, `/bias` < 500ms

---

## Sprint 3: Frontend Embedding Service

**Goal**: Implement both `RemoteEmbeddingService` and `LocalEmbeddingService`, wire into store with auto-detection.

### New files

**`web/src/services/remoteEmbeddingService.ts`** — Calls FastAPI endpoints. Straightforward fetch wrapper implementing `EmbeddingService`.

**`web/src/services/localEmbeddingService.ts`** — Runs MiniLM in-browser via `@huggingface/transformers`:
- Loads MiniLM pipeline (~80MB, cached by browser)
- Fetches pre-computed embeddings binary for cosine search
- 3D projection without ParamRepulsor: find K=10 nearest vocab terms by cosine similarity, weighted-average their 3D positions (weights = softmax of similarities)
- Brute-force cosine for 10K×384 is ~15ms — fine for interactive use

**`web/src/services/serviceFactory.ts`** — `createEmbeddingService(mode, spaceUrl, serverUrl)`:
- `'auto'`: try `GET /health` with 2s timeout, fall back to local
- `'remote'` / `'local'`: force specific mode

### Modified files

- **`web/package.json`** — Add `@huggingface/transformers`
- **`web/src/store/useSpaceStore.ts`** — Add: `embeddingService`, `serviceMode`, `serviceStatus`, `biasScores`, `neighborIndices`, `neighborCenter`
- **`web/src/hooks/useSpaceLoader.ts`** — After space loads, init embedding service via factory

### Verification

- With server running: auto-detects remote, `embed("black hole")` returns valid coords
- Without server: falls back to local, MiniLM downloads, same call works (slower)

---

## Sprint 4: Semantic Teleport + Neighborhood View

**Goal**: Type arbitrary text → embed → fly to 3D position. Click point → see K nearest neighbors with connecting lines.

### New files

**`web/src/components/NeighborLines.tsx`** — R3F `THREE.LineSegments` between center point and neighbors. Transparent white lines with distance fade. Reads `neighborIndices`/`neighborCenter` from store.

### Modified files

- **`web/src/components/SearchBar.tsx`** — When query has no exact Fuse.js match, show "Teleport to [query]" option. Selecting it calls `embeddingService.embed(query)` → `flyTo(result.coords_3d)`.
- **`web/src/components/InfoPanel.tsx`** — Add "Show Neighbors" button. Calls `embeddingService.neighbors()`, stores results, switches to `neighborhood` color mode.
- **`web/src/systems/colorSystem.ts`** — Implement `neighborhood` mode: center = white, neighbors = cluster colors, rest = dim.
- **`web/src/components/SpaceCanvas.tsx`** — Add `<NeighborLines />`.
- **`web/src/components/PointCloud.tsx`** — Pass `neighborIndices`/`neighborCenter` to `computeColors`.

### Verification

- Type "black hole" → "Teleport to black hole" appears → click → camera flies near space/physics terms
- Type "asdfghjkl" → still projects to 3D, but nearest neighbor is far → show "low confidence" indicator (dim projected point, dotted lines to distant neighbors, tooltip: "this input is far from known concepts")
- Click any point → "Show Neighbors" → lines appear, neighbor points brighten, rest dims
- Click background → neighborhood clears

---

## Sprint 5: Bias Probe

**Goal**: Pick two pole concepts, recolor entire space on a red↔blue gradient.

### New files

**`web/src/components/BiasProbePanel.tsx`** — Two text inputs (Pole A, Pole B), "Probe" button, color legend. Calls `embeddingService.biasProbe()`, stores scores, sets `colorMode` to `bias_gradient`. "Clear" restores cluster coloring.

### Modified files

- **`web/src/systems/colorSystem.ts`** — Implement `bias_gradient` mode: score -1 → red `[0.9, 0.2, 0.2]`, 0 → gray `[0.5, 0.5, 0.5]`, +1 → blue `[0.2, 0.4, 0.9]`. Smooth interpolation.
- **`web/src/components/PointCloud.tsx`** — Pass `biasScores` to `computeColors` in bias mode.
- **`web/src/App.tsx`** — Add `<BiasProbePanel />`.

### Verification

- "science" vs "art" → STEM terms red, art terms blue
- "male" vs "female" → profession bias visible
- Clear → cluster colors restore

---

## Sprint 6: Intro Animation + Mode Toggle

**Goal**: Orb-pulse → expansion animation on load. Beginner/advanced mode toggle.

### New files

**`web/src/components/IntroAnimation.tsx`** — Animates position buffer: all points start at origin, pulse 2-3 times, then expand to PaCMAP positions over ~2s (ease-out-cubic). Uses `useFrame` to lerp positions. **Critical**: During animation, gate all user interaction — disable raycasting, click handlers, search highlighting, and point selection. The position buffer is mid-lerp so raycasting would hit points at wrong positions. Set `introState: 'animating' | 'done'` in store; PointCloud checks this before enabling pointer events.

**`web/src/components/ModeToggle.tsx`** — Toggle button (bottom-right). Beginner hides bias probe, advanced fields in InfoPanel. Advanced shows everything. Persisted via Zustand `persist` middleware (cleaner than raw localStorage, already using Zustand).

### Modified files

- **`web/src/store/useSpaceStore.ts`** — Add `introState`, `isAdvancedMode`, `toggleAdvancedMode`
- **`web/src/App.tsx`** — Add `<ModeToggle />`, conditionally render `<BiasProbePanel />` on advanced mode
- **`web/src/components/InfoPanel.tsx`** — Conditionally show coordinates, neighbors button on advanced mode
- **`web/src/components/SpaceCanvas.tsx`** — Integrate `<IntroAnimation />`

### Verification

- Fresh load: orb pulses at origin, expands to final positions, auto-orbit begins
- Beginner mode: bias probe hidden, InfoPanel simplified
- Advanced mode: all features visible

---

## Build Order & Dependencies

```
Sprint 1 (Pipeline) → Sprint 2 (Server) → Sprint 3 (Services) ─┬→ Sprint 4 (Teleport + Neighbors)
                                                                  ├→ Sprint 5 (Bias Probe)
                                                                  └→ Sprint 6 (Intro + Mode Toggle)
```

Sprints 4 and 5 can be parallelized after Sprint 3. Sprint 6 depends on 4+5 for mode-aware feature hiding.

## New Files Summary

```
pipeline/src/faiss_index.py
pipeline/src/parametric.py
pipeline/src/export_embeddings.py
server/                           (entirely new)
  pyproject.toml
  app/__init__.py
  app/main.py
  app/engine.py
  app/models.py
  app/routes.py
web/src/services/remoteEmbeddingService.ts
web/src/services/localEmbeddingService.ts
web/src/services/serviceFactory.ts
web/src/components/NeighborLines.tsx
web/src/components/BiasProbePanel.tsx
web/src/components/IntroAnimation.tsx
web/src/components/ModeToggle.tsx
```

## Key Risks

1. **ParamRepulsor availability** — NOT on PyPI. Install from GitHub: `pip install git+https://github.com/hyhuang00/ParamRepulsor.git`. Resolve before Sprint 1 starts — run the pre-sprint gate check. If install or fit/transform fails, fall back to custom MLP.
2. **Transformers.js download** — MiniLM is ~80MB. Show progress indicator. Browser caches after first load.
3. **CORS** — Vite dev server (5173) → FastAPI (8000). Add `CORSMiddleware` in FastAPI for dev.
4. **Local 3D projection accuracy** — Weighted-average of nearest known positions is lossy. Acceptable as fallback; remote + ParamRepulsor is the primary path.
5. **PaCMAP subprocess isolation** — ParamRepulsor is PyTorch-native, shouldn't conflict. Verify early.
6. **Novel text in empty space** — ParamRepulsor will always output coordinates, even for gibberish. When nearest neighbor distance exceeds a threshold (e.g., 2x median vocab distance), show low-confidence indicator in the UI.
7. **Intro animation interaction gating** — Position buffer is mid-lerp during animation. All pointer events, raycasting, search, and selection must be disabled until animation completes. Controlled via `introState` in store.
