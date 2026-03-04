# Noosphere

3D interactive visualization of AI embedding spaces. Fly through the conceptual geography of how language models represent ideas — right in your browser.

![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)

## What is this?

Noosphere takes a vocabulary of 10,000+ English words, embeds them using an AI model (MiniLM or Qwen3), reduces the high-dimensional vectors to 3D with PaCMAP, clusters them with HDBSCAN, and renders the result as an interactive point cloud you can explore.

Each glowing point is a word. Nearby points are semantically similar. Colors represent clusters of related concepts. You navigate an AI's mind.

### Features

- **Semantic teleport** — type any word or sentence, the model embeds it in real-time and flies you to where it lives in the space
- **Bias probe** — pick two concepts as poles (e.g. "male" / "female") and watch the entire space recolor on a gradient showing every concept's relative association. Export results as CSV.
- **Neighborhood view** — select any point, see its nearest neighbors highlighted with connecting constellation lines
- **Analogy explorer** — input "A is to B as C is to ___" and watch vector arithmetic play out in 3D
- **Comparison mode** — embed two sentences and see where they land, how far apart they are, and what surrounds them
- **Fly mode** — switch from orbit to WASD + mouse look for full free-flight immersion
- **Beginner / Advanced toggle** — progressive disclosure of analytical tools

## Quick Start

### Prerequisites

