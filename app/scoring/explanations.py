"""Strengths, weaknesses and trade-offs (spec sections 20 and 21).

All of it is derived from factor scores by sorting. No language model decides
which dimensions are strengths.
"""

from __future__ import annotations

from app.models.scores import FactorScore, TradeOff


def strengths_and_weaknesses(
    factor_scores: dict[str, float], top_n: int = 2, bottom_n: int = 2
) -> tuple[list[FactorScore], list[FactorScore]]:
    """Highest-scoring factors are strengths, lowest are weaknesses."""
    if not factor_scores:
        return [], []

    # Sort by score, then by name, so equal scores produce a stable order.
    ordered = sorted(factor_scores.items(), key=lambda kv: (-kv[1], kv[0]))
    strengths = [FactorScore(factor=f, score=s) for f, s in ordered[:top_n]]

    # Never report the same factor as both a strength and a weakness.
    remaining = ordered[top_n:]
    weakest = sorted(remaining, key=lambda kv: (kv[1], kv[0]))[:bottom_n]
    weaknesses = [FactorScore(factor=f, score=s) for f, s in weakest]
    return strengths, weaknesses


def trade_offs(
    a_name: str,
    a_scores: dict[str, float],
    b_name: str,
    b_scores: dict[str, float],
    min_difference: float = 5.0,
) -> list[TradeOff]:
    """Where each market beats the other, largest gap first."""
    shared = set(a_scores) & set(b_scores)
    out = []
    for factor in shared:
        difference = a_scores[factor] - b_scores[factor]
        if abs(difference) < min_difference:
            continue
        out.append(
            TradeOff(
                factor=factor,
                difference=round(abs(difference), 2),
                favors=a_name if difference > 0 else b_name,
            )
        )
    return sorted(out, key=lambda t: -t.difference)
