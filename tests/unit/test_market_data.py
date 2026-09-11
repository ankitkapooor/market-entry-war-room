"""Strategy-dependent metric derivation."""

import pytest

from app.market_data.demographics import bachelor_degree_share, prorated_age_population
from app.market_data.economics import growth, high_income_share, snap_income_threshold
from app.market_data.geography import parse_income_threshold

BRACKETS = {
    "age_22_24": 30_000,   # 10,000 per year
    "age_25_29": 100_000,  # 20,000 per year
    "age_30_34": 100_000,
    "age_35_39": 90_000,
    "age_40_44": 80_000,   # 16,000 per year
    "age_45_49": 70_000,
}


def test_whole_brackets_sum_exactly():
    assert prorated_age_population(BRACKETS, 25, 44) == 370_000


def test_partial_bracket_is_prorated_by_years():
    """25-40 takes all of 25-39 plus one of the five years in 40-44."""
    assert prorated_age_population(BRACKETS, 25, 40) == pytest.approx(290_000 + 16_000)


def test_range_outside_the_data_returns_none():
    assert prorated_age_population({"age_25_29": 100.0}, 60, 70) is None


def test_no_brackets_returns_none():
    assert prorated_age_population({}, 25, 44) is None


def test_income_threshold_snaps_to_a_census_bracket_edge():
    assert snap_income_threshold(100_000) == 100_000
    assert snap_income_threshold(110_000) == 100_000
    assert snap_income_threshold(180_000) == 200_000


def test_high_income_share_counts_brackets_at_or_above_the_edge():
    brackets = {
        "hh_income_75000": 100.0,
        "hh_income_100000": 200.0,
        "hh_income_125000": 100.0,
        "hh_income_150000": 50.0,
        "hh_income_200000": 50.0,
    }
    assert high_income_share(brackets, households=1000, threshold=100_000) == 0.40


def test_high_income_share_without_households_is_missing_not_zero():
    assert high_income_share({"hh_income_100000": 5.0}, households=None, threshold=100_000) is None


def test_growth_needs_both_vintages():
    assert growth(110.0, 100.0) == pytest.approx(0.10)
    assert growth(110.0, None) is None
    assert growth(None, 100.0) is None
    assert growth(110.0, 0.0) is None


def test_bachelor_share_is_missing_when_the_denominator_is():
    assert bachelor_degree_share(1000.0, 350.0) == 0.35
    assert bachelor_degree_share(0.0, 350.0) is None
    assert bachelor_degree_share(1000.0, None) is None


def test_income_threshold_parsing():
    assert parse_income_threshold("100000+") == 100_000
    assert parse_income_threshold("$125,000") == 125_000
    assert parse_income_threshold(None) == 100_000
    assert parse_income_threshold("high") == 100_000
