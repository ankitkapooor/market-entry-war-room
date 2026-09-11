"""Weight validation and missing-data redistribution (spec sections 13 and 16)."""

import pytest

from app.errors import InvalidWeights
from app.strategy.weights import redistribute, resolve_weights, validate_weights

VALID = {
    "market_size": 0.20,
    "affluence": 0.20,
    "growth": 0.20,
    "customer_fit": 0.20,
    "competition": 0.10,
    "cost": 0.10,
}


def test_valid_weights_pass_through():
    assert validate_weights(VALID) == VALID


def test_weights_not_summing_to_one_are_rejected():
    with pytest.raises(InvalidWeights, match="sum to 1.0"):
        validate_weights({**VALID, "cost": 0.30})


def test_unknown_factor_is_rejected():
    with pytest.raises(InvalidWeights, match="Unknown factor"):
        validate_weights({**VALID, "vibes": 0.0})


def test_negative_weight_is_rejected():
    with pytest.raises(InvalidWeights, match="non-negative"):
        validate_weights({**VALID, "cost": -0.10, "affluence": 0.40})


def test_empty_weights_rejected():
    with pytest.raises(InvalidWeights):
        validate_weights({})


def test_redistribution_matches_the_spec_example():
    """Section 16: dropping competition's 10% lifts the four 20s to 22.22."""
    available = {"market_size", "customer_fit", "affluence", "growth", "cost"}
    weights, warnings = redistribute(VALID, available)

    assert weights["market_size"] == pytest.approx(0.2222, abs=1e-4)
    assert weights["cost"] == pytest.approx(0.1111, abs=1e-4)
    assert sum(weights.values()) == pytest.approx(1.0)
    assert "competition" not in weights
    assert len(warnings) == 1 and "competition" in warnings[0]


def test_missing_factor_is_never_scored_as_zero():
    weights, _ = redistribute(VALID, {"growth"})
    assert weights == {"growth": 1.0}


def test_redistribution_with_nothing_available_raises():
    with pytest.raises(InvalidWeights, match="nothing can be scored"):
        redistribute(VALID, set())


def test_resolve_falls_back_to_config_defaults():
    defaults = resolve_weights(None)
    assert sum(defaults.values()) == pytest.approx(1.0)
    assert set(defaults) == set(VALID)
