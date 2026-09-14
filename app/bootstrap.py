"""Initialize the persistent market dataset for local and hosted runs."""

from __future__ import annotations

import logging

from sqlalchemy import func, select

from app.clients.census import SOURCE, fetch_vintage, state_codes_from_name
from app.config import settings
from app.db.database import Observation, SessionLocal, init_db
from app.db.repositories import (
    prune_markets_without_vintage,
    purge_source,
    replace_observations,
    upsert_market,
)
from app.errors import CensusAPIError

logger = logging.getLogger(__name__)


def sync_census_data() -> dict:
    """Fetch both configured vintages and atomically replace Census observations."""
    vintage = settings.census_vintage
    prior = settings.census_prior_vintage

    names, rows = fetch_vintage(vintage)
    _prior_names, prior_rows = fetch_vintage(prior)
    if not names or not rows:
        raise CensusAPIError(f"Census returned no metro data for vintage {vintage}")

    prior_rows = [
        row
        for row in prior_rows
        if row["metric"] in ("population", "median_household_income")
        and row["market_id"] in names
    ]

    init_db()
    with SessionLocal() as session:
        for market_id, name in names.items():
            upsert_market(session, market_id, name, state_codes_from_name(name))
        written = replace_observations(session, [*rows, *prior_rows], SOURCE)
        purged = purge_source(session, "synthetic_seed")
        stale = prune_markets_without_vintage(session, vintage)
        session.commit()

    return {
        "markets": len(names),
        "observations": written,
        "purged": purged,
        "stale_markets": len(stale),
        "markets_without_growth": len(names)
        - len(set(names) & {row["market_id"] for row in prior_rows}),
    }


def ensure_market_data() -> None:
    """Sync real data once per configured vintage, or seed local development."""
    init_db()
    with SessionLocal() as session:
        current_real = session.scalar(
            select(func.count())
            .select_from(Observation)
            .where(
                Observation.source == SOURCE,
                Observation.vintage == settings.census_vintage,
            )
        ) or 0
        current_any = session.scalar(
            select(func.count())
            .select_from(Observation)
            .where(Observation.vintage == settings.census_vintage)
        ) or 0

    if current_real:
        logger.info(
            "Using persisted Census vintage %s (%s observations)",
            settings.census_vintage,
            current_real,
        )
        return

    if settings.census_api_key:
        logger.info("Census vintage %s is missing; synchronizing it", settings.census_vintage)
        summary = sync_census_data()
        logger.info(
            "Stored %s observations for %s markets from Census",
            summary["observations"],
            summary["markets"],
        )
        return

    if not current_any:
        if settings.app_environment == "production":
            raise RuntimeError("Production market data is missing and CENSUS_API_KEY is not set")
        from scripts.seed_demo import main as seed_demo

        logger.warning("No current Census data or key; loading labeled development seed data")
        seed_demo()
