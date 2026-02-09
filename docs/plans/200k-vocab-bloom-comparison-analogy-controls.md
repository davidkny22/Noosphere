# Noosphere — Phase 2 Plan

## Status Report

### Completed (Phase 0 + 0.5 + 1 + post-1 fixes)

| Area | What's Done |
|------|-------------|
| **Pipeline** | Full CLI: vocab assembly (Google 20K + curated ~1K), bulk embedding, PaCMAP 3D, HDBSCAN clustering (medoid labels), packaging, FAISS IndexFlatIP, ParamPaCMAP training, HD embeddings export. Subprocess isolation for OMP conflicts. Annoy mocked for macOS ARM64. |
| **Spaces** | Two 10K-point spaces: MiniLM (384d) + Qwen3 (1024d). Artifacts: `.json.gz`, `.faiss`, `.parampacmap.pt`, `-embeddings.bin` |
| **Server** | FastAPI with 6 endpoints all working: `/health`, `/embed`, `/neighbors`, `/bias`, `/analogy`, `/compare` |
| **Frontend services** | `RemoteEmbeddingService` implements all 5 methods (embed, neighbors, biasProbe, analogy, compare). `LocalEmbeddingService` is stub — **deferred**. |
| **Rendering** | GL_POINTS with custom shaders. Dynamic fog. No bloom, no LOD, no cluster sprites. |
| **Features** | Semantic teleport ("Project"), fly-to marker, persistent user embeds, neighborhood view, bias probe, intro animation, beginner/advanced mode, zoom clamp |

### NOT Built Yet (with priority)

| Feature | Backend | Frontend | Phase 2 Sprint |
|---------|---------|----------|----------------|
| **200K vocabulary** | Pipeline supports it, need sources | Rendering untested | Sprint 1-2 |
| **Bloom** | N/A | Not installed (`@react-three/postprocessing`) | Sprint 1 |
| **LLM cluster labels** | Medoid heuristic only | N/A | Sprint 2 |
| **Comparison mode** | `/compare` done, `remoteEmbeddingService.compare()` done | No UI panel | Sprint 3 |
| **Analogy explorer** | `/analogy` done, `remoteEmbeddingService.analogy()` done | No UI panel | Sprint 3 |
| **Bias report export** | N/A | No export button | Sprint 4 |
| **Search history breadcrumbs** | N/A | No trail rendering | Sprint 4 |
| **Precision mode toggle** | HD cosine available via server | No toggle | Sprint 4 |
| **Cluster fog sprites** | N/A | No LOD | Sprint 5 |
| **Fly controls (WASD)** | N/A | Orbit only | Sprint 5 |

---

## Sprint 1: Scale Pipeline + Bloom

### 1a. Vocabulary expansion

**Current**: `pipeline/data/sources/google_20k.txt` (20K lines) + `curated_concepts.txt` (1,019 lines) = ~19,400 usable terms after filtering.

**Target**: ~250K unique terms after deduplication and `filter_term()` filtering.

**Data sources** (priority-ordered, each layer deduplicates against all prior):

| # | Source | Download | Est. New Terms | License |
|---|--------|----------|---------------|---------|
| 1 | **Google 20K** (existing) | `pipeline/data/sources/google_20k.txt` | ~18K | — |
| 2 | **Curated concepts** (existing) | `pipeline/data/sources/curated_concepts.txt` | ~1K | — |
| 3 | **ConceptNet 5.7.0** | `s3.amazonaws.com/conceptnet/downloads/2019/edges/conceptnet-assertions-5.7.0.csv.gz` (2.4 GB) | top 150K by edge count | CC BY-SA 4.0 |
| 4 | **WordNet** | `nltk.download('wordnet')` (~12 MB) | ~30-50K | BSD-like (Princeton) |
| 5 | **MeSH** | `nlmpubs.nlm.nih.gov/projects/mesh/MESH_FILES/xmlmesh/desc2026.gz` (~17 MB) | ~240K (XML descriptors + concepts + terms) | Public domain (NLM) |
| 6 | **Wikipedia titles** | `dumps.wikimedia.org/enwiki/latest/enwiki-latest-all-titles-in-ns0.gz` (~300 MB) | ~10-20K | CC BY-SA 4.0 |
| 7 | **Dariusk Corpora** | `github.com/dariusk/corpora/tree/master/data` (~5 MB) | ~5K | Unlicense (public domain) |

