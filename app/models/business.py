"""The structured business strategy (spec section 8)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


class BusinessStrategy(BaseModel):
    business_name: str | None = None
    description: str = ""
    category: str = "general"

    target_age_min: int | None = None
    target_age_max: int | None = None

    # Income floor used for the high_income_share metric, e.g. "100000+".
    target_income: str | None = None

    price_positioning: Literal["value", "mass_market", "premium", "luxury"] = "mass_market"
    geographic_scope: Literal["metro", "state"] = "metro"

    priorities: dict[str, float] = Field(default_factory=dict)

    @field_validator("target_age_max")
    @classmethod
    def _age_range_ordered(cls, v: int | None, info):
        lo = info.data.get("target_age_min")
        if v is not None and lo is not None and v < lo:
            raise ValueError("target_age_max must be >= target_age_min")
        return v


class ParseRequest(BaseModel):
    description: str = Field(min_length=1)


class ParseResponse(BaseModel):
    strategy: BusinessStrategy
    initial_weights: dict[str, float]
    provider: str
    notes: list[str] = Field(default_factory=list)
