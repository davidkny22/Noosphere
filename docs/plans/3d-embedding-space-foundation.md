# Noosphere Phase 0 — Implementation Plan

## Context

Noosphere is a 3D interactive visualization of AI embedding spaces. Phase 0 is the foundation: build a Python CLI pipeline that converts a vocabulary + embedding model into a navigable 3D space JSON file, then build a React Three Fiber frontend that renders it with orbit controls, point interaction, and text search with fly-to animation.

**Milestone:** "You can fly around an AI's concept space in a browser."

---

## Project Structure

```
Noosphere/
├── .gitignore
├── README.md
├── pipeline/                          # Python space generation CLI
│   ├── pyproject.toml                 # uv project config
│   ├── build_space.py                 # CLI entry point
│   ├── src/
│   │   ├── __init__.py
│   │   ├── types.py                   # Shared dataclasses for inter-step contracts
│   │   ├── vocab.py                   # Step 1: Vocabulary assembly
│   │   ├── embed.py                   # Step 2: Bulk embedding
│   │   ├── reduce.py                  # Step 3: PaCMAP → 3D
│   │   ├── cluster.py                # Step 4: HDBSCAN + labeling
│   │   └── package.py                # Step 5: JSON output
│   └── data/
│       ├── sources/                   # Raw vocabulary files
│       │   ├── google_20k.txt
│       │   └── curated_concepts.txt
│       └── cache/                     # Embedding cache (gitignored)
├── web/                               # React frontend
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   ├── public/
│   │   └── spaces/                    # Generated space JSON files
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── types/
│       │   └── space.ts               # TS types matching pipeline output
│       ├── store/
│       │   └── useSpaceStore.ts       # Zustand state
│       ├── components/
│       │   ├── SpaceCanvas.tsx        # R3F Canvas + scene setup
│       │   ├── PointCloud.tsx         # InstancedMesh rendering (core)
│       │   ├── PointLabel.tsx         # Html tooltip on hover/select
│       │   ├── ClusterLabels.tsx      # Floating cluster name labels
│       │   ├── SearchBar.tsx          # Search input + dropdown
│       │   ├── InfoPanel.tsx          # Selected point metadata
│       │   ├── CameraAnimator.tsx     # Fly-to camera animation
│       │   └── LoadingScreen.tsx
│       ├── hooks/
│       │   ├── useSpaceLoader.ts      # Fetch + decompress space JSON
│       │   ├── useSearch.ts           # Fuse.js fuzzy search
│       │   └── useLOD.ts             # LOD interface (fog impl for Phase 0)
│       ├── services/
│       │   └── embeddingService.ts    # Phase 1 stub: EmbeddingService interface
│       ├── systems/
│       │   └── colorSystem.ts         # Multi-mode color management
│       └── utils/
│           ├── color.ts               # Color helpers
│           └── math.ts                # Vector/easing helpers
```

---

## Part 1: Python Pipeline

### Environment: `uv` with `pyproject.toml`
- `uv init` in `pipeline/`, dependencies declared in `pyproject.toml`
- `uv run build_space.py` to execute
- Device auto-detection: try CUDA → MPS → CPU (support both NVIDIA and Apple Silicon)

### Dependencies (in pyproject.toml)
- `sentence-transformers` — model loading + batch encoding
- `torch` — with MPS (Apple Silicon) and CUDA (NVIDIA) support
- `pacmap` — dimensionality reduction (3D)
- `scikit-learn` — HDBSCAN clustering
- `numpy`, `click`, `tqdm`, `pydantic`

### Data Contracts Between Pipeline Steps

Every pipeline step communicates through explicit dataclasses defined in `src/types.py`. This keeps the pipeline modular and model-agnostic — swapping models or reduction algorithms only requires the same shapes in and out.

