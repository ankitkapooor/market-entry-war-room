"""Strengths, weaknesses and trade-offs (spec sections 20 and 21)."""

from app.scoring.explanations import strengths_and_weaknesses, trade_offs

SCORES = {
    "growth": 94.0,
    "affluence": 88.0,
    "market_size": 61.0,
    "customer_fit": 55.0,
    "cost": 31.0,
}


def test_strengths_are_the_highest_scoring_factors():
    strengths, _ = strengths_and_weaknesses(SCORES)
    assert [s.factor for s in strengths] == ["growth", "affluence"]
    assert strengths[0].score == 94.0


def test_weaknesses_are_the_lowest_scoring_factors():
    _, weaknesses = strengths_and_weaknesses(SCORES)
    assert [w.factor for w in weaknesses] == ["cost", "customer_fit"]


def test_a_factor_is_never_both_a_strength_and_a_weakness():
    strengths, weaknesses = strengths_and_weaknesses({"growth": 50.0, "cost": 50.0})
    assert not ({s.factor for s in strengths} & {w.factor for w in weaknesses})


def test_ties_produce_a_stable_order():
    tied = {"growth": 50.0, "affluence": 50.0, "cost": 50.0}
    assert strengths_and_weaknesses(tied)[0] == strengths_and_weaknesses(tied)[0]


def test_empty_scores_give_no_strengths():
    assert strengths_and_weaknesses({}) == ([], [])


def test_trade_offs_name_the_winner_of_each_factor():
    austin = {"growth": 94.0, "cost": 70.0, "market_size": 61.0}
    la = {"growth": 20.0, "cost": 15.0, "market_size": 99.0}

    result = trade_offs("Austin", austin, "Los Angeles", la)
    by_factor = {t.factor: t for t in result}

    assert by_factor["growth"].favors == "Austin"
    assert by_factor["market_size"].favors == "Los Angeles"
    assert by_factor["market_size"].difference == 38.0


def test_trade_offs_are_sorted_by_size_and_ignore_small_gaps():
    a = {"growth": 90.0, "cost": 51.0}
    b = {"growth": 10.0, "cost": 50.0}

    result = trade_offs("A", a, "B", b)
    assert [t.factor for t in result] == ["growth"]


def test_trade_offs_only_compare_shared_factors():
    result = trade_offs("A", {"growth": 90.0}, "B", {"cost": 10.0})
    assert result == []
