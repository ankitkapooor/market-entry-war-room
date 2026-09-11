"""Shared fixtures. Tests never call an external API."""

from __future__ import annotations

import pytest

from app.config import settings
from app.models.market import MarketMetrics


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    """Keep every test hermetic regardless of what is in the developer's .env.

    Tests that exercise a provider mock its HTTP calls explicitly.
    """
    monkeypatch.setattr(settings, "llm_provider", "heuristic")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "census_api_key", "")


def metrics(market_id: str, name: str, **overrides) -> MarketMetrics:
    base = dict(
        market_id=market_id,
        name=name,
        vintage=2023,
        population=1_000_000,
        target_population=300_000,
        target_age_share=0.30,
        median_household_income=80_000,
        high_income_share=0.35,
        population_growth=0.02,
        income_growth=0.20,
        bachelor_degree_share=0.35,
        median_rent=1_300,
        competitive_density=None,
    )
    base.update(overrides)
    return MarketMetrics(**base)


@pytest.fixture
def three_markets() -> list[MarketMetrics]:
    """A deliberately lopsided set: one big/expensive, one small/cheap, one middling."""
    return [
        metrics(
            "A",
            "Big Expensive Metro",
            population=8_000_000,
            median_household_income=120_000,
            high_income_share=0.55,
            population_growth=0.00,
            income_growth=0.15,
            median_rent=2_200,
            target_population=2_400_000,
            target_age_share=0.30,
            bachelor_degree_share=0.50,
        ),
        metrics(
            "B",
            "Small Cheap Metro",
            population=500_000,
            median_household_income=62_000,
            high_income_share=0.20,
            population_growth=0.09,
            income_growth=0.28,
            median_rent=1_000,
            target_population=130_000,
            target_age_share=0.26,
            bachelor_degree_share=0.28,
        ),
        metrics("C", "Middling Metro"),
    ]
