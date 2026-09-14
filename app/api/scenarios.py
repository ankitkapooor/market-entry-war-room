"""Strategy parsing, scoring, sensitivity and comparison endpoints."""

from __future__ import annotations

import hashlib
import json
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.clients.llm import active_provider
from app.config import settings
from app.db.database import get_session
from app.db.repositories import (
    count_recent_strategy_parses,
    get_cached_strategy,
    load_scenario,
    save_cached_strategy,
    save_scenario,
)
from app.errors import UnknownMarket
from app.market_data.geography import build_market_metrics
from app.models.business import ParseRequest, ParseResponse
from app.models.scenario import ScenarioRequest, ScenarioResponse, SensitivityRequest
from app.models.scores import (
    MarketComparison,
    MarketSensitivity,
    ScoredMarket,
    SensitivityResponse,
)
from app.rate_limit import request_limiter, sensitivity_gate, strategy_gate
from app.scoring.attractiveness import ScoringResult, ranked_indices, score_markets
from app.scoring.explanations import strengths_and_weaknesses, trade_offs
from app.scoring.sensitivity import simulate
from app.strategy.criteria import criteria_for
from app.strategy.parser import parse_business
from app.strategy.weights import resolve_weights

router = APIRouter(tags=["scenarios"])


def _enforce_hourly_limit(
    request: Request, bucket: str, per_client_limit: int, global_limit: int
) -> None:
    client = request.client.host if request.client else "unknown"
    limits = (
        (f"{bucket}:client:{client}", per_client_limit),
        (f"{bucket}:global", global_limit),
    )
    for key, limit in limits:
        allowed, retry_after = request_limiter.allow(key, limit)
        if not allowed:
            raise HTTPException(
                status_code=429,
                detail="This public demo is busy; try again later",
                headers={"Retry-After": str(retry_after)},
            )


@router.post("/strategy/parse", response_model=ParseResponse)
def parse_strategy(
    payload: ParseRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
) -> ParseResponse:
    """Turn a description into an editable strategy. Does not rank anything."""
    description = " ".join(payload.description.split())
    provider = active_provider()
    cache_key = hashlib.sha256(
        f"{provider}\0{settings.llm_model}\0{description}".encode("utf-8")
    ).hexdigest()
    cached = get_cached_strategy(session, cache_key, settings.strategy_cache_hours)
    if cached is not None:
        response.headers["X-Strategy-Reused"] = "true"
        return ParseResponse.model_validate(cached)

    if provider == "openai":
        _enforce_hourly_limit(
            request,
            "strategy",
            settings.strategy_requests_per_hour,
            settings.strategy_requests_per_hour * 5,
        )
        if count_recent_strategy_parses(session) >= settings.strategy_daily_limit:
            raise HTTPException(
                status_code=503,
                detail="The daily portfolio-demo strategy limit has been reached",
                headers={"Retry-After": "3600"},
            )
        if not strategy_gate.acquire(blocking=False):
            raise HTTPException(
                status_code=503,
                detail="Another strategy is being interpreted; try again shortly",
                headers={"Retry-After": "5"},
            )

    try:
        result = parse_business(description)
        save_cached_strategy(
            session,
            cache_key,
            result.provider,
            settings.llm_model,
            description,
            result.model_dump(mode="json"),
        )
        return result
    finally:
        if provider == "openai":
            strategy_gate.release()


@router.post("/scenarios", response_model=ScenarioResponse)
def create_scenario(
    payload: ScenarioRequest,
    request: Request,
    session: Session = Depends(get_session),
) -> ScenarioResponse:
    """Score and rank every market under one set of assumptions."""
    _enforce_hourly_limit(
        request,
        "scenario",
        settings.scenario_requests_per_hour,
        settings.scenario_requests_per_hour * 10,
    )
    weights = resolve_weights(payload.weights)
    criteria = criteria_for(payload.business_strategy)

    markets = build_market_metrics(session, payload.business_strategy, limit=payload.limit)
    result = score_markets(markets, weights)

    warnings = [*criteria["notes"], *result.warnings]
    scored = _to_scored_markets(result)

    scenario_id = uuid.uuid4().hex[:12]
    save_scenario(
        session,
        scenario_id=scenario_id,
        description=payload.description or payload.business_strategy.description,
        strategy=payload.business_strategy.model_dump(),
        weights=result.effective_weights,
        warnings=warnings,
        results=[
            {
                "market_id": m.market_id,
                "score": m.score,
                "rank": m.rank,
                "factor_scores": m.factor_scores,
                "metrics": m.metrics,
            }
            for m in scored
        ],
    )

    return ScenarioResponse(
        scenario_id=scenario_id,
        weights=weights,
        effective_weights=result.effective_weights,
        warnings=warnings,
        markets=scored,
    )


