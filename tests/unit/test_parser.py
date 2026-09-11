"""Business-description parsing (spec sections 8 and 9)."""

import pytest

from app.config import default_weights
from app.strategy.parser import parse_business

SPEC_EXAMPLE = (
    "A premium fitness studio aimed at affluent professionals aged 25-44, "
    "with membership pricing around $180/month."
)


def test_spec_example_parses_to_the_spec_assumptions():
    parsed = parse_business(SPEC_EXAMPLE)
    strategy = parsed.strategy

    assert strategy.category == "fitness"
    assert strategy.target_age_min == 25
    assert strategy.target_age_max == 44
    assert strategy.price_positioning == "premium"
    assert strategy.target_income == "100000+"


def test_weights_always_sum_to_one():
    parsed = parse_business(SPEC_EXAMPLE)
    assert sum(parsed.initial_weights.values()) == pytest.approx(1.0, abs=1e-3)
    assert set(parsed.initial_weights) == set(default_weights())


def test_premium_positioning_raises_the_affluence_weight():
    premium = parse_business("A high-end salon.").initial_weights
    value = parse_business("A budget discount haircut chain.").initial_weights

    assert premium["affluence"] > default_weights()["affluence"]
    assert value["cost"] > premium["cost"]


@pytest.mark.parametrize(
    "description,expected",
    [
        ("A skincare brand for gen z women.", (18, 27)),
        ("A coworking space for millennials.", (28, 43)),
        ("Products for customers under 30.", (18, 30)),
        ("A clinic serving patients over 65.", (65, 99)),
    ],
)
def test_age_ranges_from_language(description, expected):
    strategy = parse_business(description).strategy
    assert (strategy.target_age_min, strategy.target_age_max) == expected


def test_vague_description_does_not_invent_an_age_range():
    parsed = parse_business("A business that sells things to people.")
    assert parsed.strategy.target_age_min is None
    assert any("age" in note.lower() for note in parsed.notes)


def test_every_inferred_assumption_is_reported():
    """Assumptions must be visible so the user can edit them."""
    parsed = parse_business("A shop.")
    assert parsed.notes
    assert parsed.provider == "heuristic"


def test_price_in_the_description_does_not_become_an_age_range():
    strategy = parse_business("Memberships at $180/month.").strategy
    assert strategy.target_age_min is None
