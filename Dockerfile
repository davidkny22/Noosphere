FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

WORKDIR /app

# Install dependencies first (cached layer)
COPY server/pyproject.toml server/uv.lock ./
RUN uv sync --frozen

# Copy server code
COPY server/app ./app

# Copy space data (FAISS index, embeddings, vocab, ParamPaCMAP model)
COPY web/public/spaces ./spaces

ENV NOOSPHERE_SPACE_DIR=/app/spaces
ENV HOST=0.0.0.0

# Railway provides PORT dynamically
CMD ["uv", "run", "python", "-c", "from app.main import run; run()"]
