"""Percentile normalization to 0-100 (spec sections 11 and 12).

Percentile rank is used instead of min-max because a single extreme market
(New York on population, San Jose on income) would otherwise compress everyone
else into the bottom of the scale.
"""

from __future__ import annotations

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

    # Average ranks for ties, implemented locally to avoid shipping SciPy just
    # for this small operation. Ranks are one-based to match scipy.rankdata.
    ordered = sorted(enumerate(v for _, v in present), key=lambda item: item[1])
    ranks = [0.0] * len(present)
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end][1] == ordered[start][1]:
            end += 1
        average_rank = ((start + 1) + end) / 2
        for position in range(start, end):
            ranks[ordered[position][0]] = average_rank
        start = end

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