**Why these sources:**
- **ConceptNet**: commonsense concepts — "how humans think about things." Multi-word phrases like "climate change", "road trip", "stage fright". Best source for navigable embedding space. **Ranked by edge count** — terms with more relationships to other concepts are more semantically connected and produce richer neighborhoods. We count edges per term (from assertions with weight ≥ 1.0) and keep the top 150K.
- **WordNet**: curated lexical coverage. Fills formal vocabulary gaps ConceptNet misses.
- **MeSH**: science/medicine domain — "oxidative stress", "cognitive behavioral therapy", "gene expression". Public domain, curated by librarians, zero noise.
- **Wikipedia titles**: named compound concepts — "greenhouse effect", "Turing test", "prisoner's dilemma". Gap-filler after ConceptNet + MeSH cover most compounds.
- **Dariusk Corpora**: curated concept lists by category (animals, architecture, art, foods, mythology, psychology, religion, science, technology). Domain polish.

**Extraction details:**

ConceptNet: filter for `/c/en/` nodes, weight ≥ 1.0, 1-3 words, replace underscores with spaces.
```python
import gzip, re, json
uri_re = re.compile(r'^/c/en/([^/]+)')
with gzip.open(path, 'rt') as f:
    for line in f:
        parts = line.split('\t')
        if len(parts) < 5: continue
        meta = json.loads(parts[4])
        if meta.get('weight', 0) < 1.0: continue
        for col in (2, 3):
            m = uri_re.match(parts[col])
            if m:
                label = m.group(1).replace('_', ' ').lower()
                # apply filter_term + word count check
```

WordNet: extract all lemma names via NLTK.
```python
from nltk.corpus import wordnet as wn
for synset in wn.all_synsets():
    for lemma in synset.lemmas():
        name = lemma.name().replace('_', ' ').lower()
```

MeSH: parse ASCII format, extract `MH =` (main headings) and `ENTRY =` / `PRINT ENTRY =` lines.
```python
for line in open('d2025.bin'):
    if line.startswith('MH = '):
        terms.append(line[5:].strip())
    elif line.startswith('ENTRY = ') or line.startswith('PRINT ENTRY = '):
        terms.append(line.split('=', 1)[1].split('|')[0].strip())
```

Wikipedia titles: filter to 1-3 words, ASCII, no people/places/dates/disambiguation.
```python
import gzip, re
with gzip.open(path, 'rt') as f:
    for line in f:
        title = line.strip().replace('_', ' ').lower()
        if len(title.split()) > 3: continue
        if re.match(r'^\d', title): continue
        if any(x in title for x in ['(disambiguation)', 'list of']): continue
```

Dariusk Corpora: iterate all JSON files, extract term arrays.
```python
import json
from pathlib import Path
for jf in Path('corpora/data').rglob('*.json'):
    data = json.loads(jf.read_text())
    # each file has a named array — extract all string values
```

**Vocabulary composition — tag-and-quota system** (`pipeline/data/vocab_config.json`):

Rather than loading sources sequentially and skipping duplicates (where load order determines priority), we use a **tag-and-quota** approach:

1. **Load ALL** terms from all sources into one pool, tagging each term with every source it appears in
2. **Assign** each term to its highest-priority source (e.g., "aspirin" in ConceptNet + WordNet + MeSH gets assigned to the highest-priority source it appears in)
3. **Fill quotas** — each source has a configurable quota (how many terms to draw from its assigned pool)
4. **Union** all picks = final vocabulary

