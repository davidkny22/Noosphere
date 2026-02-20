# Noosphere

3D interactive visualization of AI embedding spaces. Fly through an AI's concept space in your browser.

## What is this?

Noosphere takes a vocabulary of 10,000+ English words, embeds them using an AI model (MiniLM or Qwen3), reduces the high-dimensional vectors to 3D with PaCMAP, clusters them with HDBSCAN, and renders the result as an interactive point cloud you can explore.

Each point is a word. Nearby points are semantically similar. Colors represent clusters of related concepts.

## Quick Start

```bash
# 1. Clone
git clone https://github.com/davidkny22/Noosphere.git
cd Noosphere

# 2. Generate a space (requires Python 3.11, uv)
cd pipeline
uv sync
uv run build_space.py --model minilm --vocab-size 10000
cd ..

# 3. Start the embedding server
cd server
uv sync
uv run serve
cd ..

# 4. Start the frontend (requires Node 18+)
cd web
npm install
npm run dev

# 5. Open http://localhost:5173
```

## Prerequisites

- **Python 3.11** (3.12 may work but untested)
- **[uv](https://docs.astral.sh/uv/)** — fast Python package manager
- **Node.js 18+** and npm
- **GPU (optional)** — CUDA or MPS (Apple Silicon) for faster pipeline runs. CPU works fine.

## Setup

### Pipeline (generates 3D space data)

```bash
cd pipeline
uv sync
uv run build_space.py --model minilm --vocab-size 10000
uv run build_space.py --model qwen3 --vocab-size 10000
```

Output lands in `web/public/spaces/`. Supports CUDA, MPS (Apple Silicon), and CPU.

Additional pipeline tools:
- `uv run filter_space.py` — downsize an existing space
- `uv run rebuild_faiss.py` — rebuild FAISS index for a space
- `uv run export_embeddings.py` — export HD embeddings to binary format

### Server (embedding API)

```bash
cd server
uv sync
uv run serve
```

Starts at `http://localhost:8000`. The server loads all spaces found in `web/public/spaces/` and provides embedding, neighbor search, bias probing, analogy, and comparison endpoints.

The server is required for advanced features (embed, bias probe, analogy, comparison). The visualization itself works without it.

### Frontend

```bash
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Controls

- **Drag** — orbit/rotate (orbit mode) or look around (fly mode)
- **WASD** — move (fly mode)
- **Scroll** — zoom / fly forward-backward
- **Spacebar** — fly up
- **Ctrl** — fly down
- **Shift** — 2x fly speed
- **Right-drag** — pan
- **Click point** — select, shows info panel
- **Hover point** — tooltip with term + cluster
- **`/`** — focus search bar
- **`Escape`** — clear search, restore colors
- **`` ` ``** — toggle FPS stats

## Architecture

```
pipeline/          Python CLI — vocab -> embed -> PaCMAP 3D -> HDBSCAN -> JSON
server/            FastAPI backend — embedding, neighbors, bias, analogy, compare
web/               React Three Fiber frontend
  src/
    components/    SpaceCanvas, PointCloud, SearchBar, CameraAnimator, ...
    systems/       Color system (cluster palette, search highlighting)
    store/         Zustand state management
    hooks/         Space loader, fuzzy search (Fuse.js)
    services/      Embedding service (remote via server)
```

## API Endpoints

All endpoints expect JSON. The `space` field identifies which space to query (e.g., `minilm-10k`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | List available spaces |
| `POST` | `/embed` | Embed text, get 3D coords + K nearest neighbors |
| `POST` | `/neighbors` | Find K nearest neighbors for an existing point |
| `POST` | `/bias` | Compute bias scores between two poles for all terms |
| `POST` | `/analogy` | Solve "A is to B as C is to ?" via vector arithmetic |
| `POST` | `/compare` | Compare two texts: cosine similarity + 3D positions |

Auto-generated docs available at `http://localhost:8000/docs` when the server is running.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Server port |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated allowed origins |
| `NOOSPHERE_SPACE_DIR` | `web/public/spaces` | Directory containing space artifacts |
| `RELOAD` | `false` | Enable uvicorn auto-reload (dev only) |
| `OPENAI_API_KEY` | — | Optional: enables GPT-powered cluster labels in the pipeline |
| `VITE_API_URL` | `http://localhost:8000` | Frontend: embedding server URL (set in `web/.env.local`) |

See `.env.example` for a template.

## Tech

- **Embedding models**: sentence-transformers (MiniLM 384d, Qwen3 1024d)
- **Dimensionality reduction**: PaCMAP (subprocess-isolated for macOS ARM64 compatibility)
- **Parametric projection**: ParamPaCMAP (trained network for projecting novel inputs to 3D)
- **Clustering**: HDBSCAN on 3D positions
- **Neighbor search**: FAISS (IndexFlatIP, cosine similarity)
- **Rendering**: React Three Fiber v9, InstancedMesh with custom shaders (single draw call)
- **Search**: Fuse.js fuzzy matching
- **State**: Zustand
- **Build**: Vite, TypeScript

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

### Commercial Licensing

If you'd like to use Noosphere in a proprietary product or service without the AGPL v3 obligations, commercial licenses are available. Contact [@davidkny22 on GitHub](https://github.com/davidkny22) to discuss.