- **Python 3.11** — [python.org](https://www.python.org/downloads/) (3.12 may work but is untested)
- **uv** — fast Python package manager: `pip install uv` or see [docs.astral.sh/uv](https://docs.astral.sh/uv/getting-started/installation/)
- **Node.js 18+** — [nodejs.org](https://nodejs.org/)
- **GPU (optional)** — CUDA or MPS (Apple Silicon) for faster pipeline runs. CPU works fine.

### Install & Run

```bash
git clone https://github.com/davidkny22/Noosphere.git
cd Noosphere
npm run setup    # installs Python + Node dependencies (~2 min first time)
npm start        # launches server + frontend together
```

Open **http://localhost:5173** and explore.

> A pre-built 10K-word MiniLM space ships with the repo. No pipeline run needed.

## Setup (Manual)

If you prefer to run components separately, or need more control:

### Server (embedding API)

```bash
cd server
uv sync
uv run serve
```

Starts at `http://localhost:8000`. The server loads all spaces found in `web/public/spaces/` and provides embedding, neighbor search, bias probing, analogy, and comparison endpoints.

The server is required for advanced features (embed, bias probe, analogy, comparison). The visualization itself works without it — you can still browse and search the pre-built space.

### Frontend

```bash
cd web
npm install
npm run dev        # starts both frontend + server via concurrently (default)
npm run dev:web    # starts frontend only (if you're running the server separately)
```

Opens at `http://localhost:5173`.

## Generating Your Own Space

The pre-built MiniLM 10K space is included, but you can generate custom spaces with the pipeline:

```bash
cd pipeline
uv sync
uv run build_space.py --model minilm --vocab-size 10000
uv run build_space.py --model qwen3 --vocab-size 10000   # requires more VRAM
```

Output goes to `web/public/spaces/`. The frontend auto-discovers all available spaces via `index.json`.

### Pipeline Options

```
--model {minilm,qwen3}    Embedding model to use
--vocab-size N             Number of vocabulary terms (default: 10000)
--device {auto,cuda,mps,cpu}  Compute device
--batch-size N             Embedding batch size
--compress                 Gzip the output JSON
```

### Additional Pipeline Tools

- `uv run filter_space.py` — downsize an existing space to fewer terms
- `uv run rebuild_faiss.py` — rebuild FAISS index for a space
- `uv run export_embeddings.py` — export HD embeddings to binary format

GPU (CUDA or Apple Silicon MPS) is recommended for larger vocabularies. CPU works fine for 10K.

## Controls

| Input | Action |
|-------|--------|
| **Drag** | Orbit / rotate (orbit mode) or look around (fly mode) |
| **Scroll** | Zoom in / out |
| **Right-drag** | Pan |
| **Click** | Select a point — opens info panel |
| **Hover** | Tooltip with term + cluster |
| **`/`** | Focus search bar |
| **Escape** | Clear search, restore colors |
| **`` ` ``** | Toggle FPS stats |

### Fly mode (toggle via button)

| Input | Action |
|-------|--------|
| **WASD** | Move forward / left / back / right |
| **Space** | Fly up |
| **Ctrl** | Fly down |
| **Shift** | 2x speed |

## Architecture

```
pipeline/          Python CLI — vocab → embed → PaCMAP 3D → HDBSCAN → space JSON
server/            FastAPI backend — embedding, neighbors, bias, analogy, compare
web/               React Three Fiber frontend
  src/
    components/    SpaceCanvas, PointCloud, SearchBar, BiasProbePanel, ...
    systems/       Color system (cluster palette, bias gradient, search highlight)
    store/         Zustand state management
    hooks/         Space loader, fuzzy search (Fuse.js), GPU picking
    services/      Embedding service abstraction (remote API)
```

### How it works

1. **Pipeline** generates a space: embeds vocabulary → PaCMAP 3D reduction → HDBSCAN clustering → trains a ParamPaCMAP projection network → builds FAISS index → packages everything as compressed JSON + binary artifacts.
2. **Server** loads the embedding model + FAISS index + projection network at startup. Provides real-time embedding of novel text, nearest-neighbor search, bias scoring (SemAxis), analogy computation, and text comparison — all in high-dimensional space for maximum accuracy.
3. **Frontend** renders the space as an InstancedMesh point cloud with custom GLSL shaders (single draw call for 10K+ points), handles navigation, search, and all interactive features. Communicates with the server for embedding operations.

## API Endpoints

All endpoints expect JSON. The `space` field identifies which space to query (e.g., `minilm-10k`).

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | List available spaces and their metadata |
| `POST` | `/embed` | Embed text → 3D coords + K nearest neighbors |
| `POST` | `/neighbors` | Find K nearest neighbors for a point by index |
| `POST` | `/bias` | Bias scores between two poles (SemAxis) for all terms |
| `POST` | `/analogy` | Solve "A is to B as C is to ?" via vector arithmetic |
| `POST` | `/compare` | Compare two texts: cosine similarity + 3D positions |

Interactive API docs at **http://localhost:8000/docs** when the server is running.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Server port |
| `HOST` | `127.0.0.1` | Server bind address |
| `CORS_ORIGINS` | localhost Vite ports | Comma-separated allowed origins |
| `NOOSPHERE_SPACE_DIR` | `web/public/spaces` | Directory containing space artifacts |
| `RELOAD` | `false` | Enable uvicorn auto-reload (dev only) |
| `OPENAI_API_KEY` | — | Optional: GPT-powered cluster labels in pipeline |
| `VITE_API_URL` | `http://localhost:8000` | Frontend: embedding server URL |

See `.env.example` for a template.

## Tech Stack

| Layer | Technology |
|-------|------------|
| Embedding models | sentence-transformers (MiniLM 384d, Qwen3 1024d) |
| Dimensionality reduction | PaCMAP (subprocess-isolated for macOS ARM64 compatibility) |
| Parametric projection | ParamPaCMAP (trained network for projecting novel inputs to 3D) |
| Clustering | HDBSCAN on 3D positions |
| Neighbor search | FAISS (IndexFlatIP, cosine similarity) |
| Rendering | React Three Fiber v9, InstancedMesh, custom GLSL shaders (single draw call) |
| Search | Fuse.js fuzzy matching |
| State | Zustand |
| Build | Vite, TypeScript |
| API | FastAPI (Python, async) |

## References

Noosphere builds on these foundational works:

| Component | Paper | Authors | Year |
|-----------|-------|---------|------|
| Sentence embeddings | [Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks](https://arxiv.org/abs/1908.10084) | Reimers & Gurevych | 2019 |
| MiniLM model | [MiniLM: Deep Self-Attention Distillation for Task-Agnostic Compression of Pre-Trained Transformers](https://arxiv.org/abs/2002.10957) | Wang et al. | 2020 |
| Dimensionality reduction | [Understanding How Dimension Reduction Tools Work: An Empirical Approach to Deciphering t-SNE, UMAP, TriMap, and PaCMAP for Data Visualization](https://arxiv.org/abs/2012.04456) | Wang et al. | 2021 |
| Parametric projection | [Navigating the Effect of Parametrization for Dimensionality Reduction](https://arxiv.org/abs/2411.15894) | Huang et al. | 2024 |
| Neighbor search | [The Faiss Library](https://arxiv.org/abs/2401.08281) | Douze et al. | 2024 |
| Clustering | [Density-Based Clustering Based on Hierarchical Density Estimates](https://doi.org/10.1007/978-3-642-37456-2_14) | Campello et al. | 2013 |

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE).

### Commercial Licensing

If you'd like to use Noosphere in a proprietary product or service without the AGPL v3 obligations, commercial licenses are available. Contact [@davidkny22 on GitHub](https://github.com/davidkny22) to discuss.
