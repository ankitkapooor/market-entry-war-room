"""Settings and YAML configuration loading."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import yaml
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
CONFIG_DIR = ROOT / "config"
DATA_DIR = ROOT / "data"

load_dotenv(ROOT / ".env")


class Settings:
    """Environment-backed settings. Read once at import."""

    def __init__(self) -> None:
        self.app_environment = os.getenv("APP_ENVIRONMENT", "development").strip().lower()
        self.census_api_key = os.getenv("CENSUS_API_KEY", "").strip()
        self.llm_provider = os.getenv("LLM_PROVIDER", "heuristic").strip().lower()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.llm_model = os.getenv("LLM_MODEL", "gpt-4o-mini").strip()
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
        self.census_vintage = int(os.getenv("CENSUS_VINTAGE", "2024"))
        self.census_prior_vintage = int(os.getenv("CENSUS_PRIOR_VINTAGE", "2019"))
        self.sensitivity_iterations = int(os.getenv("SENSITIVITY_ITERATIONS", "1000"))
        self.strategy_requests_per_hour = int(os.getenv("STRATEGY_REQUESTS_PER_HOUR", "10"))
        self.strategy_daily_limit = int(os.getenv("STRATEGY_DAILY_LIMIT", "100"))
        self.strategy_cache_hours = int(os.getenv("STRATEGY_CACHE_HOURS", "168"))
        self.strategy_cache_max_saved = int(os.getenv("STRATEGY_CACHE_MAX_SAVED", "1000"))
        self.scenario_requests_per_hour = int(os.getenv("SCENARIO_REQUESTS_PER_HOUR", "30"))
        self.sensitivity_requests_per_hour = int(
            os.getenv("SENSITIVITY_REQUESTS_PER_HOUR", "10")
        )
        self.scenario_retention_days = int(os.getenv("SCENARIO_RETENTION_DAYS", "7"))
        self.scenario_max_saved = int(os.getenv("SCENARIO_MAX_SAVED", "100"))


settings = Settings()


def validate_runtime_configuration() -> None:
    """Prevent a public deployment from silently using demo data or parsing."""
    if settings.app_environment != "production":
        return

    errors: list[str] = []
    if not settings.census_api_key:
        errors.append("CENSUS_API_KEY is required")
    if settings.llm_provider != "openai":
        errors.append("LLM_PROVIDER must be openai")
    if not settings.openai_api_key:
        errors.append("OPENAI_API_KEY is required")
    if not settings.llm_model:
        errors.append("LLM_MODEL is required")
    if errors:
        raise RuntimeError("Invalid production configuration: " + "; ".join(errors))


@lru_cache(maxsize=1)
def metrics_config() -> dict:
    """Metric directions, labels and factor membership."""
    with open(CONFIG_DIR / "metrics.yaml") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def default_weights() -> dict[str, float]:
    """Default factor weights, as a plain {factor: weight} mapping."""
    with open(CONFIG_DIR / "default_weights.yaml") as fh:
        raw = yaml.safe_load(fh)
    return {name: float(body["weight"]) for name, body in raw["factors"].items()}


@lru_cache(maxsize=1)
def factor_metrics() -> dict[str, dict[str, float]]:
    """Composite factor definitions: {factor: {metric: within-factor weight}}."""
    with open(CONFIG_DIR / "default_weights.yaml") as fh:
        raw = yaml.safe_load(fh)
    return {
        name: {m: float(w) for m, w in (body.get("metrics") or {}).items()}
        for name, body in raw["factors"].items()
    }


def metric_direction(metric: str) -> str:
    """'positive' if higher is better, 'negative' if higher is worse."""
    entry = metrics_config()["metrics"].get(metric)
    if entry is None:
        raise KeyError(f"Unknown metric: {metric}")
    return entry["direction"]
