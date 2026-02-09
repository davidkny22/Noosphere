# Fix: FAISS Neighbor Mappings for Filtered Spaces

## Context

When viewing the 150K filtered space and querying neighbors for "daydream," the results are semantically disconnected. Investigation reveals **multiple compounding bugs** in how neighbor queries work for filtered/derivative spaces.

## Root Cause Analysis

### Bug 1: No HD embeddings for 150K space (CRITICAL)
The 150K space is missing `minilm-150k-embeddings.bin` and `minilm-150k-embeddings.json`. These files are required by both the **local embedding service** (browser-side cosine search) and the **server engine** (`find_neighbors()` reads from `hd_embeddings`).

Without these files:
- Local service: `init()` fails on 404 fetching the `.bin` file
- Server: crashes trying to load 150K prefix

**Existing files:**
- `minilm-150k.json.gz` ✓, `minilm-150k.faiss` ✓, `minilm-150k-vocab.json.gz` ✓
- `minilm-150k-embeddings.bin` ✗, `minilm-150k-embeddings.json` ✗

### Bug 2: Server picks arbitrary space via glob (CRITICAL)
`server/app/engine.py:39` — `space_dir.glob(f"{model_name}-*.faiss")` matches ALL minilm FAISS files (`10k`, `150k`, `250k`). Takes `[0]` — filesystem-order-dependent (likely `minilm-10k` on macOS).

When client views 150K but server has 10K/250K loaded:
- Client sends 150K index N → server looks up different term at index N in its space
- Server returns its space's neighbor indices → client maps them to 150K terms (wrong!)

### Bug 3: Missing terms cause FAISS index shift (LATENT)
`rebuild_faiss.py:85-92` and `filter_space.py:232-239` — when `term_to_idx.get(term)` returns `None`, the term is **skipped** in the embedding matrix but **kept** in the space JSON. Result: FAISS has fewer vectors than `space.points`, so FAISS index `i` no longer corresponds to `space.points[i]` after any gap.

### Bug 4: Vocab assembly must be deterministic (LATENT)
`rebuild_faiss.py:80-82` reconstructs vocab via `assemble_vocabulary()` to map filtered terms back to embedding cache indices. If source files changed since the original embedding run, terms map to wrong vectors.

## Fix Plan

### Step 1: Generate HD embeddings for filtered spaces
Create `pipeline/export_embeddings.py` — a reusable CLI that extracts HD embeddings for any space from the cached embedding matrix and saves as `.bin` + `.json`.

**Process:**
1. Load space JSON → get ordered term list
2. Load embedding cache (e.g., `minilm_250000_embeddings.npy`)
3. Reconstruct vocab via `assemble_vocabulary()` → build `term_to_idx`
4. For each term in space order, extract its embedding vector
5. **Assert zero missing terms** (fail hard, don't silently skip)
6. Save as contiguous `Float32Array` binary + JSON metadata (`{ num_points, embedding_dim }`)

**Files:** `pipeline/export_embeddings.py` (new)

### Step 2: Fix missing-terms handling in rebuild_faiss.py and filter_space.py
Change from silently skipping to **failing with a clear error** when any term can't be found in the embedding cache. A missing term means the vocab reconstruction is wrong — silently skipping corrupts index alignment.

**Files:**
- `pipeline/rebuild_faiss.py:85-97` — replace warning with assertion error
- `pipeline/filter_space.py:232-244` — same

### Step 3: Add sanity assertion in server engine
After loading terms and FAISS, assert `len(self.terms) == self.faiss_index.ntotal`. This catches stale/mismatched artifacts immediately on startup rather than serving wrong results silently.

**File:** `server/app/engine.py:64` (after FAISS load)

### Step 4: Fix server space discovery
The server currently guesses which space to load via glob. Add explicit `NOOSPHERE_SPACE_PREFIX` env var (e.g., `minilm-250k`) so the server loads the correct space deterministically.

**File:** `server/app/main.py` — add `NOOSPHERE_SPACE_PREFIX` env var, fall back to current glob behavior

### Step 5: Integrate export_embeddings into filter_space.py
When `--rebuild-faiss` is passed, also export HD embeddings `.bin`/`.json` so derivative spaces are always complete.

**File:** `pipeline/filter_space.py` — call export logic after FAISS build

### Step 6: Run export for 150K space
Execute `export_embeddings.py` to generate:
- `web/public/spaces/minilm-150k-embeddings.bin`
- `web/public/spaces/minilm-150k-embeddings.json`

## Verification

1. Run `export_embeddings.py` for 150K — should produce `.bin` + `.json` with exactly 150,000 vectors
2. Start dev server (`cd web && npm run dev`), select MiniLM 150K
3. Click "daydream" → Show Neighbors → verify results are semantically related (e.g., "dream," "reverie," "fantasy")
4. Start Python server with explicit prefix `NOOSPHERE_SPACE_PREFIX=minilm-150k` → verify it loads correctly and `ntotal == len(terms)`
5. Repeat neighbor query via server — same sensible results

## Key Files
- `pipeline/export_embeddings.py` (new)
- `pipeline/rebuild_faiss.py` (modify)
- `pipeline/filter_space.py` (modify)
- `server/app/engine.py` (modify)
- `server/app/main.py` (modify)
- `web/public/spaces/minilm-150k-embeddings.bin` (generated)
- `web/public/spaces/minilm-150k-embeddings.json` (generated)
