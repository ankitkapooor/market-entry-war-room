"""Load the placeholder dataset so the app runs with no API keys.

Every row it writes is tagged source="synthetic_seed", which the API surfaces
per metric, so nobody can mistake these numbers for Census data. Run
`python -m scripts.sync_census` to replace them with real ACS observations.

The CSV holds headline values per metro. Age and income brackets are expanded
from them deterministically: age brackets are the national age curve tilted to
hit the metro's 25-44 share, and income brackets come from a lognormal fitted
to the metro's median household income.
"""

from __future__ import annotations

import csv
import math

from app.clients.census import AGE_BRACKETS, INCOME_BRACKET_METRIC, INCOME_BRACKETS
from app.config import DATA_DIR, settings
from app.db.database import init_db, SessionLocal
from app.db.repositories import replace_observations, upsert_market

SOURCE = "synthetic_seed"
SEED_CSV = DATA_DIR / "seed_metros.csv"

# Approximate US age distribution, used as the shape for every metro.
NATIONAL_AGE_SHARE = {
    "age_0_4": 0.058, "age_5_9": 0.060, "age_10_14": 0.063, "age_15_17": 0.038,
    "age_18_19": 0.026, "age_20_20": 0.013, "age_21_21": 0.013, "age_22_24": 0.039,
    "age_25_29": 0.068, "age_30_34": 0.069, "age_35_39": 0.066, "age_40_44": 0.063,
    "age_45_49": 0.060, "age_50_54": 0.062, "age_55_59": 0.064, "age_60_61": 0.026,
    "age_62_64": 0.038, "age_65_66": 0.025, "age_67_69": 0.035, "age_70_74": 0.052,
    "age_75_79": 0.039, "age_80_84": 0.024, "age_85_plus": 0.020,
}
PRIME_AGE = ("age_25_29", "age_30_34", "age_35_39", "age_40_44")

PEOPLE_PER_HOUSEHOLD = 2.55
INCOME_LOG_SIGMA = 0.95  # reproduces realistic US household income spread


def age_counts(population: float, share_25_44: float) -> dict[str, float]:
    """National age shape, rescaled so the 25-44 brackets sum to share_25_44."""
    total = sum(NATIONAL_AGE_SHARE.values())
    base = {k: v / total for k, v in NATIONAL_AGE_SHARE.items()}
    prime_base = sum(base[k] for k in PRIME_AGE)
    prime_factor = share_25_44 / prime_base
    other_factor = (1 - share_25_44) / (1 - prime_base)
    return {
        name: population * share * (prime_factor if name in PRIME_AGE else other_factor)
        for name, share in base.items()
    }


def _lognormal_cdf(x: float, median: float, sigma: float) -> float:
    if x <= 0:
        return 0.0
    z = (math.log(x) - math.log(median)) / sigma
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def income_bracket_counts(households: float, median_income: float) -> dict[str, float]:
    """Split households across the B19001 brackets using a lognormal fit."""
    edges = [lower for lower, _ in INCOME_BRACKETS]
    counts: dict[str, float] = {}
    for i, lower in enumerate(edges):
        upper = edges[i + 1] if i + 1 < len(edges) else None
        low_cdf = _lognormal_cdf(lower, median_income, INCOME_LOG_SIGMA)
        high_cdf = 1.0 if upper is None else _lognormal_cdf(upper, median_income, INCOME_LOG_SIGMA)
        counts[INCOME_BRACKET_METRIC.format(lower=lower)] = households * (high_cdf - low_cdf)
    return counts


def build_rows(csv_path=SEED_CSV) -> tuple[list[dict], list[dict]]:
    """Return (market records, observation rows) for both vintages."""
    vintage = settings.census_vintage
    prior = settings.census_prior_vintage

    markets: list[dict] = []
    rows: list[dict] = []

    with open(csv_path, newline="") as fh:
        for record in csv.DictReader(fh):
            market_id = record["market_id"]
            population = float(record["population"])
            income = float(record["median_household_income"])
            pop_growth = float(record["population_growth"])
            income_growth = float(record["income_growth"])
            households = population / PEOPLE_PER_HOUSEHOLD
            bachelor_share = float(record["bachelor_share"])
            adults_25_plus = population * 0.68

            markets.append(
                {
                    "market_id": market_id,
                    "name": record["name"],
                    "state_codes": record["state_codes"],
                }
            )

            current = {
                "population": population,
                "median_household_income": income,
                "median_rent": float(record["median_rent"]),
                "households": households,
                "edu_total": adults_25_plus,
                "edu_bachelor_plus": adults_25_plus * bachelor_share,
                **age_counts(population, float(record["share_25_44"])),
                **income_bracket_counts(households, income),
            }
            for metric, value in current.items():
                rows.append(
                    {"market_id": market_id, "metric": metric, "value": value, "vintage": vintage}
                )

            # Prior vintage only needs the two metrics that feed growth.
            rows.append(
                {
                    "market_id": market_id,
                    "metric": "population",
                    "value": population / (1 + pop_growth),
                    "vintage": prior,
                }
            )
            rows.append(
                {
                    "market_id": market_id,
                    "metric": "median_household_income",
                    "value": income / (1 + income_growth),
                    "vintage": prior,
                }
            )

    return markets, rows


def main() -> None:
    init_db()
    markets, rows = build_rows()
    with SessionLocal() as session:
        for market in markets:
            upsert_market(session, market["market_id"], market["name"], market["state_codes"])
        written = replace_observations(session, rows, SOURCE)
        session.commit()
    print(f"Seeded {len(markets)} markets and {written} observations (source={SOURCE}).")
    print("These are placeholder values, not Census data. Run scripts.sync_census for real data.")


if __name__ == "__main__":
    main()