```python
# src/types.py
from dataclasses import dataclass, field
import numpy as np

@dataclass
class VocabularyResult:
    """Output of Step 1."""
    terms: list[str]                    # deduplicated, filtered terms
    source_counts: dict[str, int]       # {"google_20k": 8234, "curated": 1766}

@dataclass
class EmbeddingResult:
    """Output of Step 2."""
    terms: list[str]                    # same order as vocabulary
    embeddings: np.ndarray              # shape (N, D) where D is model-dependent
    model_name: str                     # e.g. "minilm" or "qwen3"
    model_id: str                       # HuggingFace model ID
    embedding_dim: int                  # 384 for MiniLM, 1024 for Qwen3
    device_used: str                    # "cuda", "mps", or "cpu"

@dataclass
class ReductionResult:
    """Output of Step 3."""
    positions_3d: np.ndarray            # shape (N, 3), normalized to [-50, 50]
    pacmap_params: dict                 # {"n_neighbors": 15, "MN_ratio": 0.5, ...}
    coordinate_range: tuple[float, float]  # actual min/max after normalization
    outlier_indices: list[int]          # indices of points beyond 95th percentile before clamping

@dataclass
class ClusterResult:
    """Output of Step 4."""
    labels: np.ndarray                  # shape (N,), cluster IDs, -1 = noise
    clusters: list[ClusterInfo]
    noise_count: int                    # how many points labeled -1
    hdbscan_params: dict                # parameters used

@dataclass
class ClusterInfo:
    """Metadata for a single cluster."""
    id: int
    label: str                          # medoid term
    representative_terms: list[str]     # top-5 closest to centroid
    size: int
    centroid_3d: list[float]            # [x, y, z]
```

Each step function takes the previous step's result as input and returns the next:
```python
def assemble_vocabulary(target_size: int) -> VocabularyResult
def embed_vocabulary(vocab: VocabularyResult, model: str, device: str) -> EmbeddingResult
def reduce_to_3d(embedding: EmbeddingResult, **pacmap_kwargs) -> ReductionResult
def cluster_points(embedding: EmbeddingResult, reduction: ReductionResult) -> ClusterResult
def package_space(embedding: EmbeddingResult, reduction: ReductionResult, cluster: ClusterResult, ...) -> str
```

The `embedding_dim` propagates automatically — Step 3 reads the shape of `EmbeddingResult.embeddings` and Step 4 clusters on the full HD vectors regardless of dimensionality. No model-specific branching.

---

### Step 1: Vocabulary Assembly (`src/vocab.py`)

**Sources:**
- Source 1: Google 20K English frequency list (download from GitHub, filter stopwords/single chars/numbers)
- Source 2: Curated concept list I'll assemble (~2K terms) covering:
  - Science & tech (photosynthesis, quantum, recursion, neural network, entropy...)
  - Philosophy & abstract (consciousness, epistemology, nihilism, free will...)
  - Emotions & psychology (melancholy, euphoria, anxiety, resilience...)
  - Professions (engineer, nurse, CEO, teacher, artist, surgeon...)
  - Identity & demographics (gender terms, nationalities, religions...)
  - Arts & culture (renaissance, jazz, impressionism, sonnet...)
  - Nature & geography (tundra, coral reef, monsoon, archipelago...)
- Normalize (lowercase, strip), deduplicate, cap at target size
- Start with **10K terms** for fast iteration, scale to 100K+ later

**Filtering:**
```python
STOPWORDS = {...}  # ~150 common English stopwords

def filter_term(term: str) -> bool:
    if len(term) < 2: return False
    if term.isnumeric(): return False
    if term in STOPWORDS: return False
    if not term.isascii(): return False  # Phase 0: ASCII only
    return True
```

**Error handling:**
- If Google 20K file is missing or fails to download, fall back to curated list only and warn
- If total vocabulary after filtering is below `target_size`, warn and proceed with what we have (no padding with junk)
- Log source contribution counts via `VocabularyResult.source_counts` so we can see the mix

---

### Step 2: Bulk Embedding (`src/embed.py`)

**Device auto-detection:**
```python
def detect_device(requested: str = "auto") -> str:
    if requested != "auto":
        return requested
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"
```

**Model loading:**
```python
MODEL_MAP = {
    "minilm": "sentence-transformers/all-MiniLM-L6-v2",   # 384-dim, 22MB
    "qwen3": "Qwen/Qwen3-Embedding-0.6B",                 # 1024-dim, 1.2GB
}
```

Load via `SentenceTransformer(model_id, device=device)`. Encode with `model.encode(terms, batch_size=batch_size, normalize_embeddings=True, show_progress_bar=True)`.

**Caching:** Save embeddings to `pipeline/data/cache/{model_name}_{N}_embeddings.npy`. If cache exists and term count matches, skip re-embedding. This is critical during development — PaCMAP parameter tuning shouldn't require re-embedding each time.

