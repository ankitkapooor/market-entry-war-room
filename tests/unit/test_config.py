import pytest

from app.config import settings, validate_runtime_configuration


def test_production_requires_real_census_and_openai_configuration(monkeypatch):
    monkeypatch.setattr(settings, "app_environment", "production")
    monkeypatch.setattr(settings, "census_api_key", "")
    monkeypatch.setattr(settings, "llm_provider", "heuristic")
    monkeypatch.setattr(settings, "openai_api_key", "")

    with pytest.raises(RuntimeError, match="CENSUS_API_KEY"):
        validate_runtime_configuration()


def test_production_accepts_complete_configuration(monkeypatch):
    monkeypatch.setattr(settings, "app_environment", "production")
    monkeypatch.setattr(settings, "census_api_key", "test-census")
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "openai_api_key", "test-openai")
    monkeypatch.setattr(settings, "llm_model", "gpt-4o-mini")

    validate_runtime_configuration()
