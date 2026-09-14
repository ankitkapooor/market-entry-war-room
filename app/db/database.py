"""SQLAlchemy engine, session and the tables from spec section 24."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import DATA_DIR, settings


class Base(DeclarativeBase):
    pass


class Market(Base):
    __tablename__ = "markets"

    id = Column(String, primary_key=True)  # CBSA code, e.g. "12420"
    name = Column(String, nullable=False)
    state_codes = Column(String, nullable=False, default="")


class Observation(Base):
    """One metric value for one market at one vintage, with its source."""

    __tablename__ = "observations"
    __table_args__ = (UniqueConstraint("market_id", "metric", "vintage"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    market_id = Column(String, ForeignKey("markets.id"), nullable=False, index=True)
    metric = Column(String, nullable=False, index=True)
    value = Column(Float, nullable=False)
    vintage = Column(Integer, nullable=False)
    source = Column(String, nullable=False)


class Scenario(Base):
    __tablename__ = "scenarios"

    id = Column(String, primary_key=True)
    description = Column(String, nullable=False, default="")
    strategy_json = Column(String, nullable=False, default="{}")
    warnings_json = Column(String, nullable=False, default="[]")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ScenarioWeight(Base):
    __tablename__ = "scenario_weights"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False, index=True)
    factor = Column(String, nullable=False)
    weight = Column(Float, nullable=False)


class ScenarioResult(Base):
    __tablename__ = "scenario_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    scenario_id = Column(String, ForeignKey("scenarios.id"), nullable=False, index=True)
    market_id = Column(String, ForeignKey("markets.id"), nullable=False)
    score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=False)
    factor_scores_json = Column(String, nullable=False, default="{}")
    metrics_json = Column(String, nullable=False, default="{}")


class StrategyParse(Base):
    """Persistent cache for deterministic, temperature-zero strategy parses."""

    __tablename__ = "strategy_parses"

    cache_key = Column(String, primary_key=True)
    provider = Column(String, nullable=False)
    model = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    response_json = Column(Text, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


engine = create_engine(
    settings.database_url,
    future=True,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)


if settings.database_url.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def configure_sqlite(connection, _record) -> None:
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, future=True)


def init_db() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(engine)


def get_session():
    """FastAPI dependency yielding a session."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
