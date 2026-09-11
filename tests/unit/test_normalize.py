"""Percentile normalization and metric direction (spec sections 11 and 12)."""

import pytest

from app.scoring.normalize import normalize_metric, percentile_scores


def test_percentile_spans_zero_to_one_hundred():
    assert percentile_scores([10.0, 20.0, 30.0]) == [0.0, 50.0, 100.0]


def test_ties_share_the_average_percentile():
    scores = percentile_scores([10.0, 10.0, 30.0])
    assert scores[0] == scores[1] == 25.0
    assert scores[2] == 100.0


def test_missing_values_stay_missing_and_do_not_score_zero():
    scores = percentile_scores([10.0, None, 30.0])
    assert scores == [0.0, None, 100.0]


def test_single_observation_scores_fifty():
    assert percentile_scores([None, 42.0, None]) == [None, 50.0, None]


def test_empty_input():
    assert percentile_scores([None, None]) == [None, None]


def test_outlier_does_not_compress_the_rest():
    """The point of percentiles over min-max: one giant value changes nothing."""
    normal = percentile_scores([1.0, 2.0, 3.0, 4.0])
    with_outlier = percentile_scores([1.0, 2.0, 3.0, 4_000_000.0])
    assert normal == with_outlier


def test_positive_direction_keeps_percentile():
    assert normalize_metric("population", [10.0, 20.0]) == [0.0, 100.0]


def test_negative_direction_flips_percentile():
    """Higher rent is worse, so the expensive market scores lowest."""
    assert normalize_metric("median_rent", [1000.0, 2000.0]) == [100.0, 0.0]


def test_unknown_metric_raises():
    with pytest.raises(KeyError):
        normalize_metric("made_up_metric", [1.0, 2.0])
