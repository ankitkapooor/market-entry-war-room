"""Canned Census ACS responses, shaped exactly like the real API.

The API returns [header_row, *data_rows] with the geography code last.
"""

from app.clients.census import (
    AGE_BRACKETS,
    BACHELOR_PLUS_VARS,
    HEADLINE_VARS,
    INCOME_BRACKETS,
)

GEO_COLUMN = "metropolitan statistical area/micropolitan statistical area"

METROS = [
    ("12420", "Austin-Round Rock-San Marcos, TX Metro Area"),
    ("31080", "Los Angeles-Long Beach-Anaheim, CA Metro Area"),
    ("10100", "Aberdeen, SD Micro Area"),  # filtered out: not a Metro Area
]


def headline_payload(vintage: int) -> list[list[str]]:
    variables = [*HEADLINE_VARS.values(), *BACHELOR_PLUS_VARS]
    header = ["NAME", *variables, GEO_COLUMN]
    scale = 1.0 if vintage == 2023 else 0.9

    rows = []
    for i, (code, name) in enumerate(METROS):
        population = (2_400_000 if i == 0 else 12_800_000 if i == 1 else 40_000) * scale
        income = (98_000 if i == 0 else 92_000 if i == 1 else 60_000) * scale
        values = [
            str(int(population)),          # B01003_001E
            str(int(income)),              # B19013_001E
            "1600",                        # B25064_001E
            str(int(population / 2.55)),   # B19001_001E
            str(int(population * 0.68)),   # B15003_001E
            "100000", "60000", "10000", "8000",  # bachelor's..doctorate
        ]
        rows.append([name, *values, code])
    return [header, *rows]


def age_payload(_vintage: int) -> list[list[str]]:
    variables = [v for _, _, _, m, f in AGE_BRACKETS for v in (m, f)]
    header = ["NAME", *variables, GEO_COLUMN]
    rows = [[name, *["50000"] * len(variables), code] for code, name in METROS]
    return [header, *rows]


def income_payload(_vintage: int) -> list[list[str]]:
    variables = [var for _, var in INCOME_BRACKETS]
    header = ["NAME", *variables, GEO_COLUMN]
    rows = [[name, *["10000"] * len(variables), code] for code, name in METROS]
    return [header, *rows]


def payload_for(variables_param: str, vintage: int) -> list[list[str]]:
    """Pick the canned response that matches the requested variables."""
    if "B01001_003E" in variables_param:
        return age_payload(vintage)
    if "B19001_002E" in variables_param:
        return income_payload(vintage)
    return headline_payload(vintage)
