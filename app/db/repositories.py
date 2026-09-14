"""Query helpers over the tables in database.py."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import (
    Market,
    Observation,
    Scenario,
    ScenarioResult,
    ScenarioWeight,
    StrategyParse,
)
from app.errors import UnknownMarket


def list_markets(session: Session, state: str | None = None, limit: int | None = None) -> list[Market]:
    stmt = select(Market).order_by(Market.name)
    if state:
        stmt = stmt.where(Market.state_codes.contains(state.upper()))
    if limit:
        stmt = stmt.limit(limit)
    return list(session.scalars(stmt))


def get_market(session: Session, market_id: str) -> Market:
    market = session.get(Market, market_id)
    if market is None:
        raise UnknownMarket(f"No market with id '{market_id}'")
    return market


def observations_for(session: Session, market_ids: list[str] | None = None) -> list[Observation]:
    stmt = select(Observation)
    if market_ids is not None:
        stmt = stmt.where(Observation.market_id.in_(market_ids))
    return list(session.scalars(stmt))


def upsert_market(session: Session, market_id: str, name: str, state_codes: str) -> None:
    market = session.get(Market, market_id)
    if market is None:
        session.add(Market(id=market_id, name=name, state_codes=state_codes))
    else:
        market.name = name
        market.state_codes = state_codes


def replace_observations(session: Session, rows: list[dict], source: str) -> int:
    """Replace every observation from `source` with `rows`.

    Each row needs market_id, metric, value, vintage.
    """
    session.execute(delete(Observation).where(Observation.source == source))
    session.flush()
    existing = {
        (o.market_id, o.metric, o.vintage): o
        for o in session.scalars(select(Observation))
    }
    written = 0
    for row in rows:
        key = (row["market_id"], row["metric"], row["vintage"])
        if key in existing:
            obs = existing[key]
            obs.value = float(row["value"])
            obs.source = source
        else:
            session.add(
                Observation(
                    market_id=row["market_id"],
                    metric=row["metric"],
                    value=float(row["value"]),
                    vintage=row["vintage"],
                    source=source,
                )
            )
        written += 1
    return written


def purge_source(session: Session, source: str) -> int:
    """Delete every observation from one source. Used when real data supersedes the seed."""
    session.flush()  # sessions are autoflush=False; pending rows must be visible here
    result = session.execute(delete(Observation).where(Observation.source == source))
    return result.rowcount or 0


def prune_markets_without_vintage(session: Session, vintage: int) -> list[str]:
    """Drop every market and observation with no data at `vintage`.

    CBSA codes are retired and reissued between vintages. A prior-vintage pull
    can therefore contain codes that no longer exist; without this cleanup they
    would linger as orphans that nothing can ever score.
    """
    session.flush()  # sessions are autoflush=False; pending inserts must count as current
    current = set(
        session.scalars(
            select(Observation.market_id).where(Observation.vintage == vintage).distinct()
        )
    )
    known = set(session.scalars(select(Market.id))) | set(
        session.scalars(select(Observation.market_id).distinct())
    )
    stale = sorted(known - current)
    if stale:
        session.execute(delete(Observation).where(Observation.market_id.in_(stale)))
        session.execute(delete(Market).where(Market.id.in_(stale)))
    return stale


def save_scenario(
    session: Session,
    scenario_id: str,
    description: str,
    strategy: dict,
    weights: dict[str, float],
    warnings: list[str],
    results: list[dict],
) -> None:
    prune_scenarios(session)
    session.add(
        Scenario(
            id=scenario_id,
            description=description,
            strategy_json=json.dumps(strategy),
            warnings_json=json.dumps(warnings),
        )
    )
    for factor, weight in weights.items():
        session.add(ScenarioWeight(scenario_id=scenario_id, factor=factor, weight=weight))
    for result in results:
        session.add(
            ScenarioResult(
                scenario_id=scenario_id,
                market_id=result["market_id"],
                score=result["score"],
                rank=result["rank"],
                factor_scores_json=json.dumps(result["factor_scores"]),
                metrics_json=json.dumps(result["metrics"]),
            )
        )
    session.commit()


def prune_scenarios(session: Session) -> int:
    """Bound public-demo storage by age and count before saving a scenario."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        days=max(1, settings.scenario_retention_days)
    )
    ordered = list(
        session.scalars(select(Scenario).order_by(Scenario.created_at.desc()))
    )
    keep_before_insert = max(0, settings.scenario_max_saved - 1)
    stale_ids = {
        row.id
        for index, row in enumerate(ordered)
        if row.created_at < cutoff or index >= keep_before_insert
    }
    if not stale_ids:
        return 0
    session.execute(delete(ScenarioResult).where(ScenarioResult.scenario_id.in_(stale_ids)))
    session.execute(delete(ScenarioWeight).where(ScenarioWeight.scenario_id.in_(stale_ids)))
    session.execute(delete(Scenario).where(Scenario.id.in_(stale_ids)))
    return len(stale_ids)


def get_cached_strategy(session: Session, cache_key: str, max_age_hours: int) -> dict | None:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        hours=max(0, max_age_hours)
    )
    row = session.scalar(
        select(StrategyParse).where(
            StrategyParse.cache_key == cache_key,
            StrategyParse.created_at >= cutoff,
        )
    )
    return json.loads(row.response_json) if row is not None else None


def save_cached_strategy(
    session: Session,
    cache_key: str,
    provider: str,
    model: str,
    description: str,
    response: dict,
) -> None:
    prune_cached_strategies(session)
    session.merge(
        StrategyParse(
            cache_key=cache_key,
            provider=provider,
            model=model,
            description=description,
            response_json=json.dumps(response),
            created_at=datetime.now(timezone.utc),
        )
    )
    session.commit()


def prune_cached_strategies(session: Session) -> int:
    """Remove expired and excess LLM cache records before adding another."""
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(
        hours=max(1, settings.strategy_cache_hours)
    )
    ordered = list(
        session.scalars(select(StrategyParse).order_by(StrategyParse.created_at.desc()))
    )
    keep_before_insert = max(0, settings.strategy_cache_max_saved - 1)
    stale_keys = {
        row.cache_key
        for index, row in enumerate(ordered)
        if row.created_at < cutoff or index >= keep_before_insert
    }
    if stale_keys:
        session.execute(delete(StrategyParse).where(StrategyParse.cache_key.in_(stale_keys)))
    return len(stale_keys)


def count_recent_strategy_parses(
    session: Session, hours: int = 24, provider: str = "openai"
) -> int:
    cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=hours)
    statement = select(func.count()).select_from(StrategyParse).where(
        StrategyParse.created_at >= cutoff,
        StrategyParse.provider == provider,
    )
    return int(session.scalar(statement) or 0)


def load_scenario(session: Session, scenario_id: str) -> tuple[Scenario, dict[str, float], list[ScenarioResult]]:
    scenario = session.get(Scenario, scenario_id)
    if scenario is None:
        raise UnknownMarket(f"No scenario with id '{scenario_id}'")
    weights = {
        w.factor: w.weight
        for w in session.scalars(
            select(ScenarioWeight).where(ScenarioWeight.scenario_id == scenario_id)
        )
    }
    results = list(
        session.scalars(
            select(ScenarioResult)
            .where(ScenarioResult.scenario_id == scenario_id)
            .order_by(ScenarioResult.rank)
        )
    )
    return scenario, weights, results
