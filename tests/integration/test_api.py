"""End-to-end: description in, ranked and stress-tested markets out."""

from __future__ import annotations

import pytest

SPEC_EXAMPLE = (
    "A premium fitness studio aimed at affluent professionals aged 25-44, "
    "with membership pricing around $180/month."
)


def score(client, **overrides) -> dict:
    strategy = client.post("/api/v1/strategy/parse", json={"description": SPEC_EXAMPLE}).json()
    body = {"business_strategy": strategy["strategy"], **overrides}
    response = client.post("/api/v1/scenarios", json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_health_reports_the_data_it_has(client):
    body = client.get("/api/v1/health").json()
    assert body["status"] == "ok"
    assert body["markets_with_data"] >= 50


def test_deployment_health_and_root_redirect(client):
    assert client.get("/health").json()["status"] == "ok"
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert response.headers["location"] == "/ui/"


def test_markets_listing_and_filtering(client):
    all_markets = client.get("/api/v1/markets").json()
    assert len(all_markets) >= 50

    texas = client.get("/api/v1/markets", params={"state": "TX"}).json()
    assert texas and all("TX" in m["state_codes"] for m in texas)

    assert len(client.get("/api/v1/markets", params={"limit": 5}).json()) == 5


def test_market_detail_exposes_source_and_vintage(client):
    detail = client.get("/api/v1/markets/12420").json()
    assert "Austin" in detail["name"]
    assert detail["metrics"]
    for metric in detail["metrics"]:
        assert metric["source"]
        assert metric["vintage"] > 1900


def test_unknown_market_returns_404(client):
    response = client.get("/api/v1/markets/00000")
    assert response.status_code == 404
    assert response.json()["error"] == "UnknownMarket"


def test_end_to_end_ranking(client):
    body = score(client)

    assert len(body["markets"]) >= 50
    assert body["markets"][0]["rank"] == 1
    ranks = [m["rank"] for m in body["markets"]]
    assert ranks == sorted(ranks)

    scores = [m["score"] for m in body["markets"]]
    assert scores == sorted(scores, reverse=True)

    top = body["markets"][0]
    assert top["strengths"] and top["weaknesses"]
    assert set(top["factor_scores"]) == set(body["effective_weights"])


def test_competition_exclusion_is_reported(client):
    body = score(client)
    assert "competition" not in body["effective_weights"]
    assert any("competition" in w for w in body["warnings"])
    assert sum(body["effective_weights"].values()) == pytest.approx(1.0, abs=1e-3)


def test_changing_the_weights_changes_the_ranking(client):
    """Spec sections 17 and 29: the answer must move when assumptions move."""
    growth_first = score(client, weights={
        "growth": 0.35, "affluence": 0.20, "market_size": 0.15,
        "customer_fit": 0.15, "competition": 0.10, "cost": 0.05,
    })
    conservative = score(client, weights={
        "cost": 0.25, "competition": 0.20, "affluence": 0.20,
        "customer_fit": 0.15, "growth": 0.10, "market_size": 0.10,
    })

    growth_order = [m["market_id"] for m in growth_first["markets"]]
    conservative_order = [m["market_id"] for m in conservative["markets"]]
    assert growth_order != conservative_order

    # The top of the board must reshuffle, not just the tail.
    assert set(growth_order[:5]) != set(conservative_order[:5])


def test_weights_that_do_not_sum_to_one_are_rejected(client):
    response = client.post("/api/v1/scenarios", json={"weights": {"growth": 0.5, "cost": 0.2}})
    assert response.status_code == 422
    assert "sum to 1.0" in response.json()["detail"]


def test_sensitivity_stress_tests_the_ranking(client):
    scenario = score(client)
    response = client.post(
        f"/api/v1/scenarios/{scenario['scenario_id']}/sensitivity",
        json={"iterations": 300, "weight_variation": 0.25},
    )
    assert response.status_code == 200
    body = response.json()

    assert body["iterations"] == 300
    assert len(body["markets"]) == len(scenario["markets"])
    for market in body["markets"]:
        assert 0.0 <= market["top_5_probability"] <= 1.0
        assert market["rank_p10"] <= market["rank_p90"]

    leader = body["markets"][0]
    assert leader["top_5_probability"] > 0.5


def test_compare_returns_trade_offs(client):
    scenario = score(client)
    response = client.get(
        f"/api/v1/scenarios/{scenario['scenario_id']}/compare",
        params={"markets": "12420,31080"},
    )
    assert response.status_code == 200
    body = response.json()

    assert len(body["markets"]) == 2
    pair = next(iter(body["trade_offs"].values()))
    assert pair
    assert {t["favors"] for t in pair} <= {m["name"] for m in body["markets"]}


def test_compare_rejects_an_unknown_market(client):
    scenario = score(client)
    response = client.get(
        f"/api/v1/scenarios/{scenario['scenario_id']}/compare",
        params={"markets": "12420,Atlantis"},
    )
    assert response.status_code == 404


def test_metric_catalog_documents_direction(client):
    catalog = client.get("/api/v1/data/metrics").json()
    by_name = {m["metric"]: m for m in catalog["metrics"]}

    assert by_name["median_rent"]["direction"] == "negative"
    assert by_name["population"]["direction"] == "positive"
    assert by_name["population"]["factor"] == "market_size"


def test_unknown_metric_returns_404(client):
    assert client.get("/api/v1/data/metrics/not_a_metric").status_code == 404


def test_strategy_parse_is_reused(client):
    payload = {"description": "A premium fitness studio for customers aged 25 to 44."}
    first = client.post("/api/v1/strategy/parse", json=payload)
    second = client.post("/api/v1/strategy/parse", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert second.headers["X-Strategy-Reused"] == "true"


def test_public_payload_limits(client):
    too_long = "x" * 2001
    assert client.post("/api/v1/strategy/parse", json={"description": too_long}).status_code == 422
    assert client.post("/api/v1/strategy/parse", json={"description": "   "}).status_code == 422
    assert client.post(
        "/api/v1/scenarios",
        json={"business_strategy": {"description": too_long}},
    ).status_code == 422
