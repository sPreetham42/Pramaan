"""Engine and session factory, created once from ``app.config.settings``.

No domain tables exist yet; this layer exists so /health can verify the
PostgreSQL connection and module developers can depend on a ready session.
"""

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a request-scoped session (used by domain
    routers as they are added)."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
