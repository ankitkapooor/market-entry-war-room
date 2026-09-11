"""Database ingestion and metric assembly from stored observations."""

from __future__ import annotations

import pytest

from app.config import settings
from app.db.repositories import (
    list_markets,
    observations_for,
    replace_observations,
    upsert_market,
)
from app.market_data.geography import build_market_metrics
from app.models.business import BusinessStrategy
from scripts.seed_demo import SOURCE, age_counts, income_bracket_counts


def test_seeding_writes_markets_and_observations(seeded_session):
    markets = list_markets(seeded_session)
    assert len(markets) >= 50  # the MVP bar from spec section 29

    observations = observations_for(seeded_session)
    assert {o.source for o in observations} == {SOURCE}
    assert {o.vintage for o in observations} == {
        settings.census_vintage,
        settings.census_prior_vintage,
    }


def test_reseeding_does_not_duplicate_rows(seeded_session):
    from scripts.seed_demo import build_rows

    before = len(observations_for(seeded_session))
    _markets, rows = build_rows()
    replace_observations(seeded_session, rows, SOURCE)
    seeded_session.commit()

    assert len(observations_for(seeded_session)) == before


def test_metrics_assemble_for_every_market(seeded_session):
    strategy = BusinessStrategy(target_age_min=25, target_age_max=44, target_income="100000+")
    metrics = build_market_metrics(seeded_session, strategy)

    assert len(metrics) >= 50
    for m in metrics:
        assert m.population and m.population > 0
        assert 0 < m.target_age_share < 1
        assert 0 < m.high_income_share < 1
        assert m.population_growth is not None
        assert m.income_growth is not None
        assert m.competitive_density is None  # no competition data in the MVP


def test_target_population_follows_the_strategy(seeded_session):
    """The same market yields a different target population per business."""
    narrow = build_market_metrics(
        seeded_session, BusinessStrategy(target_age_min=25, target_age_max=34)
    )
    wide = build_market_metrics(
        seeded_session, BusinessStrategy(target_age_min=18, target_age_max=64)
    )
    assert wide[0].target_population > narrow[0].target_population


def test_growth_is_computed_across_two_vintages(seeded_session):
    metrics = {m.market_id: m for m in build_market_metrics(seeded_session, BusinessStrategy())}
    # Austin's seed file says 10% population growth.
    assert metrics["12420"].population_growth == pytest.approx(0.10, abs=1e-6)


def test_age_expansion_preserves_population():
    counts = age_counts(1_000_000, share_25_44=0.30)
    assert sum(counts.values()) == pytest.approx(1_000_000)
    prime = sum(counts[k] for k in ("age_25_29", "age_30_34", "age_35_39", "age_40_44"))
    assert prime / 1_000_000 == pytest.approx(0.30)


def test_income_expansion_preserves_households():
    counts = income_bracket_counts(100_000, median_income=80_000)
    assert sum(counts.values()) == pytest.approx(100_000, rel=1e-6)


def test_real_data_fully_supersedes_the_placeholder_dataset(seeded_session):
    """A sync must not leave invented numbers mixed into a real-data ranking."""
    from app.db.repositories import prune_markets_without_vintage, purge_source

    census_rows = [
        {"market_id": "12420", "metric": "population", "value": 2_473_275, "vintage": 2023},
        {"market_id": "12420", "metric": "median_rent", "value": 1_752, "vintage": 2023},
    ]
    replace_observations(seeded_session, census_rows, "US Census ACS")
    purge_source(seeded_session, SOURCE)
    prune_markets_without_vintage(seeded_session, 2023)
    seeded_session.commit()

    sources = {o.source for o in observations_for(seeded_session)}
    assert sources == {"US Census ACS"}

    austin = [o for o in observations_for(seeded_session, ["12420"]) if o.metric == "population"]
    assert austin[0].value == 2_473_275


def test_markets_with_retired_cbsa_codes_are_pruned(seeded_session):
    """Cleveland moved from 17460 to 17410 between the 2018 and 2023 vintages."""
    from app.db.repositories import (
        get_market,
        prune_markets_without_vintage,
        purge_source,
    )
    from app.errors import UnknownMarket

    replace_observations(
        seeded_session,
        [{"market_id": "17410", "metric": "population", "value": 2_158_000, "vintage": 2023}],
        "US Census ACS",
    )
    upsert_market(seeded_session, "17410", "Cleveland, OH Metro Area", "OH")
    purge_source(seeded_session, SOURCE)
    pruned = prune_markets_without_vintage(seeded_session, 2023)
    seeded_session.commit()

    assert "17460" in pruned  # the retired code, which only the seed knew about
    with pytest.raises(UnknownMarket):
        get_market(seeded_session, "17460")
    assert get_market(seeded_session, "17410").name == "Cleveland, OH Metro Area"


def test_a_market_without_a_prior_vintage_has_missing_growth_not_zero(session):
    """18 of 393 real metros have no 2018 counterpart; they must not score 0 on growth."""
    upsert_market(session, "17410", "Cleveland, OH Metro Area", "OH")
    replace_observations(
        session,
        [
            {"market_id": "17410", "metric": "population", "value": 2_158_000, "vintage": 2023},
            {"market_id": "17410", "metric": "median_household_income", "value": 70_000, "vintage": 2023},
        ],
        "US Census ACS",
    )
    session.commit()

    metrics = build_market_metrics(session, BusinessStrategy())
    assert metrics[0].population_growth is None
    assert metrics[0].income_growth is None


def test_unsupported_geography_is_rejected(seeded_session):
    from app.errors import UnsupportedGeography

    with pytest.raises(UnsupportedGeography):
        build_market_metrics(seeded_session, BusinessStrategy(geographic_scope="state"))


def test_empty_database_fails_loudly(session):
    from app.errors import NoMarketsAvailable

    with pytest.raises(NoMarketsAvailable, match="seed_demo"):
        build_market_metrics(session, BusinessStrategy())
