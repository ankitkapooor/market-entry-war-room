"""The OpenAI parsing path, with the API mocked by respx."""

from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.config import settings
from app.errors import ExternalTimeout, LLMOutputError
from app.strategy.parser import parse_business

URL = "https://api.openai.com/v1/chat/completions"

GOOD_OUTPUT = {
    "business_name": "Iron & Oak",
    "category": "fitness",
    "target_age_min": 25,
    "target_age_max": 44,
    "target_income": "100000+",
    "price_positioning": "premium",
    "priorities": {
        "market_size": 0.15,
        "affluence": 0.25,
        "growth": 0.20,
        "customer_fit": 0.20,
        "competition": 0.10,
        "cost": 0.10,
    },
    "notes": ["Assumed a household income floor of 100k from the price point."],
}


def completion(content: dict | str) -> httpx.Response:
    body = content if isinstance(content, str) else json.dumps(content)
    return httpx.Response(200, json={"choices": [{"message": {"content": body}}]})


@pytest.fixture
def openai_enabled(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "test-key")


@respx.mock
def test_structured_output_becomes_a_strategy(openai_enabled):
    respx.post(URL).mock(return_value=completion(GOOD_OUTPUT))

    parsed = parse_business("A premium fitness studio.")

    assert parsed.provider == "openai"
    assert parsed.strategy.business_name == "Iron & Oak"
    assert parsed.strategy.target_age_min == 25
    assert parsed.strategy.price_positioning == "premium"
    assert parsed.initial_weights["affluence"] == 0.25
    assert parsed.notes == GOOD_OUTPUT["notes"]


@respx.mock
def test_the_api_key_is_sent(openai_enabled):
    route = respx.post(URL).mock(return_value=completion(GOOD_OUTPUT))
    parse_business("A gym.")
    assert route.calls.last.request.headers["authorization"] == "Bearer test-key"


@respx.mock
def test_weights_are_renormalized_if_they_do_not_sum_to_one(openai_enabled):
    respx.post(URL).mock(
        return_value=completion({**GOOD_OUTPUT, "priorities": {"growth": 2.0, "cost": 2.0}})
    )
    parsed = parse_business("A gym.")
    assert parsed.initial_weights == {"growth": 0.5, "cost": 0.5}


@respx.mock
def test_unusable_weights_fall_back_to_defaults_with_a_note(openai_enabled):
    respx.post(URL).mock(
        return_value=completion({**GOOD_OUTPUT, "priorities": {"vibes": 1.0}})
    )
    parsed = parse_business("A gym.")
    assert sum(parsed.initial_weights.values()) == pytest.approx(1.0, abs=1e-3)
    assert any("default" in note.lower() for note in parsed.notes)


@respx.mock
def test_non_json_output_fails_loudly(openai_enabled):
    respx.post(URL).mock(return_value=completion("not json at all"))
    with pytest.raises(LLMOutputError, match="unparseable"):
        parse_business("A gym.")


@respx.mock
def test_invalid_field_values_fail_loudly(openai_enabled):
    respx.post(URL).mock(
        return_value=completion({**GOOD_OUTPUT, "price_positioning": "very fancy"})
    )
    with pytest.raises(LLMOutputError, match="invalid strategy"):
        parse_business("A gym.")


@respx.mock
def test_provider_error_is_reported(openai_enabled):
    respx.post(URL).mock(return_value=httpx.Response(429, text="rate limited"))
    with pytest.raises(LLMOutputError, match="429"):
        parse_business("A gym.")


@respx.mock
def test_timeout_is_reported(openai_enabled):
    respx.post(URL).mock(side_effect=httpx.TimeoutException("too slow"))
    with pytest.raises(ExternalTimeout):
        parse_business("A gym.")


def test_openai_is_not_used_without_a_key(monkeypatch):
    """Selecting the provider is not enough; a missing key falls back offline."""
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "")

    assert parse_business("A premium gym for people aged 25-44.").provider == "heuristic"
