"""Translate a business strategy into the analytical parameters it implies."""

from __future__ import annotations

from app.market_data.geography import (
    DEFAULT_AGE_MAX,
    DEFAULT_AGE_MIN,
    parse_income_threshold,
)
from app.market_data.economics import snap_income_threshold
from app.models.business import BusinessStrategy


def criteria_for(strategy: BusinessStrategy) -> dict:
    """The concrete numbers the scoring run will use, so they can be displayed.

    Census income brackets have fixed edges, so the requested income floor is
    snapped; the snapped value is reported rather than the requested one.
    """
    age_min = strategy.target_age_min if strategy.target_age_min is not None else DEFAULT_AGE_MIN
    age_max = strategy.target_age_max if strategy.target_age_max is not None else DEFAULT_AGE_MAX
    requested = parse_income_threshold(strategy.target_income)
    applied = snap_income_threshold(requested)

    notes = []
    if strategy.target_age_min is None or strategy.target_age_max is None:
        notes.append(f"Target age range defaulted to {age_min}-{age_max}.")
    if applied != requested:
        notes.append(
            f"Income floor {requested:,.0f} snapped to {applied:,.0f}, "
            "the nearest Census household-income bracket edge."
        )

    return {
        "target_age_min": age_min,
        "target_age_max": age_max,
        "income_threshold": float(applied),
        "category": strategy.category,
        "notes": notes,
    }