This gives fine-grained control over space composition via `vocab_config.json`:

```json
{
  "target_size": 250000,
  "sources": [
    { "key": "google_20k",      "priority": 100, "quota": 18000  },
    { "key": "curated",          "priority": 95,  "quota": 1000   },
    { "key": "conceptnet",       "priority": 80,  "quota": 130000 },
    { "key": "wordnet",          "priority": 70,  "quota": 40000  },
    { "key": "mesh",             "priority": 60,  "quota": 35000  },
    { "key": "wikipedia_titles", "priority": 50,  "quota": 20000  },
    { "key": "dariusk_corpora",  "priority": 40,  "quota": 6000   }
  ]
}
```

**Multi-source tiebreaking**: Within each source's assigned pool, terms are sorted by how many sources they appear in (descending), with file order as the tiebreaker within each tier. A term appearing in 5/7 sources is almost certainly a high-quality, universally recognized concept and should be picked before a term appearing in only 1 source. This means ConceptNet's 130K quota fills with its most cross-referenced terms first (those also found in WordNet, MeSH, Wikipedia, etc.), then falls back to ConceptNet-only terms ranked by edge count.

**Flexible quota spillover**: If a source can't fill its quota (e.g., curated has only 360 terms for a 1000 quota), the 640 unfilled slots spill over to the next highest-priority source. This ensures the total vocabulary stays at target size even when smaller sources underperform their quota.

Falls back to legacy sequential mode if `vocab_config.json` is missing.

**Future**: aggregate all pipeline configuration (vocab composition, model params, PaCMAP params, HDBSCAN params, label model) into a single space config file or domain-specific config files.

### 1b. Pipeline parameter tuning for 200K

**`pipeline/build_space.py`** — update defaults and add flags:

| Parameter | Current | 200K Value | Why |
|-----------|---------|------------|-----|
| `--vocab-size` | 10000 | 200000 | Scale target |
| `--batch-size` | 512 | 256 (Qwen3), 512 (MiniLM) | Memory constraint at 200K × 1024 |
| `--pacmap-neighbors` | 15 | 20 | Better structure at scale (`sqrt(200K)*0.5 ≈ 22`) |
| `--pacmap-mn-ratio` | 0.5 | 1.0 | More negative sampling for 200K |
| `--pacmap-fp-ratio` | 2.0 | 4.0 | More FP pairs at scale |
| `--hdbscan-min-cluster` | 20 | 50 | Prevent 7000+ clusters (aim for ~500-1000) |

**FAISS at 200K**: IndexFlatIP is 200K × 1024 × 4B = ~780MB. Still works fine — brute-force on 200K is <1ms per query. No need for IndexIVFFlat yet.

**Timing estimates** (Qwen3 on MPS/M-series Mac):
- Embedding: ~5-10 min (200K × 1024d)
- PaCMAP: ~2-4 hours (CPU, subprocess)
- ParamPaCMAP: ~30-60 min (200K training pairs)
- HDBSCAN: ~2 min
- FAISS: instant
- **Total: ~3-5 hours**

### 1c. Bloom post-processing

**Install**: `npm install @react-three/postprocessing` in `web/`

**Modify `web/src/components/SpaceCanvas.tsx`**:

```tsx
import { EffectComposer, Bloom } from '@react-three/postprocessing';

// Inside <Canvas>, after all scene children, before </Canvas>:
<EffectComposer>
  <Bloom
    luminanceThreshold={0.8}
    luminanceSmoothing={0.3}
    intensity={0.6}
    radius={0.4}
  />
</EffectComposer>
```

The existing shader outputs color values 0-1, so only bright cluster colors (saturation 0.8, lightness 0.65 in `buildClusterPalette`) will trigger bloom. The dark `#0a0a0a` background works perfectly for glow.

