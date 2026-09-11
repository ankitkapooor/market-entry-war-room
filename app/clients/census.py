"""Census ACS 1-year client.

The API requires a key since 2024; keyless requests are redirected to an HTML
error page. Get one free at https://api.census.gov/data/key_signup.html.

Raw bracket counts (age, household income) are stored as-is rather than folded
into shares at ingest time, because the target age range and the income
threshold come from the business strategy and change per scenario.
"""

from __future__ import annotations

import httpx

from app.config import settings
from app.errors import CensusAPIError, ExternalTimeout, MissingCensusKey

BASE_URL = "https://api.census.gov/data"
METRO_GEO = "metropolitan statistical area/micropolitan statistical area"
SOURCE = "US Census ACS"

# B01001 sex-by-age. Male and female counts for the same bracket are summed.
# (metric name, lower age, upper age inclusive, male var, female var)
AGE_BRACKETS: list[tuple[str, int, int, str, str]] = [
    ("age_0_4", 0, 4, "B01001_003E", "B01001_027E"),
    ("age_5_9", 5, 9, "B01001_004E", "B01001_028E"),
    ("age_10_14", 10, 14, "B01001_005E", "B01001_029E"),
    ("age_15_17", 15, 17, "B01001_006E", "B01001_030E"),
    ("age_18_19", 18, 19, "B01001_007E", "B01001_031E"),
    ("age_20_20", 20, 20, "B01001_008E", "B01001_032E"),
    ("age_21_21", 21, 21, "B01001_009E", "B01001_033E"),
    ("age_22_24", 22, 24, "B01001_010E", "B01001_034E"),
    ("age_25_29", 25, 29, "B01001_011E", "B01001_035E"),
    ("age_30_34", 30, 34, "B01001_012E", "B01001_036E"),
    ("age_35_39", 35, 39, "B01001_013E", "B01001_037E"),
    ("age_40_44", 40, 44, "B01001_014E", "B01001_038E"),
    ("age_45_49", 45, 49, "B01001_015E", "B01001_039E"),
    ("age_50_54", 50, 54, "B01001_016E", "B01001_040E"),
    ("age_55_59", 55, 59, "B01001_017E", "B01001_041E"),
    ("age_60_61", 60, 61, "B01001_018E", "B01001_042E"),
    ("age_62_64", 62, 64, "B01001_019E", "B01001_043E"),
    ("age_65_66", 65, 66, "B01001_020E", "B01001_044E"),
    ("age_67_69", 67, 69, "B01001_021E", "B01001_045E"),
    ("age_70_74", 70, 74, "B01001_022E", "B01001_046E"),
    ("age_75_79", 75, 79, "B01001_023E", "B01001_047E"),
    ("age_80_84", 80, 84, "B01001_024E", "B01001_048E"),
    ("age_85_plus", 85, 99, "B01001_025E", "B01001_049E"),
]

# B19001 household income. Keyed by the bracket's lower bound in dollars.
INCOME_BRACKETS: list[tuple[int, str]] = [
    (0, "B19001_002E"),
    (10000, "B19001_003E"),
    (15000, "B19001_004E"),
    (20000, "B19001_005E"),
    (25000, "B19001_006E"),
    (30000, "B19001_007E"),
    (35000, "B19001_008E"),
    (40000, "B19001_009E"),
    (45000, "B19001_010E"),
    (50000, "B19001_011E"),
    (60000, "B19001_012E"),
    (75000, "B19001_013E"),
    (100000, "B19001_014E"),
    (125000, "B19001_015E"),
    (150000, "B19001_016E"),
    (200000, "B19001_017E"),
]

INCOME_BRACKET_METRIC = "hh_income_{lower}"

HEADLINE_VARS = {
    "population": "B01003_001E",
    "median_household_income": "B19013_001E",
    "median_rent": "B25064_001E",
    "households": "B19001_001E",
    "edu_total": "B15003_001E",
}

BACHELOR_PLUS_VARS = ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"]


