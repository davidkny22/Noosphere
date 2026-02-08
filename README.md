# Noosphere

3D interactive visualization of AI embedding spaces. Fly around an AI's concept space in a browser.

## What is this?

Noosphere takes a vocabulary of 10,000+ English words, embeds them using an AI model (MiniLM or Qwen3), reduces the high-dimensional vectors to 3D using PaCMAP, clusters them with HDBSCAN, and renders the result as an interactive point cloud you can explore in your browser.

Each point is a word. Nearby points are semantically similar. Colors represent clusters of related concepts.

## Setup

### Pipeline (Python)

Generates the 3D space JSON files from vocabulary + embedding model.

```bash
cd pipeline
uv sync
uv run build_space.py --model minilm --vocab-size 10000
uv run build_space.py --model qwen3 --vocab-size 10000
```

Output lands in `web/public/spaces/`. Supports CUDA, MPS (Apple Silicon), and CPU.

### Frontend (React)

```bash
cd web
npm install
npm run dev
```

Opens at `http://localhost:5173`.

## Controls

- **Drag** — orbit/rotate
- **Scroll** — zoom (fly forward/backward)
- **Right-drag** — pan
- **Click point** — select, shows info panel
- **Hover point** — tooltip with term + cluster
- **`/`** — focus search bar
- **`Escape`** — clear search, restore colors
- **`` ` ``** — toggle FPS stats

## Architecture

```
pipeline/          Python CLI — vocab → embed → PaCMAP 3D → HDBSCAN → JSON
web/               React Three Fiber frontend
  src/
    components/    SpaceCanvas, PointCloud, SearchBar, CameraAnimator, ...
    systems/       Color system (cluster palette, search highlighting)
    store/         Zustand state management
    hooks/         Space loader, fuzzy search (Fuse.js)
```

## Tech

- **Embedding models**: sentence-transformers (MiniLM 384d, Qwen3 1024d)
- **Dimensionality reduction**: PaCMAP (subprocess-isolated for macOS ARM64 compatibility)
- **Clustering**: HDBSCAN on 3D positions
- **Rendering**: React Three Fiber v9, InstancedMesh (single draw call for all points)
- **Search**: Fuse.js fuzzy matching + cluster label search
- **State**: Zustand (app state in store, render state in Three.js refs)
