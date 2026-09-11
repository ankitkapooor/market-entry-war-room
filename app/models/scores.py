"""Scoring output models."""

from __future__ import annotations

from pydantic import BaseModel, Field


class FactorScore(BaseModel):
    factor: str
    score: float


class ScoredMarket(BaseModel):
    rank: int
    market_id: str
    name: str
    score: float
    factor_scores: dict[str, float] = Field(default_factory=dict)
    metric_scores: dict[str, float] = Field(default_factory=dict)
    metrics: dict[str, float | None] = Field(default_factory=dict)
    strengths: list[FactorScore] = Field(default_factory=list)
    weaknesses: list[FactorScore] = Field(default_factory=list)


class TradeOff(BaseModel):
    factor: str
    difference: float
    favors: str


class MarketComparison(BaseModel):
    markets: list[ScoredMarket]
    trade_offs: dict[str, list[TradeOff]] = Field(default_factory=dict)


class MarketSensitivity(BaseModel):
    market_id: str
    name: str
    base_rank: int
    mean_score: float
    mean_rank: float
    rank_std: float
    rank_p10: float
    rank_median: float
    rank_p90: float
    top_3_probability: float
    top_5_probability: float


class SensitivityResponse(BaseModel):
    scenario_id: str
    iterations: int
    weight_variation: float
    markets: list[MarketSensitivity]