def _request(client: httpx.Client, vintage: int, variables: list[str]) -> list[list[str]]:
    if not settings.census_api_key:
        raise MissingCensusKey(
            "CENSUS_API_KEY is not set. The Census API rejects keyless requests. "
            "Get a free key at https://api.census.gov/data/key_signup.html"
        )
    params = {
        "get": ",".join(["NAME", *variables]),
        "for": f"{METRO_GEO}:*",
        "key": settings.census_api_key,
    }
    try:
        response = client.get(f"{BASE_URL}/{vintage}/acs/acs1", params=params)
    except httpx.TimeoutException as exc:
        raise ExternalTimeout(f"Census API timed out for vintage {vintage}") from exc

    # A bad or missing key is a 302 to an HTML page, not a 4xx.
    if response.status_code in (301, 302):
        raise MissingCensusKey(
            "Census API rejected the request (redirected to its error page). "
            "Check that CENSUS_API_KEY is valid."
        )
    if response.status_code != 200:
        raise CensusAPIError(
            f"Census API returned {response.status_code} for vintage {vintage}: "
            f"{response.text[:200]}"
        )
    try:
        return response.json()
    except ValueError as exc:
        raise CensusAPIError(
            f"Census API returned non-JSON for vintage {vintage}: {response.text[:200]}"
        ) from exc


def _rows_to_dicts(payload: list[list[str]]) -> dict[str, dict[str, str]]:
    """Census returns [header, *rows]. Key each row by its CBSA code."""
    header, *rows = payload
    geo_index = len(header) - 1
    out: dict[str, dict[str, str]] = {}
    for row in rows:
        record = dict(zip(header, row))
        out[row[geo_index]] = record
    return out


def _to_float(raw: str | None) -> float | None:
    """Census uses large negative sentinels (e.g. -666666666) for suppressed values."""
    if raw is None or raw == "":
        return None
    try:
        value = float(raw)
    except ValueError:
        return None
    if value <= -100000:
        return None
    return value


def state_codes_from_name(name: str) -> str:
    """'Austin-Round Rock, TX-NM Metro Area' -> 'TX-NM'."""
    if "," not in name:
        return ""
    tail = name.split(",")[1].strip()
    return tail.split(" ")[0]


def fetch_vintage(vintage: int, timeout: float = 60.0) -> tuple[dict[str, str], list[dict]]:
    """Fetch one ACS vintage for every metro.

    Returns (market_id -> NAME, observation rows). Rows are
    {market_id, metric, value, vintage} and only include metros whose name says
    "Metro Area" (micropolitan areas are out of scope for the MVP).
    """
    age_vars = [v for _, _, _, m, f in AGE_BRACKETS for v in (m, f)]
    income_vars = [var for _, var in INCOME_BRACKETS]

    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        headline = _rows_to_dicts(
            _request(client, vintage, [*HEADLINE_VARS.values(), *BACHELOR_PLUS_VARS])
        )
        ages = _rows_to_dicts(_request(client, vintage, age_vars))
        incomes = _rows_to_dicts(_request(client, vintage, income_vars))

    names: dict[str, str] = {}
    rows: list[dict] = []

    for market_id, record in headline.items():
        name = record["NAME"]
        if "Metro Area" not in name:
            continue
        names[market_id] = name

        def add(metric: str, value: float | None) -> None:
            if value is not None:
                rows.append(
                    {"market_id": market_id, "metric": metric, "value": value, "vintage": vintage}
                )

        for metric, var in HEADLINE_VARS.items():
            add(metric, _to_float(record.get(var)))

        bachelor_parts = [_to_float(record.get(v)) for v in BACHELOR_PLUS_VARS]
        if all(p is not None for p in bachelor_parts):
            add("edu_bachelor_plus", sum(bachelor_parts))

        age_record = ages.get(market_id, {})
        for metric, _lo, _hi, male_var, female_var in AGE_BRACKETS:
            male = _to_float(age_record.get(male_var))
            female = _to_float(age_record.get(female_var))
            if male is not None and female is not None:
                add(metric, male + female)

        income_record = incomes.get(market_id, {})
        for lower, var in INCOME_BRACKETS:
            add(INCOME_BRACKET_METRIC.format(lower=lower), _to_float(income_record.get(var)))

    return names, rows
