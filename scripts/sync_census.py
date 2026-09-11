"""Pull real Census ACS data into the local database.

    python -m scripts.sync_census

Requires CENSUS_API_KEY (free: https://api.census.gov/data/key_signup.html).
Two vintages are fetched so population_growth and income_growth are real
deltas. Note that ACS 1-year was never published for 2020, so the vintage pair
cannot be assumed contiguous.
"""

from __future__ import annotations

import sys

from app.clients.census import SOURCE, fetch_vintage, state_codes_from_name
from app.config import settings
from app.db.database import init_db, SessionLocal
from app.db.repositories import (
    prune_markets_without_vintage,
    purge_source,
    replace_observations,
    upsert_market,
)
from app.errors import WarRoomError


def main() -> int:
    vintage = settings.census_vintage
    prior = settings.census_prior_vintage

    try:
        print(f"Fetching ACS 1-year {vintage}...")
        names, rows = fetch_vintage(vintage)
        print(f"  {len(names)} metros, {len(rows)} observations")

        print(f"Fetching ACS 1-year {prior} (for growth metrics)...")
        prior_names, prior_rows = fetch_vintage(prior)
        print(f"  {len(prior_names)} metros, {len(prior_rows)} observations")
    except WarRoomError as exc:
        print(f"ERROR: {exc.message}", file=sys.stderr)
        return 1

    # Only the growth inputs are needed from the prior vintage.
    prior_rows = [r for r in prior_rows if r["metric"] in ("population", "median_household_income")]

    init_db()
    with SessionLocal() as session:
        for market_id, name in names.items():
            upsert_market(session, market_id, name, state_codes_from_name(name))
        written = replace_observations(session, [*rows, *prior_rows], SOURCE)

        # Real data supersedes the placeholder dataset entirely. Leaving any of
        # it behind would mix invented numbers into a real-data ranking.
        purged = purge_source(session, "synthetic_seed")
        stale = prune_markets_without_vintage(session, vintage)
        session.commit()

    print(f"Stored {written} observations from {SOURCE} across vintages {prior} and {vintage}.")
    if purged:
        print(f"Removed {purged} placeholder observations superseded by real data.")
    if stale:
        print(f"Pruned {len(stale)} market(s) with no {vintage} data (retired CBSA codes).")

    without_growth = len(names) - len(set(names) & {r["market_id"] for r in prior_rows})
    if without_growth:
        print(
            f"{without_growth} of {len(names)} metros have no {prior} counterpart, usually "
            "because their CBSA code changed. Growth metrics are recorded as missing for "
            "them and their weight is redistributed, never scored as zero."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
