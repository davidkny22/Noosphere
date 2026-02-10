# Multi-space server + disable local fallback

## Context

Two problems with the current embedding service architecture:

1. **`LocalEmbeddingService`** fabricates 3D positions via weighted-average of K=10 nearest known positions instead of using the trained ParamPaCMAP model. Every feature that projects novel text to 3D (embed, compare, analogy) places markers at synthetic positions. The server does this correctly via `self.param_model.transform()`, so we should disable the local fallback and require the server.

2. **The server is single-space.** `SpaceEngine` is instantiated once at startup for one specific space (e.g., `minilm-150k`). When the user switches spaces in the frontend, the server keeps using its original space. The frontend's `RemoteEmbeddingService` never tells the server which space is active, so all requests (neighbors, bias, compare, etc.) go against the wrong space data.

**Goal:** Make the server serve ALL available spaces simultaneously, with the frontend specifying which space each request is for. Disable local fallback.

## Changes

### Step 1: serviceFactory.ts — disable local fallback (already partially done)

**File:** `web/src/services/serviceFactory.ts`

Comment out the `LocalEmbeddingService` import and the local fallback code block. If the server is unreachable, throw a clear error. Keep the old code commented out for when Transformers.js local service is rebuilt later.

### Step 2: RemoteEmbeddingService — pass space prefix in every request

**File:** `web/src/services/remoteEmbeddingService.ts`

- Add a `spacePrefix` field to the constructor: `constructor(serverUrl: string, spacePrefix: string)`
- Include `space: this.spacePrefix` in the body of every `this.post()` call (embed, neighbors, bias, analogy, compare)

**Why:** The server needs to know which SpaceEngine to use for each request. The space prefix (e.g., "minilm-10k", "qwen3-10k") is derived from the space URL that the frontend already knows.

### Step 3: serviceFactory.ts — derive prefix and pass to RemoteEmbeddingService

**File:** `web/src/services/serviceFactory.ts`

Extract the prefix from the `spaceUrl` parameter (e.g., `/spaces/minilm-10k.json.gz` → `minilm-10k`) and pass it to `new RemoteEmbeddingService(serverUrl, prefix)`.

### Step 4: Server request models — add `space` field

**File:** `server/app/models.py`

Add `space: str` to every request model: `EmbedRequest`, `NeighborsRequest`, `BiasRequest`, `AnalogyRequest`, `CompareRequest`.

### Step 5: SpaceEngine — accept external encoder

**File:** `server/app/engine.py`

Refactor `SpaceEngine.__init__` to accept an external `encoder: SentenceTransformer` parameter instead of creating its own. This way multiple SpaceEngines for the same model (e.g., minilm-10k, minilm-150k, minilm-250k) share a single encoder instance instead of each loading a ~80MB model.

The constructor becomes:
```python
def __init__(self, space_dir, prefix, encoder, model_name="minilm"):
```

Remove the encoder loading logic from `__init__` — that moves to `main.py`.

Also fix the existing `faiss_files[0]` bug (use `space_dir / f"{prefix}.faiss"` instead).

### Step 6: main.py — scan all spaces, load shared encoders, build engine dict

**File:** `server/app/main.py`

At startup in the `lifespan` function:
1. Scan `space_dir` for all `*.faiss` files to discover available spaces
2. Group them by model name (prefix before the first `-`, e.g., "minilm" from "minilm-10k")
3. Load one `SentenceTransformer` per unique model name (shared across spaces)
4. Create a `SpaceEngine` for each discovered space, passing the shared encoder
5. Store as `app.state.engines: dict[str, SpaceEngine]` keyed by prefix (e.g., `{"minilm-10k": engine1, "minilm-150k": engine2, ...}`)

Remove the `NOOSPHERE_SPACE_PREFIX` and `NOOSPHERE_MODEL` env vars — no longer needed since all spaces are loaded.

### Step 7: routes.py — look up engine by space prefix from request body

**File:** `server/app/routes.py`

Each route handler extracts `body.space` and looks up `request.app.state.engines[body.space]`. If the space isn't found, return a 404 with available spaces listed.

Update the `/health` endpoint to return the list of available spaces instead of a single model/num_points.

### Step 8: HealthResponse — list available spaces

**File:** `server/app/models.py`

Update `HealthResponse` to include `spaces: list[str]` — the list of available space prefixes.

## Key Files
- `web/src/services/serviceFactory.ts` — disable local, derive prefix
- `web/src/services/remoteEmbeddingService.ts` — add spacePrefix, include in requests
- `server/app/engine.py` — accept external encoder, fix faiss_files bug
- `server/app/main.py` — scan all spaces, shared encoders, engine dict
- `server/app/routes.py` — look up engine per request
- `server/app/models.py` — add `space` field to requests, update health response

## What stays the same
- `LocalEmbeddingService` file is untouched (kept for future Transformers.js rebuild)
- All SpaceEngine methods (_encode, _project, embed_text, find_neighbors, compute_bias_scores, analogy, compare) stay exactly as-is
- Frontend components (ComparisonPanel, AnalogyPanel, BiasProbePanel, InfoPanel) stay untouched — they call the same EmbeddingService interface

## Verification
1. Start server: `cd server && uv run uvicorn app.main:app --port 8000`
2. Check logs — should show all discovered spaces loading with shared encoders
3. `curl localhost:8000/health` — should list all available spaces
4. `cd web && npm run dev`
5. Load MiniLM 10K → compare "cat" vs "dog" → markers at ParamPaCMAP-projected positions (not fabricated)
6. Switch to MiniLM 150K → bias probe → scores come from the 150K space's embeddings
7. Switch to Qwen 10K → neighbors work against Qwen's FAISS index
8. Without server running → error message, no silent fallback to fabricated positions
