"""The unit of analysis: which markets exist, and their assembled metrics.

Markets are Metropolitan Statistical Areas keyed by CBSA code (spec section 5),
never by display name.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from app.config import settings
from app.errors import NoMarketsAvailable, UnsupportedGeography
from app.market_data.competition import competitive_density
from app.market_data.demographics import bachelor_degree_share, prorated_age_population
from app.market_data.economics import growth, high_income_share
from app.models.business import BusinessStrategy
from app.models.market import MarketMetrics
from app.db.repositories import list_markets, observations_for

DEFAULT_AGE_MIN = 18
DEFAULT_AGE_MAX = 99
DEFAULT_INCOME_THRESHOLD = 100000.0


def require_supported_geography(scope: str) -> None:
    if scope != "metro":
        raise UnsupportedGeography(
            f"geographic_scope '{scope}' is not supported; the MVP covers metro areas only"
        )


def observations_by_market(
    session: Session, market_ids: list[str] | None = None
) -> dict[str, dict[int, dict[str, float]]]:
    """{market_id: {vintage: {metric: value}}} plus the source of each metric."""
    nested: dict[str, dict[int, dict[str, float]]] = defaultdict(lambda: defaultdict(dict))
    for obs in observations_for(session, market_ids):
        nested[obs.market_id][obs.vintage][obs.metric] = obs.value
    return nested


def sources_by_market(session: Session, market_ids: list[str] | None = None) -> dict[str, dict[str, tuple[str, int]]]:
    """{market_id: {metric: (source, vintage)}} for the newest vintage of each metric."""
    out: dict[str, dict[str, tuple[str, int]]] = defaultdict(dict)
    for obs in observations_for(session, market_ids):
        existing = out[obs.market_id].get(obs.metric)
        if existing is None or obs.vintage > existing[1]:
            out[obs.market_id][obs.metric] = (obs.source, obs.vintage)
    return out


def build_market_metrics(
    session: Session,
    strategy: BusinessStrategy,
    state: str | None = None,
    limit: int | None = None,
) -> list[MarketMetrics]:
    """Assemble the ten scored metrics for every market, given a strategy.

    target_population, target_age_share and high_income_share depend on the
    strategy, so they are computed here rather than stored.
    """
    require_supported_geography(strategy.geographic_scope)

    markets = list_markets(session, state=state, limit=limit)
    if not markets:
        raise NoMarketsAvailable(
            "No markets in the database. Run `python -m scripts.seed_demo` or "
            "`python -m scripts.sync_census` first."
        )

    market_ids = [m.id for m in markets]
    nested = observations_by_market(session, market_ids)
    density = competitive_density(market_ids, strategy.category)

    age_min = strategy.target_age_min if strategy.target_age_min is not None else DEFAULT_AGE_MIN
    age_max = strategy.target_age_max if strategy.target_age_max is not None else DEFAULT_AGE_MAX
    threshold = parse_income_threshold(strategy.target_income)

    current_vintage = settings.census_vintage
    prior_vintage = settings.census_prior_vintage

    out: list[MarketMetrics] = []
    for market in markets:
        by_vintage = nested.get(market.id, {})
        current = by_vintage.get(current_vintage, {})
        prior = by_vintage.get(prior_vintage, {})
        if not current:
            continue

        population = current.get("population")
        target_population = prorated_age_population(current, age_min, age_max)
        target_age_share = (
            target_population / population
            if target_population is not None and population
            else None
        )

        out.append(
            MarketMetrics(
                market_id=market.id,
                name=market.name,
                state_codes=market.state_codes,
                vintage=current_vintage,
                population=population,
                target_population=target_population,
                target_age_share=target_age_share,
                median_household_income=current.get("median_household_income"),
                high_income_share=high_income_share(
                    current, current.get("households"), threshold
                ),
                population_growth=growth(population, prior.get("population")),
                income_growth=growth(
                    current.get("median_household_income"),
                    prior.get("median_household_income"),
                ),
                bachelor_degree_share=bachelor_degree_share(
                    current.get("edu_total"), current.get("edu_bachelor_plus")
                ),
                median_rent=current.get("median_rent"),
                competitive_density=density.get(market.id),
            )
        )

    if not out:
        raise NoMarketsAvailable(
            f"No observations at vintage {current_vintage}. Check CENSUS_VINTAGE or re-run ingestion."
        )
    return out


def parse_income_threshold(target_income: str | None) -> float:
    """'100000+' or '100000' -> 100000.0. Falls back to the default floor."""
    if not target_income:
        return DEFAULT_INCOME_THRESHOLD
    digits = "".join(ch for ch in target_income if ch.isdigit())
    if not digits:
        return DEFAULT_INCOME_THRESHOLD
    return float(digits)