**Note**: Test bloom performance impact at 200K points. If >5ms per frame, add a toggle.

### 1d. Verification

- `uv run build_space.py --model minilm --vocab-size 200000` completes without error
- Output `minilm-200k.json.gz` < 5MB, loads in browser
- Bloom visible on bright cluster colors, dark background unchanged
- 60fps maintained at 200K with bloom

---

## Sprint 2: Regenerate Spaces + Rendering Tuning

### 2a. LLM cluster labels

**Modify `pipeline/src/cluster.py`** — replace medoid label (line 63) with LLM call via OpenAI Responses API:

```python
# Add to cluster.py
from openai import OpenAI

def generate_cluster_label(representative_terms: list[str], client: OpenAI | None) -> str:
    if not client:
        return representative_terms[0]  # medoid fallback

    response = client.responses.create(
        model="5-nano",
        reasoning={"effort": "medium"},
        input=f"Create a concise 1-3 word category label for this group of related concepts: {', '.join(representative_terms[:10])}. Reply with ONLY the label, nothing else.",
    )
    return response.output_text.strip()
```

At ~500-1000 clusters for 200K points, this is ~1000 5-nano calls with medium reasoning ≈ $0.10 and ~3 min.

Add `--label-model` flag to `build_space.py`: `5-nano` (default if `OPENAI_API_KEY` set) or `medoid` (fallback).

Add `openai` to `pipeline/pyproject.toml` dependencies. This dependency will also be reused later when adding `text-embedding-3-large` as an embedding model option.

### 2b. Rendering tuning for 200K

**`web/src/components/SpaceCanvas.tsx`**:
- Increase `NUM_POINTS_FOG_THRESHOLD` from 5000 to 50000
- Fog formula: `fogNear = maxDist * 1.2`, `fogFar = maxDist * 4` (tighter for denser cloud)

**`web/src/components/PointCloud.tsx`**:
- Point size at 200K: `200 / log(200000) / log(8)` = `200 / 12.2 / 2.08` ≈ `7.9` — still visible, verify by eye
- If too small, increase `POINT_SIZE_SCALE` from 200 to 300

**`web/src/components/ClusterLabels.tsx`**:
- At 200K, HDBSCAN with `min_cluster_size=50` → ~500-1000 clusters
- 1000 `<Html>` DOM elements = lag. Add distance culling:

```tsx
// In ClusterLabels.tsx, inside the map:
const { camera } = useThree();
// Only render labels for clusters within 100 units of camera
const dist = new THREE.Vector3(...cluster.centroid).distanceTo(camera.position);
if (dist > 100) return null;
```

**Fuse.js search at 200K**:
- Test search latency. Fuse.js at 200K terms with default threshold: likely ~50-100ms per keystroke
- If slow, increase debounce from 200ms to 300ms in `SearchBar.tsx` line 61
- Or limit Fuse.js results with `{ limit: 20 }` option

### 2c. Regenerate both spaces at 200K

Run pipeline twice:
```bash
uv run build_space.py --model minilm --vocab-size 200000 --hdbscan-min-cluster 50
uv run build_space.py --model qwen3 --vocab-size 200000 --hdbscan-min-cluster 50
```

Copy outputs to `web/public/spaces/`. Update `AVAILABLE_SPACES` in `useSpaceStore.ts` from `10k` to `200k`.

Update server to load 200K artifacts.

### 2d. Verification

- Both 200K spaces load in browser < 3 seconds
- Cluster labels readable, not overlapping excessively
- Search responsive (< 200ms per keystroke)
- Point size visually appropriate
- 60fps maintained

---

## Sprint 3: Comparison Mode + Analogy Explorer

Both features follow the `BiasProbePanel.tsx` pattern: fixed-position panel, embedding service call, store state update, 3D visualization.

### 3a. Comparison mode

**New file: `web/src/components/ComparisonPanel.tsx`**

