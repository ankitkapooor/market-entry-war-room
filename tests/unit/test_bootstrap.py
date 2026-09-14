from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.bootstrap import sync_census_data
from app.config import settings
from app.db.database import Base, Observation


def test_sync_filters_prior_vintage_markets_retired_from_current_data(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'bootstrap.db'}")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, autoflush=False)
    monkeypatch.setattr("app.bootstrap.SessionLocal", Session)
    monkeypatch.setattr("app.bootstrap.init_db", lambda: None)
    monkeypatch.setattr(settings, "census_vintage", 2024)
    monkeypatch.setattr(settings, "census_prior_vintage", 2019)

    def fake_fetch(vintage):
        if vintage == 2024:
            return {"1": "Current, TX Metro Area"}, [
                {"market_id": "1", "metric": "population", "value": 110, "vintage": 2024}
            ]
        return {"1": "Current", "2": "Retired"}, [
            {"market_id": "1", "metric": "population", "value": 100, "vintage": 2019},
            {"market_id": "2", "metric": "population", "value": 50, "vintage": 2019},
        ]

    monkeypatch.setattr("app.bootstrap.fetch_vintage", fake_fetch)

    summary = sync_census_data()

    with Session() as session:
        rows = list(session.scalars(select(Observation)))
    assert summary["observations"] == 2
    assert {row.market_id for row in rows} == {"1"}
