"""Shared fixtures.

Environment defaults are applied BEFORE the app is imported so tests run
hermetically on machines without PostgreSQL/MinIO:

- ``DATABASE_URL`` defaults to an in-memory SQLite database (single shared
  connection via StaticPool).
- Evidence storage stays local: MinIO probes are disabled and the local
  demo directory points at a per-test temp folder, so hashing/verification
  runs against real persisted bytes.

Each test starts from an empty schema. The app lifespan then seeds the
deterministic demo dataset to the VERDICTED milestone; tests that need an
earlier stage reset it through ``POST /api/v1/demo/reset``.
"""

import os
from collections.abc import Generator

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient

from app.config import settings
from app.main import app


@pytest.fixture(autouse=True)
def _fresh_demo_db(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Drop and recreate the schema before every test; keep storage local."""
    monkeypatch.setattr(settings, "evidence_local_dir", str(tmp_path / "evidence"))
    monkeypatch.setattr("app.storage.storage_available", lambda: False)
    monkeypatch.setattr("app.api.system.storage_available", lambda: False)
    monkeypatch.setattr("app.main.ensure_evidence_bucket", lambda *a, **k: False)

    from app.db.base import Base
    from app.db.session import engine
    import app.models  # noqa: F401 — register models before create_all

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
