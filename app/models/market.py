"""Market and metric response models (spec sections 10 and 27)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class MetricValue(BaseModel):
    """A single number plus where it came from."""

    metric: str
    value: float | None
    source: str
    vintage: int


class MarketMetrics(BaseModel):
    market_id: str
    name: str
    state_codes: str = ""
    vintage: int

    population: float | None = None

    target_population: float | None = None
    target_age_share: float | None = None

    median_household_income: float | None = None
    high_income_share: float | None = None

    population_growth: float | None = None
    income_growth: float | None = None

    bachelor_degree_share: float | None = None

    median_rent: float | None = None

    competitive_density: float | None = None

    def scored_values(self) -> dict[str, float | None]:
        """The ten metric values, keyed by metric name."""
        return {
            "population": self.population,
            "target_population": self.target_population,
            "target_age_share": self.target_age_share,
            "median_household_income": self.median_household_income,
            "high_income_share": self.high_income_share,
            "population_growth": self.population_growth,
            "income_growth": self.income_growth,
            "bachelor_degree_share": self.bachelor_degree_share,
            "median_rent": self.median_rent,
            "competitive_density": self.competitive_density,
        }


class MarketSummary(BaseModel):
    market_id: str
    name: str
    state_codes: str = ""


class MarketDetail(BaseModel):
    market_id: str
    name: str
    state_codes: str = ""
    metrics: list[MetricValue] = Field(default_factory=list)
