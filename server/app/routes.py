"""API routes — all endpoints are thin wrappers around SpaceEngine."""
from __future__ import annotations

from fastapi import APIRouter, Request

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


@router.get("/health", response_model=HealthResponse)
def health(request: Request):
    engine = request.app.state.engine
    return HealthResponse(
        model=engine.model_name,
        num_points=engine.num_points,
    )


@router.post("/embed", response_model=EmbedResponse)
def embed(body: EmbedRequest, request: Request):
    engine = request.app.state.engine
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
    engine = request.app.state.engine
    results = engine.find_neighbors(body.index, k=body.k)
    return NeighborsResponse(
        neighbors=[
            Neighbor(term=engine.terms[idx], index=idx, distance=dist)
            for idx, dist in results
        ],
    )


@router.post("/bias", response_model=BiasResponse)
def bias(body: BiasRequest, request: Request):
    engine = request.app.state.engine
    scores = engine.compute_bias_scores(body.pole_a, body.pole_b)
    return BiasResponse(
        scores=[
            BiasScore(term=term, index=idx, score=score)
            for idx, term, score in scores
        ],
    )


@router.post("/analogy", response_model=AnalogyResponse)
def analogy(body: AnalogyRequest, request: Request):
    engine = request.app.state.engine
    term, idx, coords, neighbors = engine.analogy(body.a, body.b, body.c, k=body.k)
    return AnalogyResponse(
        result_term=term,
        coords_3d=coords,
        neighbors=[
            Neighbor(term=engine.terms[n_idx], index=n_idx, distance=dist)
            for n_idx, dist in neighbors
        ],
    )


@router.post("/compare", response_model=CompareResponse)
def compare(body: CompareRequest, request: Request):
    engine = request.app.state.engine
    similarity, coords_a, coords_b = engine.compare(body.text_a, body.text_b)
    return CompareResponse(
        similarity=similarity,
        coords_a=coords_a,
        coords_b=coords_b,
    )
