"""Market listing and detail endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.database import get_session
from app.db.repositories import get_market, list_markets, observations_for
from app.models.market import MarketDetail, MarketSummary, MetricValue

router = APIRouter(tags=["markets"])


@router.get("/markets", response_model=list[MarketSummary])
def get_markets(
    state: str | None = Query(default=None, description="Filter by state code, e.g. CA"),
    limit: int | None = Query(default=None, ge=1, le=1000),
    session: Session = Depends(get_session),
) -> list[MarketSummary]:
    return [
        MarketSummary(market_id=m.id, name=m.name, state_codes=m.state_codes)
        for m in list_markets(session, state=state, limit=limit)
    ]


@router.get("/markets/{market_id}", response_model=MarketDetail)
def get_market_detail(market_id: str, session: Session = Depends(get_session)) -> MarketDetail:
    """Every stored observation for a market, each with its source and vintage."""
    market = get_market(session, market_id)
    observations = observations_for(session, [market_id])
    return MarketDetail(
        market_id=market.id,
        name=market.name,
        state_codes=market.state_codes,
        metrics=sorted(
            (
                MetricValue(
                    metric=o.metric, value=o.value, source=o.source, vintage=o.vintage
                )
                for o in observations
            ),
            key=lambda m: (m.metric, m.vintage),
        ),
    )