Store additions in `useSpaceStore.ts`:
```typescript
// Interface
comparisonResult: {
  textA: string; textB: string;
  similarity: number;
  coordsA: [number, number, number];
  coordsB: [number, number, number];
} | null;
setComparisonResult: (result: ...) => void;

// Default
comparisonResult: null,

// Action
setComparisonResult: (result) => set({ comparisonResult: result }),
```

Panel UI — follow BiasProbePanel layout (`fixed left-4 bottom-4 z-40 w-64`):
- Two text inputs: "Text A" and "Text B"
- "Compare" button → calls `embeddingService.compare(textA, textB)`
- Store result → `setComparisonResult({ textA, textB, similarity, coordsA, coordsB })`
- Display: similarity score as percentage, cosine distance
- Camera: `flyTo(midpoint(coordsA, coordsB))`
- "Clear" button → `setComparisonResult(null)`

**New file: `web/src/components/ComparisonMarkers.tsx`** (R3F scene component)

When `comparisonResult` is set:
- Render two `ProjectedMarker`-style glowing spheres (different colors: cyan for A, magenta for B)
- Render a dashed line connecting them (follow `NeighborLines.tsx` pattern)
- Render distance label at midpoint via `<Html>`

Add to `SpaceCanvas.tsx` alongside other scene children.
Add `<ComparisonPanel />` to `App.tsx` (advanced mode only, like BiasProbePanel).

### 3b. Analogy explorer

**New file: `web/src/components/AnalogyPanel.tsx`**

Store additions:
```typescript
analogyResult: {
  a: string; b: string; c: string;
  resultTerm: string;
  coordsResult: [number, number, number];
  neighbors: Neighbor[];
} | null;
setAnalogyResult: (result: ...) => void;
```

Panel UI:
- Three text inputs: "A", "B", "C" with label "A is to B as C is to ___"
- "Compute" button → calls `embeddingService.analogy(a, b, c)`
- Store result → `setAnalogyResult({ a, b, c, resultTerm: result.result_term, coordsResult: result.coords_3d, neighbors: result.neighbors })`
- Display: result term prominently, list of nearby terms
- Camera: `flyTo(result.coords_3d)`
- "Clear" button → `setAnalogyResult(null)`

**New file: `web/src/components/AnalogyMarkers.tsx`** (R3F scene component)

When `analogyResult` is set:
- Look up positions of A, B, C from `space.points` (find by term match)
- Render 4 markers: A, B, C (cluster colors), result (golden like user embeds)
- Render lines: A→B and C→result (parallel vectors)
- Labels at each marker via `<Html>`

Add to `SpaceCanvas.tsx` and `App.tsx` (advanced mode).

### 3c. Verification

- Type "king" / "man" / "woman" in analogy → result near "queen"
- Compare "a mother losing her child" vs "a father losing his child" → see similarity + positions
- Both panels clear correctly
- Camera flies to correct positions

---

## Sprint 4: Polish Features

### 4a. Bias report export

**Modify `web/src/components/BiasProbePanel.tsx`** — add "Export" button after the clear button:

```tsx
const exportBias = useCallback(() => {
  if (!space || biasScores.length === 0) return;

  const rows = space.points.map((p, i) => {
    const cluster = space.clusters.find(c => c.id === p.cluster);
    return `"${p.term}",${biasScores[i]?.toFixed(4) ?? ''},"${cluster?.label ?? 'noise'}"`;
  });

  const csv = `term,score,cluster\n${rows.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bias-probe-${poleA}-vs-${poleB}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}, [space, biasScores, poleA, poleB]);
