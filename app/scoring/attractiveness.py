"""Composite factors and the overall attractiveness score (sections 13-16)."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.config import factor_metrics
from app.models.market import MarketMetrics
from app.scoring.normalize import normalize_metric
from app.strategy.weights import redistribute


@dataclass
class ScoringResult:
    market_ids: list[str]
    names: list[str]
    scores: list[float]
    factor_scores: list[dict[str, float]]
    metric_scores: list[dict[str, float]]
    metrics: list[dict[str, float | None]]
    effective_weights: dict[str, float]
    factor_order: list[str]
    warnings: list[str] = field(default_factory=list)


def normalized_metric_table(markets: list[MarketMetrics]) -> dict[str, list[float | None]]:
    """{metric: per-market 0-100 score}, direction applied."""
    raw = {market.market_id: market.scored_values() for market in markets}
    metric_names = list(next(iter(raw.values())).keys())
    table: dict[str, list[float | None]] = {}
    for metric in metric_names:
        column = [raw[m.market_id][metric] for m in markets]
        table[metric] = normalize_metric(metric, column)
    return table


def _factor_score(
    metric_weights: dict[str, float], metric_scores: dict[str, float]
) -> float | None:
    """Weighted average over the metrics that are present, renormalized.

    If half of a factor's metrics are missing, the remaining ones carry the
    factor rather than the factor being dragged toward zero.
    """
    available = {m: w for m, w in metric_weights.items() if m in metric_scores and w > 0}
    total = sum(available.values())
    if total <= 0:
        return None
    return sum(metric_scores[m] * w for m, w in available.items()) / total


def score_markets(markets: list[MarketMetrics], weights: dict[str, float]) -> ScoringResult:
    """Score and rank markets under a set of factor weights."""
    table = normalized_metric_table(markets)
    definitions = factor_metrics()

    per_market_metric_scores: list[dict[str, float]] = []
    per_market_factor_scores: list[dict[str, float | None]] = []

    for i, _market in enumerate(markets):
        metric_scores = {
            metric: column[i] for metric, column in table.items() if column[i] is not None
        }
        per_market_metric_scores.append(metric_scores)
        per_market_factor_scores.append(
            {
                factor: _factor_score(metric_weights, metric_scores)
                for factor, metric_weights in definitions.items()
            }
        )

    # A factor survives only if at least one market can be scored on it.
    available = {
        factor
        for factor in definitions
        if any(scores[factor] is not None for scores in per_market_factor_scores)
    }
    effective_weights, warnings = redistribute(weights, available)
    factor_order = sorted(effective_weights)
    # Report every factor that has data, including ones the caller gave no
    # weight. Only the weighted ones move the score, but a caller asking "what
    # are we ignoring?" needs to see the rest.
    reported_factors = sorted(available)

    scores: list[float] = []
    clean_factor_scores: list[dict[str, float]] = []
    for factor_scores in per_market_factor_scores:
        clean_factor_scores.append(
            {
                f: round(factor_scores[f], 2)
                for f in reported_factors
                if factor_scores[f] is not None
            }
        )

        # A market missing a factor that others have: renormalize over what it has.
        present = {f: factor_scores[f] for f in factor_order if factor_scores[f] is not None}
        weight_total = sum(effective_weights[f] for f in present)
        if weight_total <= 0:
            scores.append(0.0)
            continue
        scores.append(
            round(sum(present[f] * effective_weights[f] for f in present) / weight_total, 2)
        )

    partial = [
        markets[i].name
        for i, fs in enumerate(per_market_factor_scores)
        if any(fs[f] is None for f in factor_order)
    ]
    if partial:
        warnings.append(
            f"{len(partial)} market(s) were scored on a subset of factors due to missing "
            f"metrics: {', '.join(partial[:5])}{'...' if len(partial) > 5 else ''}"
        )

    return ScoringResult(
        market_ids=[m.market_id for m in markets],
        names=[m.name for m in markets],
        scores=scores,
        factor_scores=clean_factor_scores,
        metric_scores=[{k: round(v, 2) for k, v in s.items()} for s in per_market_metric_scores],
        metrics=[m.scored_values() for m in markets],
        effective_weights=effective_weights,
        factor_order=factor_order,
        warnings=warnings,
    )


def ranked_indices(scores: list[float]) -> list[int]:
    """Market indices ordered best to worst."""
    return sorted(range(len(scores)), key=lambda i: -scores[i])
