"""Percentile normalization to 0-100 (spec sections 11 and 12).

Percentile rank is used instead of min-max because a single extreme market
(New York on population, San Jose on income) would otherwise compress everyone
else into the bottom of the scale.
"""

from __future__ import annotations

from scipy.stats import rankdata

from app.config import metric_direction


def percentile_scores(values: list[float | None]) -> list[float | None]:
    """Rank the non-missing values to 0-100. Missing values stay missing.

    Ties share the average rank. A single observed value scores 50 because a
    percentile is meaningless with no one to compare against.
    """
    present = [(i, v) for i, v in enumerate(values) if v is not None]
    out: list[float | None] = [None] * len(values)
    if not present:
        return out
    if len(present) == 1:
        out[present[0][0]] = 50.0
        return out

    ranks = rankdata([v for _, v in present], method="average")
    span = len(present) - 1
    for (index, _), rank in zip(present, ranks):
        out[index] = float((rank - 1) / span * 100)
    return out


def normalize_metric(metric: str, values: list[float | None]) -> list[float | None]:
    """Percentile scores, flipped for metrics where higher is worse."""
    scores = percentile_scores(values)
    if metric_direction(metric) == "negative":
        return [None if s is None else 100.0 - s for s in scores]
    return scores
