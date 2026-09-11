"""Census retrieval and variable mapping, with the API mocked by respx."""

import httpx
import pytest
import respx

from app.clients.census import fetch_vintage, state_codes_from_name
from app.config import settings
from app.errors import CensusAPIError, ExternalTimeout, MissingCensusKey
from tests.fixtures.census_acs import payload_for


@pytest.fixture
def census_key(monkeypatch):
    monkeypatch.setattr(settings, "census_api_key", "test-key")


@respx.mock
def test_fetch_maps_variables_to_metric_names(census_key):
    respx.get(url__startswith="https://api.census.gov/data/2023/acs/acs1").mock(
        side_effect=lambda request: httpx.Response(
            200, json=payload_for(request.url.params["get"], 2023)
        )
    )

    names, rows = fetch_vintage(2023)

    assert set(names) == {"12420", "31080"}  # the micro area is filtered out
    by_metric = {(r["market_id"], r["metric"]): r["value"] for r in rows}
    assert by_metric[("12420", "population")] == 2_400_000
    assert by_metric[("12420", "median_household_income")] == 98_000
    assert by_metric[("12420", "median_rent")] == 1600
    assert by_metric[("12420", "edu_bachelor_plus")] == 178_000  # the four vars summed
    assert by_metric[("12420", "age_25_29")] == 100_000  # male + female
    assert by_metric[("12420", "hh_income_100000")] == 10_000


@respx.mock
def test_every_observation_records_its_vintage(census_key):
    respx.get(url__startswith="https://api.census.gov/data/2018/acs/acs1").mock(
        side_effect=lambda request: httpx.Response(
            200, json=payload_for(request.url.params["get"], 2018)
        )
    )

    _names, rows = fetch_vintage(2018)
    assert {r["vintage"] for r in rows} == {2018}


@respx.mock
def test_suppressed_values_become_missing_not_negative(census_key):
    """Census marks suppressed estimates with large negative sentinels."""
    def respond(request):
        payload = payload_for(request.url.params["get"], 2023)
        if "B19013_001E" in request.url.params["get"]:
            payload[1][2] = "-666666666"
        return httpx.Response(200, json=payload)

    respx.get(url__startswith="https://api.census.gov/data/2023/acs/acs1").mock(side_effect=respond)

    _names, rows = fetch_vintage(2023)
    austin_income = [
        r for r in rows if r["market_id"] == "12420" and r["metric"] == "median_household_income"
    ]
    assert austin_income == []


def test_missing_key_fails_loudly(monkeypatch):
    monkeypatch.setattr(settings, "census_api_key", "")
    with pytest.raises(MissingCensusKey, match="key_signup"):
        fetch_vintage(2023)


@respx.mock
def test_redirect_is_reported_as_a_key_problem(census_key):
    """A bad key is a 302 to an HTML page, not a 4xx."""
    respx.get(url__startswith="https://api.census.gov").mock(
        return_value=httpx.Response(302, headers={"location": "/data/missing_key.html"})
    )
    with pytest.raises(MissingCensusKey):
        fetch_vintage(2023)


@respx.mock
def test_server_error_is_reported(census_key):
    respx.get(url__startswith="https://api.census.gov").mock(
        return_value=httpx.Response(500, text="boom")
    )
    with pytest.raises(CensusAPIError, match="500"):
        fetch_vintage(2023)


@respx.mock
def test_timeout_is_reported(census_key):
    respx.get(url__startswith="https://api.census.gov").mock(
        side_effect=httpx.TimeoutException("too slow")
    )
    with pytest.raises(ExternalTimeout):
        fetch_vintage(2023)


def test_state_codes_parsed_from_the_census_name():
    assert state_codes_from_name("Austin-Round Rock, TX Metro Area") == "TX"
    assert state_codes_from_name("New York-Newark, NY-NJ Metro Area") == "NY-NJ"
    assert state_codes_from_name("No comma here") == ""
