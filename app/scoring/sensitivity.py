"""Monte Carlo weight sensitivity (spec sections 17-19).

The question is not "which market ranks first" but "does it still rank first if
our weights were somewhat different?". Weights are perturbed within a band,
renormalized to 1.0, and the whole simulation is one matrix product.
"""

from __future__ import annotations

import numpy as np

from app.scoring.attractiveness import ScoringResult


def simulate(
    result: ScoringResult,
    iterations: int = 1000,
    weight_variation: float = 0.25,
    seed: int = 42,
) -> list[dict]:
    """Perturb weights by +/- weight_variation and record rank stability.

    Returns one dict per market with mean score, rank distribution and top-N
    probabilities, in the market order of `result`.
    """
    factors = result.factor_order
    n_markets = len(result.market_ids)

    # markets x factors. A factor a market cannot be scored on gets that
    # market's own mean, so it is neither rewarded nor punished for the gap.
    matrix = np.zeros((n_markets, len(factors)))
    for i, factor_scores in enumerate(result.factor_scores):
        present = [factor_scores[f] for f in factors if f in factor_scores]
        fallback = float(np.mean(present)) if present else 0.0
        for j, factor in enumerate(factors):
            matrix[i, j] = factor_scores.get(factor, fallback)

    base = np.array([result.effective_weights[f] for f in factors])

    rng = np.random.default_rng(seed)
    multipliers = rng.uniform(1 - weight_variation, 1 + weight_variation, size=(iterations, len(factors)))
    perturbed = base * multipliers
    perturbed /= perturbed.sum(axis=1, keepdims=True)

    # (markets x factors) @ (factors x iterations) -> markets x iterations
    sim_scores = matrix @ perturbed.T

    # Rank 1 = highest score. argsort twice converts order to rank position.
    order = np.argsort(-sim_scores, axis=0)
    ranks = np.empty_like(order)
    iteration_index = np.arange(sim_scores.shape[1])
    ranks[order, iteration_index] = np.arange(n_markets)[:, None]
    ranks = ranks + 1

    return [
        {
            "market_id": result.market_ids[i],
            "name": result.names[i],
            "mean_score": round(float(sim_scores[i].mean()), 2),
            "mean_rank": round(float(ranks[i].mean()), 2),
            "rank_std": round(float(ranks[i].std()), 2),
            "rank_p10": float(np.percentile(ranks[i], 10)),
            "rank_median": float(np.median(ranks[i])),
            "rank_p90": float(np.percentile(ranks[i], 90)),
            "top_3_probability": round(float((ranks[i] <= 3).mean()), 4),
            "top_5_probability": round(float((ranks[i] <= 5).mean()), 4),
        }
        for i in range(n_markets)
    ]
