"""Scenario request and response models (spec section 22)."""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.models.business import BusinessStrategy
from app.models.scores import ScoredMarket


class ScenarioRequest(BaseModel):
    business_strategy: BusinessStrategy = Field(default_factory=BusinessStrategy)
    # Omit to use the defaults from config/default_weights.yaml.
    weights: dict[str, float] | None = None
    description: str = ""
    limit: int | None = None


class ScenarioResponse(BaseModel):
    scenario_id: str
    weights: dict[str, float]
    effective_weights: dict[str, float]
    warnings: list[str] = Field(default_factory=list)
    markets: list[ScoredMarket] = Field(default_factory=list)


class SensitivityRequest(BaseModel):
    iterations: int = Field(default=1000, ge=10, le=20000)
    weight_variation: float = Field(default=0.25, gt=0.0, le=1.0)
    seed: int = 42