```

Button: `<button onClick={exportBias}>Export CSV</button>` — only shown when `biasScores.length > 0`.

### 4b. Search history breadcrumbs

Store addition:
```typescript
searchHistory: Array<{ query: string; pos: [number, number, number]; timestamp: number }>;
addSearchHistory: (entry: ...) => void;
clearSearchHistory: () => void;
```

Capture in `SearchBar.tsx` — after any successful flyTo, push to `searchHistory` (limit 20, FIFO).

**New file: `web/src/components/Breadcrumbs.tsx`** (R3F scene component):
- Render `THREE.Line` with `LineDashedMaterial` connecting `searchHistory` positions
- Opacity: 0.15 (very faint trail)
- Small dots at each waypoint (reuse GL_POINTS with single-vertex buffers)
- Returns `null` when history is empty

Add to `SpaceCanvas.tsx`.

### 4c. Precision mode toggle

Store addition:
```typescript
precisionMode: '3d' | 'hd';
setPrecisionMode: (mode: '3d' | 'hd') => void;
```

**New file: `web/src/components/PrecisionToggle.tsx`**:
- Small badge in corner: "3D" or "HD"
- Click toggles between modes
- Only visible when `serviceMode === 'remote'` and `isAdvancedMode`
- When HD: bias probe calls `/bias` endpoint (already uses HD cosine)
- When 3D: bias probe computes 3D distances client-side (new function in `colorSystem.ts`)

Add to `App.tsx` (advanced mode only).

### 4d. Verification

- Bias probe → Export CSV → file downloads with correct data
- Navigate to 5+ points → faint dotted trail visible
- Precision toggle: switch between 3D/HD → bias colors change subtly
- HD badge visible when server connected

---

## Sprint 5: Visual Enhancements

### 5a. Cluster fog sprites

**New file: `web/src/components/ClusterFog.tsx`**:

For each cluster, render a large transparent sprite at the centroid:
```tsx
<sprite position={cluster.centroid} scale={[radius * 3, radius * 3, 1]}>
  <spriteMaterial
    map={glowTexture}  // radial gradient canvas texture
    transparent
    opacity={0.08 * Math.log(cluster.size)}
    blending={THREE.AdditiveBlending}
    fog={false}
    depthWrite={false}
  />
</sprite>
```

`glowTexture`: generate once via `<canvas>` — white center circle with gaussian falloff to transparent.

Visibility: always render (these are fog, meant to be visible from far). Individual points are visible up close via existing `PointCloud`.

Add to `SpaceCanvas.tsx` before `<PointCloud />`.

### 5b. Fly controls toggle

**Modify `web/src/components/SpaceCanvas.tsx`**:

Store addition: `controlMode: 'orbit' | 'fly'`, `toggleControlMode`.

```tsx
import { PointerLockControls } from '@react-three/drei';

// Conditionally render based on controlMode:
{controlMode === 'orbit' ? (
  <OrbitControls ... />
) : (
  <PointerLockControls />
)}
```

WASD movement via `useFrame`:
```tsx
// In a new <FlyMovement /> component:
useFrame((_, delta) => {
  if (controlMode !== 'fly') return;
  const speed = 20 * delta;
  if (keys.w) camera.translateZ(-speed);
  if (keys.s) camera.translateZ(speed);
  if (keys.a) camera.translateX(-speed);
  if (keys.d) camera.translateX(speed);
});
```

Toggle button: small icon in bottom-right near ModeToggle.

### 5c. Verification

- Cluster fog visible from far, fades as camera approaches
- Press fly toggle → pointer locks, WASD moves camera freely
- Toggle back → orbit controls resume
- Both modes support flyTo animation

---

## Build Order

```
Sprint 1 (Vocab + Pipeline + Bloom) → Sprint 2 (Regen 200K + Tuning)
                                              ↓
                                       Sprint 3 (Compare + Analogy)
                                       Sprint 4 (Export + Breadcrumbs + Precision)
                                       Sprint 5 (Fog Sprites + Fly Controls)
```

Sprints 3-5 parallelize after Sprint 2.

## Deferred to Phase 3

- LocalEmbeddingService (Transformers.js)
- Guided tours with narration
- Model comparison with blend slider
- Theme system
- VR / WebXR
- Responsive design
- Accessibility
