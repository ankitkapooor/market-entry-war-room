"""Query helpers over the tables in database.py."""

from __future__ import annotations

import json

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.database import (
    Market,
    Observation,
    Scenario,
    ScenarioResult,
    ScenarioWeight,
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

    CBSA codes are retired and reissued between vintages (Cleveland moved from
    17460 to 17410 between 2018 and 2023). A prior-vintage pull therefore writes
    observations under codes that no longer exist; without this they linger as
    orphans that nothing can ever score.
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
