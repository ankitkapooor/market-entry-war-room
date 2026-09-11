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
        self.census_api_key = os.getenv("CENSUS_API_KEY", "").strip()
        self.llm_provider = os.getenv("LLM_PROVIDER", "heuristic").strip().lower()
        self.openai_api_key = os.getenv("OPENAI_API_KEY", "").strip()
        self.database_url = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
        self.census_vintage = int(os.getenv("CENSUS_VINTAGE", "2023"))
        self.census_prior_vintage = int(os.getenv("CENSUS_PRIOR_VINTAGE", "2018"))
        self.sensitivity_iterations = int(os.getenv("SENSITIVITY_ITERATIONS", "1000"))


settings = Settings()


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
