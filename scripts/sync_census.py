"""Pull real Census ACS data into the local database.

    python -m scripts.sync_census

Requires CENSUS_API_KEY (free: https://api.census.gov/data/key_signup.html).
Two vintages are fetched so population_growth and income_growth are real
deltas. Note that ACS 1-year was never published for 2020, so the vintage pair
cannot be assumed contiguous.
"""

from __future__ import annotations

import sys

from app.bootstrap import sync_census_data
from app.config import settings
from app.errors import WarRoomError


def main() -> int:
    try:
        summary = sync_census_data()
    except WarRoomError as exc:
        print(f"ERROR: {exc.message}", file=sys.stderr)
        return 1

    print(
        f"Stored {summary['observations']} observations across vintages "
        f"{settings.census_prior_vintage} and {settings.census_vintage} "
        f"for {summary['markets']} markets."
    )
    if summary["purged"]:
        print(f"Removed {summary['purged']} placeholder observations superseded by real data.")
    if summary["stale_markets"]:
        print(f"Pruned {summary['stale_markets']} market(s) with retired CBSA codes.")
    if summary["markets_without_growth"]:
        print(
            f"{summary['markets_without_growth']} of {summary['markets']} metros have no "
            f"{settings.census_prior_vintage} counterpart, usually "
            "because their CBSA code changed. Growth metrics are recorded as missing for "
            "them and their weight is redistributed, never scored as zero."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