**Error handling:**
- If model download fails (network error, disk space), catch `OSError`/`HTTPError`, print clear error with model name and size, exit cleanly
- If MPS device causes issues (known with some torch versions), catch `RuntimeError` and fall back to CPU with a warning
- Validate output shape: `assert embeddings.shape == (len(terms), model.get_sentence_embedding_dimension())`

---

### Step 3: PaCMAP Reduction (`src/reduce.py`)

**Parameter choices:**
```python
def reduce_to_3d(
    embedding: EmbeddingResult,
    n_neighbors: int = 15,     # Higher than default 10 — embedding spaces benefit from
                                # more neighbor context to preserve global cluster structure.
                                # 10 is too local; 30 starts to smear fine distinctions.
                                # 15-20 is the sweet spot for semantic embeddings.
    mn_ratio: float = 0.5,     # Default. Controls mid-near pair balance.
    fp_ratio: float = 2.0,     # Default. Controls repulsion strength.
) -> ReductionResult:
```

All three parameters exposed as CLI flags for experimentation:
```
--pacmap-neighbors 15    # default 15, range 5-50
--pacmap-mn-ratio 0.5    # default 0.5
--pacmap-fp-ratio 2.0    # default 2.0
```

**Coordinate normalization and outlier handling:**

After PaCMAP produces raw 3D coordinates:
1. Center at origin: `positions -= positions.mean(axis=0)`
2. Compute the 95th percentile of absolute coordinate values
3. Scale so 95th percentile maps to 50.0: `positions = positions / p95 * 50.0`
4. Record which points exceed the [-50, 50] box as outliers (these are concepts the model places far from everything else)
5. **Do NOT clamp outliers.** Isolated concepts are potentially interesting ("why is this so far from everything?"). They'll be visible as distant stars in the visualization. The fog naturally fades them at extreme distances. If they cause camera/navigation issues, we address that in the frontend (fly-to logic accounts for distant targets).

**Degenerate output detection:**
- If `np.isnan(positions).any()`: PaCMAP failed. Log the parameters used and retry with different `n_neighbors` (try 10, then 20). If all retries fail, exit with error.
- If `np.std(positions) < 1e-6`: Points collapsed to a single location. This means PaCMAP converged badly. Same retry strategy.
- If the 95th percentile is 0 (all points at origin): same as collapse.

---

### Step 4: Clustering (`src/cluster.py`)

HDBSCAN on **HD embeddings** (not 3D positions). HD space preserves the full semantic structure that PaCMAP lossy-compressed.

```python
from sklearn.cluster import HDBSCAN

def cluster_points(
    embedding: EmbeddingResult,
    reduction: ReductionResult,
    min_cluster_size: int = 50,    # Exposed as CLI flag
    min_samples: int = 10,
) -> ClusterResult:
```

**Medoid labeling:** For each cluster, find the term whose HD embedding is closest to the cluster's HD centroid. This term becomes the cluster label. Also collect top-5 most central terms as `representative_terms`.

**3D centroid:** Average of 3D positions of all points in the cluster. Used for floating label placement in the frontend.

**Noise handling:** Points with label -1 (noise) are rendered in the frontend with a neutral gray color and no cluster association. At 10K points with `min_cluster_size=50`, expect 20-50 clusters and 5-15% noise points.

---

### Step 5: Packaging (`src/package.py`)

**Pydantic SpaceManifest model → JSON → optional gzip:**
- Per-point: `{term, pos: [x,y,z], cluster}`
- Per-cluster: `{id, label, representative_terms, size, centroid: [x,y,z]}`
- Metadata: `{version, model, model_full, embedding_dim, num_points, num_clusters}`
- Also include: `pacmap_params` and `hdbscan_params` so the frontend can display pipeline settings and so we can reproduce the exact run
- Coordinates rounded to 3 decimal places (0.001 precision in a [-50,50] space = 100K distinct positions per axis, far beyond visual resolution)
- 10K points ≈ 500KB raw, ~150KB gzipped

**Validation before writing:** Spot-check that num_points matches len(points), all positions are finite, all cluster IDs reference a valid cluster or -1.

---

### CLI (`build_space.py`)

```
uv run build_space.py --model minilm --vocab-size 10000 --output web/public/spaces/
uv run build_space.py --model qwen3  --vocab-size 10000 --output web/public/spaces/
```

