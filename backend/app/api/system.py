from fastapi import APIRouter
from sqlalchemy import text

from app import __version__
from app.config import settings
from app.db.session import engine
from app.storage import storage_available

system_router = APIRouter(tags=["system"])


@system_router.get("/")
def root() -> dict[str, str]:
    return {
        "service": settings.app_name,
        "message": "PRAMAAN — Prove Once. Reuse the Proof.",
        "docs": "/docs",
        "version": __version__,
    }


@system_router.get("/health")
def health() -> dict[str, object]:
    """Liveness check: always 200 while the process runs. Reports whether
    PostgreSQL and MinIO are reachable so the demo stack can be verified
    without any business logic."""
    database = "ok"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — health checks must not crash
        database = "unavailable"

    storage = "ok" if storage_available() else "unavailable"

    return {
        "status": "ok",
        "service": "pramaan-backend",
        "version": __version__,
        "environment": settings.app_env,
        "checks": {"database": database, "storage": storage},
    }