@router.post("/scenarios/{scenario_id}/sensitivity", response_model=SensitivityResponse)
def scenario_sensitivity(
    scenario_id: str,
    request: Request,
    payload: SensitivityRequest = Body(default_factory=SensitivityRequest),
    session: Session = Depends(get_session),
) -> SensitivityResponse:
    """Does the ranking survive different-but-reasonable weights?"""
    _enforce_hourly_limit(
        request,
        "sensitivity",
        settings.sensitivity_requests_per_hour,
        settings.sensitivity_requests_per_hour * 5,
    )
    if not sensitivity_gate.acquire(blocking=False):
        raise HTTPException(
            status_code=503,
            detail="A sensitivity simulation is already running; try again shortly",
            headers={"Retry-After": "5"},
        )
    try:
        _scenario, weights, results = load_scenario(session, scenario_id)
        result = _rebuild_scoring_result(weights, results, session)

        iterations = payload.iterations or settings.sensitivity_iterations
        simulations = simulate(
            result,
            iterations=iterations,
            weight_variation=payload.weight_variation,
            seed=payload.seed,
        )
        base_rank = {r.market_id: r.rank for r in results}

        markets = [
            MarketSensitivity(base_rank=base_rank[sim["market_id"]], **sim) for sim in simulations
        ]
        markets.sort(key=lambda m: m.mean_rank)

        return SensitivityResponse(
            scenario_id=scenario_id,
            iterations=iterations,
            weight_variation=payload.weight_variation,
            markets=markets,
        )
    finally:
        sensitivity_gate.release()


@router.get("/scenarios/{scenario_id}/compare", response_model=MarketComparison)
def compare_markets(
    scenario_id: str,
    markets: str = Query(
        max_length=500, description="Comma-separated market ids or name fragments"
    ),
    session: Session = Depends(get_session),
) -> MarketComparison:
    """Side-by-side factor scores, metrics, strengths and principal trade-offs."""
    _scenario, _weights, results = load_scenario(session, scenario_id)
    by_id = {r.market_id: r for r in results}
    names = _market_names(session, [r.market_id for r in results])

    selected = []
    for token in (t.strip() for t in markets.split(",") if t.strip()):
        if token in by_id:
            selected.append(by_id[token])
            continue
        matches = [
            r for r in results if token.lower() in names.get(r.market_id, "").lower()
        ]
        if not matches:
            raise UnknownMarket(f"No market in this scenario matches '{token}'")
        selected.append(matches[0])

    if len(selected) < 2:
        raise UnknownMarket("Provide at least two markets to compare")

    scored = []
    for row in selected:
        factor_scores = json.loads(row.factor_scores_json)
        strengths, weaknesses = strengths_and_weaknesses(factor_scores)
        scored.append(
            ScoredMarket(
                rank=row.rank,
                market_id=row.market_id,
                name=names.get(row.market_id, row.market_id),
                score=row.score,
                factor_scores=factor_scores,
                metrics=json.loads(row.metrics_json),
                strengths=strengths,
                weaknesses=weaknesses,
            )
        )

    pairs = {}
    for i, a in enumerate(scored):
        for b in scored[i + 1 :]:
            pairs[f"{a.name} vs {b.name}"] = trade_offs(
                a.name, a.factor_scores, b.name, b.factor_scores
            )

    return MarketComparison(markets=scored, trade_offs=pairs)


def _to_scored_markets(result: ScoringResult) -> list[ScoredMarket]:
    out = []
    for rank, i in enumerate(ranked_indices(result.scores), start=1):
        strengths, weaknesses = strengths_and_weaknesses(result.factor_scores[i])
        out.append(
            ScoredMarket(
                rank=rank,
                market_id=result.market_ids[i],
                name=result.names[i],
                score=result.scores[i],
                factor_scores=result.factor_scores[i],
                metric_scores=result.metric_scores[i],
                metrics=result.metrics[i],
                strengths=strengths,
                weaknesses=weaknesses,
            )
        )
    return out


def _market_names(session: Session, market_ids: list[str]) -> dict[str, str]:
    from app.db.database import Market

    return {
        m.id: m.name
        for m in session.query(Market).filter(Market.id.in_(market_ids)).all()
    }


def _rebuild_scoring_result(
    weights: dict[str, float], results, session: Session
) -> ScoringResult:
    """Reconstruct the scoring matrix from a stored scenario, without re-scoring."""
    names = _market_names(session, [r.market_id for r in results])
    factor_scores = [json.loads(r.factor_scores_json) for r in results]
    return ScoringResult(
        market_ids=[r.market_id for r in results],
        names=[names.get(r.market_id, r.market_id) for r in results],
        scores=[r.score for r in results],
        factor_scores=factor_scores,
        metric_scores=[{} for _ in results],
        metrics=[json.loads(r.metrics_json) for r in results],
        effective_weights=weights,
        factor_order=sorted(weights),
    )
