"""Monte Carlo weight sensitivity (spec sections 18 and 19)."""

import pytest

from app.scoring.attractiveness import score_markets
from app.scoring.sensitivity import simulate
from app.strategy.weights import resolve_weights

WEIGHTS = resolve_weights(None)


def test_probabilities_and_ranks_are_well_formed(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    sims = simulate(result, iterations=200)

    assert len(sims) == len(three_markets)
    for sim in sims:
        assert 1 <= sim["mean_rank"] <= len(three_markets)
        assert 0.0 <= sim["top_3_probability"] <= 1.0
        assert sim["rank_std"] >= 0


def test_every_market_is_in_the_top_three_when_there_are_only_three(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    assert all(s["top_3_probability"] == 1.0 for s in simulate(result, iterations=100))


def test_same_seed_gives_identical_results(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    assert simulate(result, iterations=200, seed=7) == simulate(result, iterations=200, seed=7)


def test_zero_variation_reproduces_the_base_ranking(three_markets):
    """With no perturbation every simulation is the base scenario."""
    result = score_markets(three_markets, WEIGHTS)
    sims = simulate(result, iterations=50, weight_variation=1e-9)

    by_id = {s["market_id"]: s for s in sims}
    for i, market_id in enumerate(result.market_ids):
        assert by_id[market_id]["mean_score"] == pytest.approx(result.scores[i], abs=0.05)
        assert by_id[market_id]["rank_std"] == 0.0


def test_a_dominant_market_stays_rank_one_under_perturbation():
    """Rank stability is the output that matters, not the base rank."""
    from tests.conftest import metrics

    markets = [
        metrics("A", "Dominant", population=9_000_000, median_household_income=150_000,
                high_income_share=0.7, population_growth=0.10, income_growth=0.30,
                median_rent=900, target_population=3_500_000, target_age_share=0.39,
                bachelor_degree_share=0.60),
        metrics("B", "Weak", population=300_000, median_household_income=50_000,
                high_income_share=0.10, population_growth=-0.01, income_growth=0.10,
                median_rent=2_500, target_population=70_000, target_age_share=0.23,
                bachelor_degree_share=0.20),
        metrics("C", "Middling"),
    ]
    result = score_markets(markets, WEIGHTS)
    sims = {s["market_id"]: s for s in simulate(result, iterations=500)}
    assert sims["A"]["mean_rank"] == 1.0
    assert sims["A"]["rank_std"] == 0.0
