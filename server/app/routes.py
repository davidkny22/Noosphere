"""API routes — all endpoints are thin wrappers around SpaceEngine."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from .engine import SpaceEngine
from .models import (
    AnalogyRequest,
    AnalogyResponse,
    BiasRequest,
    BiasResponse,
    BiasScore,
    CompareRequest,
    CompareResponse,
    EmbedRequest,
    EmbedResponse,
    HealthResponse,
    Neighbor,
    NeighborsRequest,
    NeighborsResponse,
)

router = APIRouter()


def _get_engine(request: Request, space: str) -> SpaceEngine:
    """Look up engine by space prefix, raise 404 if not found."""
    engines: dict[str, SpaceEngine] = request.app.state.engines
    if space not in engines:
        raise HTTPException(
            status_code=404,
            detail=f"Space '{space}' not found. Available: {list(engines.keys())}",
        )
    return engines[space]


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    return HealthResponse(
        spaces=list(request.app.state.engines.keys()),
    )


@router.post("/embed", response_model=EmbedResponse)
def embed(body: EmbedRequest, request: Request):
    engine = _get_engine(request, body.space)
    coords, neighbors = engine.embed_text(body.text, k=body.k)
    return EmbedResponse(
        coords_3d=coords,
        neighbors=[
            Neighbor(term=engine.terms[idx], index=idx, distance=dist)
            for idx, dist in neighbors
        ],
    )


@router.post("/neighbors", response_model=NeighborsResponse)
def neighbors(body: NeighborsRequest, request: Request):
    engine = _get_engine(request, body.space)
    if body.index >= engine.num_points:
        raise HTTPException(
            status_code=400,
            detail=f"index {body.index} out of range (space has {engine.num_points} points)",
        )
    results = engine.find_neighbors(body.index, k=body.k)
    return NeighborsResponse(
        neighbors=[
            Neighbor(term=engine.terms[idx], index=idx, distance=dist)
            for idx, dist in results
        ],
    )


@router.post("/bias", response_model=BiasResponse)
def bias(body: BiasRequest, request: Request):
    engine = _get_engine(request, body.space)
    scores = engine.compute_bias_scores(body.pole_a, body.pole_b)
    return BiasResponse(
        scores=[
            BiasScore(term=term, index=idx, score=score)
            for idx, term, score in scores
        ],
    )


@router.post("/analogy", response_model=AnalogyResponse)
def analogy(body: AnalogyRequest, request: Request):
    engine = _get_engine(request, body.space)
    term, idx, coords, neighbors, idx_a, idx_b, idx_c = engine.analogy(body.a, body.b, body.c, k=body.k)
    return AnalogyResponse(
        result_term=term,
        coords_3d=coords,
        neighbors=[
            Neighbor(term=engine.terms[n_idx], index=n_idx, distance=dist)
            for n_idx, dist in neighbors
        ],
        index_a=idx_a,
        index_b=idx_b,
        index_c=idx_c,
    )


@router.post("/compare", response_model=CompareResponse)
def compare(body: CompareRequest, request: Request):
    engine = _get_engine(request, body.space)
    similarity, coords_a, coords_b, idx_a, idx_b = engine.compare(body.text_a, body.text_b)
    return CompareResponse(
        similarity=similarity,
        coords_a=coords_a,
        coords_b=coords_b,
        index_a=idx_a,
        index_b=idx_b,
    )
