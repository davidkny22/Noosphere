"""Pydantic request/response schemas matching the frontend EmbeddingService interface."""
from __future__ import annotations

import re

from pydantic import BaseModel, Field, field_validator


# Space name pattern: lowercase alphanumeric + hyphens only
_SPACE_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")


def _validate_space(v: str) -> str:
    if not _SPACE_RE.match(v):
        raise ValueError("space must be lowercase alphanumeric with hyphens (e.g. 'minilm-10k')")
    return v


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
    space: str
    text: str = Field(max_length=10_000)
    k: int = Field(default=10, ge=1, le=100)

    @field_validator("space")
    @classmethod
    def check_space(cls, v: str) -> str:
        return _validate_space(v)


class EmbedResponse(BaseModel):
    coords_3d: tuple[float, float, float]
    neighbors: list[Neighbor]


# --- /neighbors ---

class NeighborsRequest(BaseModel):
    space: str
    index: int = Field(ge=0)
    k: int = Field(default=10, ge=1, le=100)

    @field_validator("space")
    @classmethod
    def check_space(cls, v: str) -> str:
        return _validate_space(v)


class NeighborsResponse(BaseModel):
    neighbors: list[Neighbor]


# --- /bias ---

class BiasRequest(BaseModel):
    space: str
    pole_a: str = Field(max_length=10_000)
    pole_b: str = Field(max_length=10_000)

    @field_validator("space")
    @classmethod
    def check_space(cls, v: str) -> str:
        return _validate_space(v)


class BiasScore(BaseModel):
    term: str
    index: int
    score: float


class BiasResponse(BaseModel):
    scores: list[BiasScore]


# --- /analogy ---

class AnalogyRequest(BaseModel):
    space: str
    a: str = Field(max_length=10_000)
    b: str = Field(max_length=10_000)
    c: str = Field(max_length=10_000)
    k: int = Field(default=10, ge=1, le=100)

    @field_validator("space")
    @classmethod
    def check_space(cls, v: str) -> str:
        return _validate_space(v)


class AnalogyResponse(BaseModel):
    result_term: str
    coords_3d: tuple[float, float, float]
    neighbors: list[Neighbor]
    index_a: int | None = None
    index_b: int | None = None
    index_c: int | None = None


# --- /compare ---

class CompareRequest(BaseModel):
    space: str
    text_a: str = Field(max_length=10_000)
    text_b: str = Field(max_length=10_000)

    @field_validator("space")
    @classmethod
    def check_space(cls, v: str) -> str:
        return _validate_space(v)


class CompareResponse(BaseModel):
    similarity: float
    coords_a: tuple[float, float, float]
    coords_b: tuple[float, float, float]
    index_a: int | None = None  # index in space if found, None if novel
    index_b: int | None = None


# --- /health ---

class HealthResponse(BaseModel):
    status: str = "ok"
    spaces: list[str]
