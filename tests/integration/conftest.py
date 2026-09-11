"""An isolated database per test, wired in through the FastAPI dependency."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base, get_session
from app.db.repositories import replace_observations, upsert_market
from app.main import app
from scripts.seed_demo import SOURCE, build_rows


@pytest.fixture
def session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path/'test.db'}", future=True)
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, future=True)
    with maker() as session:
        yield session


@pytest.fixture
def seeded_session(session):
    markets, rows = build_rows()
    for market in markets:
        upsert_market(session, market["market_id"], market["name"], market["state_codes"])
    replace_observations(session, rows, SOURCE)
    session.commit()
    return session


@pytest.fixture
def client(seeded_session):
    app.dependency_overrides[get_session] = lambda: seeded_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