Full flag list:
```
--model [minilm|qwen3]         # Required
--vocab-size INT               # Default 10000
--output PATH                  # Default web/public/spaces/
--device [auto|cuda|mps|cpu]   # Default auto
--batch-size INT               # Default 512
--pacmap-neighbors INT         # Default 15
--pacmap-mn-ratio FLOAT        # Default 0.5
--pacmap-fp-ratio FLOAT        # Default 2.0
--hdbscan-min-cluster INT      # Default 50
--compress / --no-compress     # Default compress
--cache-dir PATH               # Default pipeline/data/cache/
```

Each step prints a summary line: `Step 2/5: Embedding 10000 terms with minilm on mps... done (47s)`.

---

### What's Deferred from Pipeline to Phase 1
- ParamRepulsor parametric projection training (needed for real-time novel query embedding)
- FAISS index (needed for HD nearest neighbor search)
- LLM-based cluster labeling (medoid heuristic is sufficient for now)
- ConceptNet vocabulary source (Google 20K + curated list is enough for 10K)

---

## Part 2: React Frontend

### Dependencies
- `react`, `react-dom` — UI framework
- `three`, `@react-three/fiber` (v9), `@react-three/drei` — 3D rendering
- `zustand` — state management (R3F-recommended, avoids render loop re-renders)
- `fuse.js` — fuzzy text search over vocabulary
- `pako` — gzip decompression in browser
- `tailwindcss` — UI overlay styling

---

### Color System (`src/systems/colorSystem.ts`)

The InstancedMesh needs to support multiple coloring modes without refactoring the rendering code. Phase 0 uses cluster coloring and search highlighting. Phase 1 adds bias probe gradients. The color system is the abstraction that makes this clean.

```typescript
// Color modes the system supports. Phase 0 implements 'cluster' and 'highlight'.
// Phase 1 adds 'bias_gradient' and 'neighborhood'.
type ColorMode = 'cluster' | 'highlight' | 'bias_gradient' | 'neighborhood';

interface ColorSystem {
  // Compute color for every point given current mode and parameters.
  // Returns a Float32Array of RGB triplets (length = N * 3).
  computeColors(
    points: PointData[],
    clusters: ClusterData[],
    mode: ColorMode,
    params: ColorParams
  ): Float32Array;
}

interface ColorParams {
  // For 'cluster' mode (Phase 0)
  clusterPalette?: Map<number, [number, number, number]>;  // cluster ID → RGB

  // For 'highlight' mode (Phase 0)
  highlightedIndices?: Set<number>;
  dimColor?: [number, number, number];    // RGB for non-highlighted points
  dimScale?: number;                       // scale multiplier for dimmed points

  // For 'bias_gradient' mode (Phase 1 stub)
  biasScores?: Float32Array;              // per-point score [-1, 1]
  poleAColor?: [number, number, number];
  poleBColor?: [number, number, number];

  // For 'neighborhood' mode (Phase 1 stub)
  neighborIndices?: Set<number>;
  centerIndex?: number;
}
```

**Cluster color assignment:** Generate a palette using evenly-spaced hues with consistent saturation/lightness. Noise points (cluster -1) get neutral gray `(0.35, 0.35, 0.35)`.

```typescript
function buildClusterPalette(clusters: ClusterData[]): Map<number, [number, number, number]> {
  const palette = new Map<number, [number, number, number]>();
  const goldenAngle = 137.508;  // degrees — golden angle produces maximally distinct hues
  clusters.forEach((c, i) => {
    const hue = (i * goldenAngle) % 360;
    const [r, g, b] = hslToRgb(hue / 360, 0.7, 0.55);
    palette.set(c.id, [r, g, b]);
  });
  palette.set(-1, [0.35, 0.35, 0.35]);
  return palette;
}
```

Golden angle spacing (137.508°) produces maximally distinct hues for any number of clusters, unlike equal division which can produce adjacent similar colors.

**How color updates flow:**
1. Color mode changes (e.g., search starts → 'highlight' mode)
2. `colorSystem.computeColors()` produces new Float32Array
3. PointCloud copies to `instancedMesh.instanceColor.array` and sets `needsUpdate = true`
4. This happens at most once per user action, not per frame

---

### Fly-To Camera Animation (`src/components/CameraAnimator.tsx`)

This is the signature interaction. When the user searches for a concept or clicks a search result, the camera sweeps smoothly from its current position to the target point. It needs to feel cinematic — not jerky, not sluggish.

**Animation mechanics:**

The camera animation interpolates both position and look-at target simultaneously using an ease-out curve. This produces a "decelerating approach" feel — fast departure, smooth arrival.

