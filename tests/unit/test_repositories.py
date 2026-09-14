import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.config import settings
from app.db.database import Base, Scenario, StrategyParse
from app.db.repositories import save_cached_strategy, save_scenario


@pytest.fixture
def session(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'repositories.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    with Session() as database_session:
        yield database_session


def test_saved_scenarios_are_bounded(session, monkeypatch):
    monkeypatch.setattr(settings, "scenario_max_saved", 2)
    for number in range(3):
        save_scenario(
            session,
            scenario_id=f"scenario-{number}",
            description="test",
            strategy={},
            weights={},
            warnings=[],
            results=[],
        )

    ids = set(session.scalars(select(Scenario.id)))
    assert ids == {"scenario-1", "scenario-2"}


def test_strategy_cache_is_bounded(session, monkeypatch):
    monkeypatch.setattr(settings, "strategy_cache_max_saved", 2)
    for number in range(3):
        save_cached_strategy(
            session,
            cache_key=f"cache-{number}",
            provider="openai",
            model="test-model",
            description="test",
            response={"number": number},
        )

    count = session.scalar(select(func.count()).select_from(StrategyParse))
    assert count == 2
