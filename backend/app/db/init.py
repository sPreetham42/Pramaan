"""Startup database initialisation for the prototype.

Creates tables when missing (no migration framework in the demo phase) and
seeds the deterministic demo dataset when the database is empty, so
``docker compose up`` lands in a presentable state without manual setup.
"""

import logging

from sqlalchemy import func, select

from app.config import settings
from app.demo_seed import MILESTONES, seed_demo

logger = logging.getLogger(__name__)


def init_schema_and_seed() -> None:
    from app.db.base import Base
    from app.db.session import SessionLocal, engine
    import app.models  # noqa: F401 — register all models on Base.metadata

    if settings.auto_create_schema:
        Base.metadata.create_all(bind=engine)

    if not settings.seed_demo_on_startup:
        return
    with SessionLocal() as db:
        from app.models import Challenge

        empty = db.scalar(select(func.count()).select_from(Challenge)) == 0
        if not empty:
            return
        milestone = settings.demo_seed_milestone
        if milestone not in MILESTONES:
            logger.warning(
                "Unknown DEMO_SEED_MILESTONE '%s'; seeding to VERDICTED.",
                milestone,
            )
            milestone = "VERDICTED"
        seed_demo(db, milestone)
        logger.info("Seeded PRAMAAN demo dataset to milestone %s.", milestone)
