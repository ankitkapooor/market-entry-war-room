"""Income, growth and cost metrics."""

from __future__ import annotations

from app.clients.census import INCOME_BRACKET_METRIC, INCOME_BRACKETS

INCOME_BRACKET_EDGES = [lower for lower, _ in INCOME_BRACKETS]


def snap_income_threshold(threshold: float) -> int:
    """Census income brackets have fixed edges; snap to the nearest one.

    The caller should report the snapped value so the number behind
    high_income_share is never misrepresented.
    """
    return min(INCOME_BRACKET_EDGES, key=lambda edge: abs(edge - threshold))


def high_income_share(
    brackets: dict[str, float], households: float | None, threshold: float
) -> float | None:
    """Share of households at or above the snapped income threshold."""
    if not households:
        return None
    edge = snap_income_threshold(threshold)
    above = [
        brackets[INCOME_BRACKET_METRIC.format(lower=lower)]
        for lower in INCOME_BRACKET_EDGES
        if lower >= edge and INCOME_BRACKET_METRIC.format(lower=lower) in brackets
    ]
    if not above:
        return None
    return sum(above) / households


def growth(current: float | None, prior: float | None) -> float | None:
    """Simple period-over-period growth. Returns None if either vintage is missing."""
    if current is None or prior is None or prior == 0:
        return None
    return current / prior - 1