```typescript
// Easing function: cubic ease-out (fast start, gradual deceleration)
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
```

**Camera placement:** The camera doesn't fly TO the point — it flies to a position NEAR the point, looking AT it. The offset is computed from the direction of approach:

```typescript
function computeCameraTarget(
  currentPos: THREE.Vector3,
  destination: THREE.Vector3,
  offsetDistance: number = 15
): { cameraPos: THREE.Vector3; lookAt: THREE.Vector3 } {
  // Maintain the user's general viewing angle by using their current
  // approach direction. This prevents disorienting flips.
  const direction = new THREE.Vector3()
    .subVectors(currentPos, destination)
    .normalize();

  // If the camera is directly on top of the point (degenerate case),
  // pick an arbitrary offset direction
  if (direction.length() < 0.001) {
    direction.set(0, 0, 1);
  }

  return {
    cameraPos: destination.clone().add(direction.multiplyScalar(offsetDistance)),
    lookAt: destination.clone(),
  };
}
```

**Animation state machine:**
```
IDLE → user triggers flyTo → ANIMATING → arrives within threshold → SETTLING → 10 frames → IDLE
```

- **IDLE**: OrbitControls has full authority.
- **ANIMATING**: Each frame, `t` increments by `deltaTime / duration`. Camera position and OrbitControls.target both lerp from start to end using `easeOutCubic(t)`. Duration is distance-dependent: `clamp(distance * 0.03, 0.8, 3.0)` seconds (nearby = fast, far = longer, never more than 3s).
- **SETTLING**: Animation reached `t >= 1`. Hold for 10 frames to let OrbitControls damping stabilize. Then transition to IDLE.

**Interruption handling:**
- If the user scrolls, clicks, or drags during ANIMATING: immediately cancel the animation, jump to IDLE. The camera stays wherever it is. OrbitControls takes over from the current position. No jarring snap.
- If the user triggers a NEW fly-to during ANIMATING: cancel current animation, start new one from current (mid-flight) position. No need to finish the first trip.
- Detection: In the `useFrame` loop, check if OrbitControls reports user interaction (`controls.enableRotate` is still true, so we detect input via a pointerdown listener that sets an `interrupted` flag).

**For outlier/distant points:** If the target is beyond the fog range (> 200 units from origin), the fly-to duration extends proportionally, and the fog far plane temporarily pushes out during the approach so the destination is visible on arrival. After settling, fog returns to normal — but the point is now "near" and visible.

---

### LOD System (`src/hooks/useLOD.ts`)

**Phase 0 implementation: Fog-based.**

For 10K points, all instances render every frame (single InstancedMesh draw call = trivially fast). Fog handles visual simplification — distant points fade to background color. This is purely aesthetic, not a performance optimization.

```typescript
interface LODSystem {
  // Called once per frame with the current camera.
  // Returns which indices should be visible and at what detail level.
  update(camera: THREE.Camera): LODResult;

  // Returns the current fog configuration.
  getFogConfig(): { near: number; far: number; color: string };
}

interface LODResult {
  // Which point indices are "near" enough to show labels on hover
  labelCandidates: Set<number>;
  // Which point indices should render at all (Phase 0: all of them)
  visibleIndices: Set<number> | 'all';
  // Scale factor per point (Phase 0: uniform 1.0)
  scales: Float32Array | null;
}
```

**Phase 0 constants:**
- Fog color: `#0a0a0a` (matches background)
- Fog near: 60 (points start fading)
- Fog far: 200 (fully invisible)
- Label candidates: points within 40 units of camera

**Why fog breaks at 100K+ (Phase 1 problem):**
- The InstancedMesh draw call sends ALL instances to the GPU every frame, even if fogged out. At 100K+, the bottleneck shifts from pixel fill to vertex processing.
- HTML labels (Drei `<Html>`) create DOM elements. Even rendering 50 cluster labels causes layout thrashing. At 200+ clusters, this dominates frame time.
- Phase 1 solution: frustum culling via spatial index (octree), instance-level visibility toggling, and shader-based text labels (SDF) instead of HTML.

---

### PointCloud Rendering (`src/components/PointCloud.tsx`)

**Geometry:** `sphereGeometry(0.15, 8, 6)` — radius 0.15 units, 8 width segments, 6 height segments = 48 triangles per instance. At 10K instances = 480K triangles total, well within budget.

