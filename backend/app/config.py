"""Centralised configuration loaded from environment variables / .env.

Development-only defaults let the stack run out of the box; they are
documented in ``.env.example`` and are not real secrets. Credentials are
never hardcoded in application code.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository root: backend/app/config.py -> repo root
_REPO_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_REPO_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "PRAMAAN Backend"
    app_env: str = "development"
    version: str = "0.1.0"

    # PostgreSQL (SQLAlchemy URL). docker-compose overrides this to point at
    # the `postgres` service; the default targets the published host port.
    database_url: str = (
        "postgresql+psycopg://pramaan:pramaan_dev_password@localhost:5433/pramaan"
    )

    # MinIO (S3-compatible object storage for evidence artifacts).
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "pramaan-minio"
    minio_secret_key: str = "pramaan_minio_dev_secret"
    minio_bucket: str = "pramaan-evidence"
    minio_secure: bool = False

    # Browser origins allowed to call the API directly (used when the
    # frontend runs on the Vite dev server instead of behind nginx).
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    # --- Demo model -----------------------------------------------------
    # Demo-mode switches (demo reset/tamper endpoints, scheduled telemetry)
    # are only reachable while this is true. Production-like deployments set
    # it to false.
    demo_mode: bool = True
    # Milestone reached when the database is seeded on startup: PROTOCOL_DRAFT
    # | SEALED | RUNNING | MEASURED | VALIDATED | VERDICTED
    demo_seed_milestone: str = "VERDICTED"

    # --- Schema / data lifecycle (prototype, no migration framework yet) ---
    # Create tables on startup when missing, and seed the deterministic demo
    # dataset when the database is empty.
    auto_create_schema: bool = True
    seed_demo_on_startup: bool = True

    # --- Evidence artifact storage ---------------------------------------
    # Local fallback directory used when MinIO is unreachable (bare local
    # development). docker-compose runs with MinIO and keeps objects there.
    evidence_local_dir: str = str(
        (_REPO_ROOT / "storage" / "evidence-demo").resolve()
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
