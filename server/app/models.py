"""Pydantic request/response schemas matching the frontend EmbeddingService interface."""
from __future__ import annotations

from pydantic import BaseModel


# --- Shared types ---

class Neighbor(BaseModel):
    term: str
    index: int
    distance: float


class Coords3D(BaseModel):
    x: float
    y: float
    z: float

    def to_tuple(self) -> tuple[float, float, float]:
        return (self.x, self.y, self.z)


# --- /embed ---

class EmbedRequest(BaseModel):
    text: str
    k: int = 10


class EmbedResponse(BaseModel):
    coords_3d: tuple[float, float, float]
    neighbors: list[Neighbor]


# --- /neighbors ---

class NeighborsRequest(BaseModel):
    index: int
    k: int = 10


class NeighborsResponse(BaseModel):
    neighbors: list[Neighbor]


# --- /bias ---

class BiasRequest(BaseModel):
    pole_a: str
    pole_b: str


class BiasScore(BaseModel):
    term: str
    index: int
    score: float


class BiasResponse(BaseModel):
    scores: list[BiasScore]


# --- /analogy ---

class AnalogyRequest(BaseModel):
    a: str
    b: str
    c: str
    k: int = 10


class AnalogyResponse(BaseModel):
    result_term: str
    coords_3d: tuple[float, float, float]
    neighbors: list[Neighbor]


# --- /compare ---

class CompareRequest(BaseModel):
    text_a: str
    text_b: str


class CompareResponse(BaseModel):
    similarity: float
    coords_a: tuple[float, float, float]
    coords_b: tuple[float, float, float]


# --- /health ---

class HealthResponse(BaseModel):
    status: str = "ok"
    model: str
    num_points: int
