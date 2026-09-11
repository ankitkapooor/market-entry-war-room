"""Strategy parsing, scoring, sensitivity and comparison endpoints."""

from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Body, Depends, Query
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_session
from app.db.repositories import load_scenario, save_scenario
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
from app.scoring.attractiveness import ScoringResult, ranked_indices, score_markets
from app.scoring.explanations import strengths_and_weaknesses, trade_offs
from app.scoring.sensitivity import simulate
from app.strategy.criteria import criteria_for
from app.strategy.parser import parse_business
from app.strategy.weights import resolve_weights

router = APIRouter(tags=["scenarios"])


@router.post("/strategy/parse", response_model=ParseResponse)
def parse_strategy(request: ParseRequest) -> ParseResponse:
    """Turn a description into an editable strategy. Does not rank anything."""
    return parse_business(request.description)


@router.post("/scenarios", response_model=ScenarioResponse)
def create_scenario(
    request: ScenarioRequest, session: Session = Depends(get_session)
) -> ScenarioResponse:
    """Score and rank every market under one set of assumptions."""
    weights = resolve_weights(request.weights)
    criteria = criteria_for(request.business_strategy)

    markets = build_market_metrics(session, request.business_strategy, limit=request.limit)
    result = score_markets(markets, weights)

    warnings = [*criteria["notes"], *result.warnings]
    scored = _to_scored_markets(result)

    scenario_id = uuid.uuid4().hex[:12]
    save_scenario(
        session,
        scenario_id=scenario_id,
        description=request.description or request.business_strategy.description,
        strategy=request.business_strategy.model_dump(),
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
    request: SensitivityRequest = Body(default_factory=SensitivityRequest),
    session: Session = Depends(get_session),
) -> SensitivityResponse:
    """Does the ranking survive different-but-reasonable weights?"""
    _scenario, weights, results = load_scenario(session, scenario_id)
    result = _rebuild_scoring_result(weights, results, session)

    iterations = request.iterations or settings.sensitivity_iterations
    simulations = simulate(
        result,
        iterations=iterations,
        weight_variation=request.weight_variation,
        seed=request.seed,
    )
    base_rank = {r.market_id: r.rank for r in results}

    markets = [
        MarketSensitivity(base_rank=base_rank[sim["market_id"]], **sim) for sim in simulations
    ]
    markets.sort(key=lambda m: m.mean_rank)

    return SensitivityResponse(
        scenario_id=scenario_id,
        iterations=iterations,
        weight_variation=request.weight_variation,
        markets=markets,
    )


@router.get("/scenarios/{scenario_id}/compare", response_model=MarketComparison)
def compare_markets(
    scenario_id: str,
    markets: str = Query(description="Comma-separated market ids or name fragments"),
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
