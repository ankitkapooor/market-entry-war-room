"""Age and education metrics derived from stored bracket counts."""

from __future__ import annotations

from app.clients.census import AGE_BRACKETS


def prorated_age_population(
    brackets: dict[str, float], age_min: int, age_max: int
) -> float | None:
    """Population inside [age_min, age_max], prorating partly-covered brackets.

    Brackets fully inside the range count in full. A partly-covered bracket
    contributes in proportion to the years that overlap, so a 25-40 target
    takes 1/5 of age_40_44 (age 40 of ages 40-44).
    """
    total = 0.0
    found = False
    for metric, lo, hi, _male, _female in AGE_BRACKETS:
        value = brackets.get(metric)
        if value is None:
            continue
        overlap_lo = max(lo, age_min)
        overlap_hi = min(hi, age_max)
        if overlap_hi < overlap_lo:
            continue
        bracket_years = hi - lo + 1
        overlap_years = overlap_hi - overlap_lo + 1
        total += value * (overlap_years / bracket_years)
        found = True
    return total if found else None


def bachelor_degree_share(edu_total: float | None, edu_bachelor_plus: float | None) -> float | None:
    if not edu_total or edu_bachelor_plus is None:
        return None
    return edu_bachelor_plus / edu_total
