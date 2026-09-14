"""The structured business strategy (spec section 8)."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class BusinessStrategy(BaseModel):
    business_name: str | None = Field(default=None, max_length=120)
    description: str = Field(default="", max_length=2000)
    category: str = Field(default="general", max_length=64)

    target_age_min: int | None = Field(default=None, ge=0, le=99)
    target_age_max: int | None = Field(default=None, ge=0, le=99)

    # Income floor used for the high_income_share metric, e.g. "100000+".
    target_income: str | None = Field(default=None, max_length=32)

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
    model_config = ConfigDict(str_strip_whitespace=True)

    description: str = Field(min_length=1, max_length=2000)


class ParseResponse(BaseModel):
    strategy: BusinessStrategy
    initial_weights: dict[str, float]
    provider: str
    notes: list[str] = Field(default_factory=list)
