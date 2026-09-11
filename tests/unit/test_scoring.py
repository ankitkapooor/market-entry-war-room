"""Composite factors, overall scoring and ranking (spec sections 13-15)."""

import pytest

from app.scoring.attractiveness import (
    normalized_metric_table,
    ranked_indices,
    score_markets,
)
from app.strategy.weights import resolve_weights
from tests.conftest import metrics

WEIGHTS = resolve_weights(None)


def test_scores_stay_inside_the_zero_to_one_hundred_band(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    assert all(0 <= s <= 100 for s in result.scores)


def test_composite_factor_is_the_configured_weighted_average(three_markets):
    """affluence = 0.6 x income score + 0.4 x high-income-share score."""
    result = score_markets(three_markets, WEIGHTS)
    table = normalized_metric_table(three_markets)
    for i in range(len(three_markets)):
        expected = 0.6 * table["median_household_income"][i] + 0.4 * table["high_income_share"][i]
        assert result.factor_scores[i]["affluence"] == pytest.approx(expected, abs=0.01)


def test_competition_is_excluded_when_no_market_has_data(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    assert "competition" not in result.effective_weights
    assert sum(result.effective_weights.values()) == pytest.approx(1.0)
    assert any("competition" in w for w in result.warnings)


def test_ranking_orders_best_first(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    order = ranked_indices(result.scores)
    ranked = [result.scores[i] for i in order]
    assert ranked == sorted(ranked, reverse=True)


def test_changing_weights_changes_the_ranking(three_markets):
    """The whole point of the tool: assumptions drive the answer."""
    growth_focus = {"growth": 0.7, "cost": 0.3}
    size_focus = {"market_size": 0.7, "affluence": 0.3}

    growth_winner = ranked_indices(score_markets(three_markets, growth_focus).scores)[0]
    size_winner = ranked_indices(score_markets(three_markets, size_focus).scores)[0]

    assert three_markets[growth_winner].name == "Small Cheap Metro"
    assert three_markets[size_winner].name == "Big Expensive Metro"


def test_expensive_market_scores_low_on_cost(three_markets):
    result = score_markets(three_markets, WEIGHTS)
    cost_scores = [fs["cost"] for fs in result.factor_scores]
    assert cost_scores[0] < cost_scores[1]  # Big Expensive vs Small Cheap


def test_market_missing_a_metric_is_scored_on_what_it_has():
    """A market with no rent data is not punished with a zero cost score."""
    markets = [
        metrics("A", "Complete", median_rent=1000),
        metrics("B", "No Rent Data", median_rent=None),
    ]
    result = score_markets(markets, WEIGHTS)
    assert "cost" not in result.factor_scores[1]
    assert result.scores[1] > 0
    assert any("subset of factors" in w for w in result.warnings)
