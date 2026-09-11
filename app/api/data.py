"""Metric catalog, data provenance and health."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from app.clients.llm import active_provider
from app.config import default_weights, factor_metrics, metrics_config, settings
from app.db.database import Observation, get_session
from app.errors import UnknownMetric

router = APIRouter(tags=["data"])


@router.get("/health")
def health(session: Session = Depends(get_session)) -> dict:
    markets = session.scalar(select(func.count(distinct(Observation.market_id)))) or 0
    sources = sorted(session.scalars(select(distinct(Observation.source))))
    return {
        "status": "ok",
        "markets_with_data": markets,
        "sources": sources,
        "census_key_configured": bool(settings.census_api_key),
        "llm_provider": active_provider(),
        "vintages": {
            "current": settings.census_vintage,
            "prior": settings.census_prior_vintage,
        },
    }


@router.get("/data/metrics")
def metric_catalog() -> dict:
    """The scored metrics, their direction, and the factor each belongs to."""
    definitions = factor_metrics()
    factor_of = {
        metric: factor for factor, metrics in definitions.items() for metric in metrics
    }
    return {
        "metrics": [
            {
                "metric": name,
                "label": body["label"],
                "direction": body["direction"],
                "unit": body["unit"],
                "factor": factor_of.get(name),
                "factor_weight_within_factor": definitions.get(factor_of.get(name, ""), {}).get(name),
            }
            for name, body in metrics_config()["metrics"].items()
        ],
        "factors": default_weights(),
    }


@router.get("/data/metrics/{metric}")
def metric_detail(metric: str, session: Session = Depends(get_session)) -> dict:
    """Provenance for one metric: which sources and vintages back it."""
    config = metrics_config()["metrics"]
    if metric not in config:
        raise UnknownMetric(f"Unknown metric '{metric}'")

    rows = session.execute(
        select(Observation.source, Observation.vintage, func.count())
        .where(Observation.metric == metric)
        .group_by(Observation.source, Observation.vintage)
    ).all()

    return {
        "metric": metric,
        **config[metric],
        "observations": [
            {"source": source, "vintage": vintage, "market_count": count}
            for source, vintage, count in rows
        ],
    }
