"""Competitive density: the plug-in seam.

No public source covers every business category consistently, so the MVP ships
without competition data. This is deliberate: the scoring model must work when
a factor is absent, and returning None here exercises the weight-redistribution
path (spec section 16) on every request.

To plug in a dataset later, have competitive_density() return
{market_id: establishments per 100k residents}. Nothing else needs to change.
"""

from __future__ import annotations


def competitive_density(market_ids: list[str], category: str) -> dict[str, float]:
    """Competing establishments per 100k residents, keyed by market id.

    Returns an empty mapping in the MVP; markets absent from the mapping are
    treated as missing data, never as zero competition.
    """
    return {}