**Material:** `meshStandardMaterial` with `vertexColors={true}`. Each instance's color comes from `setColorAt()`. The material is set once; color changes happen by updating the instance color buffer.

**Initialization flow:**
1. Space loads → PointCloud mounts
2. `useEffect` iterates all points, calls `setMatrixAt(i, matrix)` and `setColorAt(i, color)` for each
3. Sets `instanceMatrix.needsUpdate = true` and `instanceColor.needsUpdate = true`
4. GPU uploads the buffers once
5. Subsequent color changes (search, mode switch) only update `instanceColor` buffer

**Click/hover via raycasting:**
R3F's built-in raycaster works with InstancedMesh. The `onClick` event includes `event.instanceId` — the index of the instance hit. Same for `onPointerOver`.

**How search highlighting works (color update path):**
1. User types in SearchBar → Fuse.js returns matching indices
2. Store updates `highlightedIndices: Set<number>`
3. PointCloud subscribes to `highlightedIndices` via `useEffect` with Zustand `subscribe()`
4. On change, the color system recomputes the full color buffer:
   - Highlighted points: their normal cluster color at full brightness
   - Non-highlighted points: `(0.12, 0.12, 0.15)` (very dim, slightly blue-tinted so they're visible but recessive)
5. Additionally, highlighted points scale up to 2.0x and non-highlighted scale down to 0.6x via `setMatrixAt()` transform updates
6. Both `instanceMatrix.needsUpdate` and `instanceColor.needsUpdate` set to true
7. When search clears (`highlightedIndices` becomes empty set), restore all points to cluster colors and uniform scale

This is a full-buffer update on each search change, not a per-frame operation. For 10K points, updating 10K matrix and color entries takes <5ms — imperceptible.

---

### Zustand Store (`src/store/useSpaceStore.ts`)

```typescript
interface SpaceState {
  // Data
  space: SpaceManifest | null;
  loading: boolean;
  error: string | null;

  // Selection
  selectedPoint: PointData | null;
  hoveredPoint: PointData | null;

  // Search
  highlightedIndices: Set<number>;
  searchQuery: string;

  // Camera
  flyToTarget: [number, number, number] | null;
  flyToState: 'idle' | 'animating' | 'settling';

  // Color
  colorMode: ColorMode;  // 'cluster' | 'highlight' | 'bias_gradient' | 'neighborhood'

  // Actions
  setSpace: (space: SpaceManifest) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  selectPoint: (point: PointData | null) => void;
  hoverPoint: (point: PointData | null) => void;
  setHighlightedIndices: (indices: Set<number>) => void;
  setSearchQuery: (query: string) => void;
  flyTo: (target: [number, number, number]) => void;
  cancelFlyTo: () => void;
  setFlyToState: (state: 'idle' | 'animating' | 'settling') => void;
  setColorMode: (mode: ColorMode) => void;
}
```

**State split principle:** Zustand holds app state (selected point, search query, fly-to target, color mode). Per-frame rendering state (actual camera position during animation, instance transforms/colors) lives in Three.js refs via `useRef`, mutated directly in `useFrame`. Never trigger React re-renders from the render loop.

---

### Embedding Service Stub (`src/services/embeddingService.ts`)

Phase 1 needs two implementations (remote FastAPI and local Transformers.js) behind a common interface. Phase 0 stubs the interface so the architecture is in place.

```typescript
// Phase 0: interface definition only. No implementations yet.
// Phase 1 adds RemoteEmbeddingService and LocalEmbeddingService.

export interface EmbeddingService {
  embed(text: string): Promise<EmbedResult>;
  neighbors(pointId: string, k: number): Promise<Neighbor[]>;
  biasProbe(poleA: string, poleB: string): Promise<BiasScore[]>;
  analogy(a: string, b: string, c: string): Promise<AnalogyResult>;
  compare(textA: string, textB: string): Promise<CompareResult>;
}

export interface EmbedResult {
  coords_3d: [number, number, number];
  neighbors: Neighbor[];
}

export interface Neighbor {
  term: string;
  index: number;
  distance: number;
}

// Phase 0 does not call this interface — search works via Fuse.js string matching.
// But the interface existing here means Phase 1 can implement it without restructuring.
```

---

### Space Loading and Error Handling (`src/hooks/useSpaceLoader.ts`)

```typescript
async function loadSpace(url: string): Promise<SpaceManifest> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to load space: ${response.status} ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  let jsonString: string;

  if (url.endsWith('.gz')) {
    try {
      jsonString = pako.inflate(new Uint8Array(buffer), { to: 'string' });
    } catch (e) {
      throw new Error('Failed to decompress space file — file may be corrupted');
    }
  } else {
    jsonString = new TextDecoder().decode(buffer);
  }

  let data: SpaceManifest;
  try {
    data = JSON.parse(jsonString);
  } catch (e) {
    throw new Error('Space file contains invalid JSON');
  }

  // Validate structure
  if (!data.points?.length) throw new Error('Space file has no points');
  if (!data.clusters?.length) throw new Error('Space file has no clusters');
  if (data.points.some(p => !Array.isArray(p.pos) || p.pos.length !== 3)) {
    throw new Error('Space file has malformed point positions');
  }

  return data;
}
```

Error display: The `LoadingScreen` component shows a clear error message with the specific failure reason, not a generic "something went wrong."

**WebGL limits:** If `space.num_points` exceeds the browser's max instances (check `gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)`), warn the user and truncate to the max. In practice, modern browsers handle 1M+ instances, so this is a safety net.

---

### Search (`src/hooks/useSearch.ts`)

**Fuse.js configuration:**
```typescript
const fuse = new Fuse(
  space.points.map((p, i) => ({ term: p.term, index: i })),
  {
    keys: ['term'],
    threshold: 0.4,       // 0.3 was too aggressive — produced too many false positives.
                           // 0.4 still catches typos ("quantm" → "quantum") but avoids
                           // matching unrelated terms. Tested against a 10K vocabulary.
    includeScore: true,
    shouldSort: true,
  }
);
```

**Also search cluster labels:** In addition to Fuse.js matching individual terms, a prefix match against cluster labels surfaces entire groups. If the user types "emotion" and a cluster is labeled "emotions", the search results include "Cluster: emotions (47 concepts)" as a top result. Selecting it flies to the cluster centroid and highlights all member points.

```typescript
function searchClusters(query: string, clusters: ClusterData[]): ClusterMatch[] {
  const q = query.toLowerCase();
  return clusters
    .filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.representative_terms.some(t => t.toLowerCase().includes(q))
    )
    .map(c => ({ cluster: c, type: 'cluster' as const }));
}
```

**Zero results:** If Fuse.js returns nothing and no cluster matches, the search dropdown shows "No matches found" with a subtle prompt: "Try a different term or browse clusters." No fly-to triggered, no highlighting change.

**Search while fly-to is active:** If the user types a new search while the camera is mid-flight, the current animation cancels and a new one starts from the current position (same interruption logic as CameraAnimator).

---

### Component Details

**SpaceCanvas** — R3F Canvas with camera (pos [0,0,80], fov 60, near 0.1, far 500), lights (ambient 0.4 + two directional), fog (#0a0a0a, near 60, far 200), OrbitControls with damping 0.05, dark background.

**PointLabel** — Drei `<Html>` anchored at hovered point's 3D position with `distanceFactor={10}`. Shows term name + cluster label. `pointerEvents: 'none'` so it doesn't block raycasts.

**InfoPanel** — HTML overlay (right side, 288px wide). Shows selected point's term, cluster, representative terms, 3D coordinates, model name. Close button deselects.

**ClusterLabels** — Drei `<Html>` at each cluster centroid with `distanceFactor={20}`. Labels scale with distance — readable within ~30 units, invisible beyond ~80 units. `pointerEvents: 'none'`. At 20-50 clusters this is fine; Phase 1 replaces with SDF shader text if cluster count exceeds ~80.

**SearchBar** — HTML overlay, centered top, 384px wide. Debounced input (200ms). Dropdown shows top 10 term matches + any cluster matches. `Escape` clears search and restores colors. `/` keyboard shortcut focuses input.

**LoadingScreen** — Full-screen overlay shown while space loads. Shows model name, point count, and a progress message. On error, shows the specific error message.

---

## Build Order (6 Sprints)

### Sprint 1: Pipeline Core
Implement `types.py`, `vocab.py`, `embed.py`, `reduce.py`, `cluster.py`, `package.py`, and `build_space.py`. Wire the full pipeline end-to-end. Run with MiniLM + 10K terms. Inspect output JSON.

**Acceptance criteria:**
- `uv run build_space.py --model minilm --vocab-size 10000` completes without error
- Output JSON has ~10K points with 3 finite coordinates each
- 20-50 clusters with non-empty labels
- JSON loads in Python and passes `SpaceManifest` Pydantic validation
- Embedding cache file created; second run with same params skips embedding step

### Sprint 2: Static Rendering
Scaffold Vite project with all dependencies. Implement `space.ts` types, `useSpaceStore.ts`, `useSpaceLoader.ts`, `colorSystem.ts`, `SpaceCanvas.tsx`, `PointCloud.tsx`, `LoadingScreen.tsx`. Copy generated space file to `web/public/spaces/`. Render the point cloud.

**Acceptance criteria:**
- `npm run dev` serves the app, no console errors
- 10K colored points render in the viewport
- Orbit controls: rotate (drag), zoom (scroll), pan (right-drag) all work
- Cluster colors are visually distinct (not adjacent similar hues)
- Fog fades distant points naturally
- Chrome DevTools Performance panel: frame time consistently under 16.6ms (60fps) during orbit rotation on the development Mac

### Sprint 3: Interaction
Implement `PointLabel.tsx`, `InfoPanel.tsx`, `ClusterLabels.tsx`. Add click and hover handlers to PointCloud.

**Acceptance criteria:**
- Hover over a point → cursor changes to pointer, tooltip appears showing term + cluster
- Click a point → InfoPanel opens on right side with full metadata
- Click background or close button → InfoPanel dismisses, point deselects
- Cluster labels float at cluster centroids, readable at mid-distance, invisible when far
- Labels don't overlap with each other at the default camera position (if they do, `distanceFactor` needs adjustment)

### Sprint 4: Search + Fly-To
Implement `useSearch.ts`, `SearchBar.tsx`, `CameraAnimator.tsx`. Connect search highlighting to color system. Add keyboard shortcuts.

**Acceptance criteria:**
- Type "quantum" → dropdown shows matching results → top result is "quantum" (or closest fuzzy match)
- Click result or press Enter → camera smoothly flies to the point with ease-out deceleration
- During flight, non-matching points dim to near-invisible, matching points brighten and scale up
- Pressing Escape mid-flight → animation cancels, camera stops where it is, colors restore
- Typing a new query mid-flight → animation redirects to new target
- `/` key focuses search bar from anywhere
- `Escape` key clears search and restores default colors
- Search for a cluster label (e.g., a word that matches a cluster's representative terms) → cluster centroid appears as a result option
- Empty search → no highlighting, no fly-to, all points normal

### Sprint 5: Qwen3 Space + Space Selector
Generate Qwen3 space with the pipeline. Add a space selector UI element. Test both spaces.

**Acceptance criteria:**
- `uv run build_space.py --model qwen3 --vocab-size 10000 --device mps` completes (may take 10-15 min on MPS)
- Space selector dropdown in the UI (top-left) shows both spaces
- Switching spaces: loading indicator appears, new space loads and renders, camera resets to default position
- Both spaces have visually distinct clustering (Qwen3 should produce different neighborhoods than MiniLM)
- No memory leaks when switching (check Chrome DevTools Memory panel — heap should return to similar level after switch)

### Sprint 6: Polish + Tuning
Tune PaCMAP parameters (try n_neighbors 10, 15, 20, 25 and compare visually). Tune fog distances, point size, camera defaults. Cross-browser testing. Write README.

**Acceptance criteria:**
- Tested on Chrome, Firefox, Safari on Mac
- Touch controls work on mobile Safari/Chrome (orbit via two-finger rotate, zoom via pinch)
- PaCMAP parameters that produced the best visual separation are set as defaults and documented
- README includes: what this is, screenshot, setup instructions for both pipeline and frontend
- All error states tested: bad space URL (shows error), empty search (shows "no results"), clicking in empty space (deselects)

---

## Verification Tooling

- **Frame rate:** Chrome DevTools → Performance tab → record 5 seconds of orbit rotation → verify all frames < 16.6ms. Also check with `Stats.js` (drei's `<Stats />` component) during development.
- **Memory:** Chrome DevTools → Memory tab → take heap snapshot after load, compare with snapshot after space switch. Delta should be < 10MB (old space garbage collected).
- **Pipeline output:** After generating a space, run a quick validation script (part of `package.py`): load JSON, verify point count, check for NaN coordinates, confirm all cluster IDs referenced by points exist in clusters list.
- **WebGL:** Check `renderer.info.render.triangles` via `useFrame` — should be ~480K for 10K points (48 tris × 10K instances). If significantly higher, geometry is wrong.
