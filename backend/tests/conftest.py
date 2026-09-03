"""Shared fixtures.

Environment defaults are applied BEFORE the app is imported so tests run
hermetically on machines without PostgreSQL/MinIO:

- ``DATABASE_URL`` defaults to an in-memory SQLite database (still proves the
  engine/session plumbing; /health then reports database: ok).
- MinIO probes are stubbed — real MinIO connectivity is verified in the
  docker-compose environment, not in unit tests.

Set ``DATABASE_URL`` (e.g. to the compose PostgreSQL) to exercise the real
database stack — the suite then also asserts /health reports database: ok.
"""

import os
from collections.abc import Generator

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def _stub_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep storage probes instant; MinIO is not part of unit tests."""
    monkeypatch.setattr("app.main.ensure_evidence_bucket", lambda *a, **k: False)
    monkeypatch.setattr("app.api.system.storage_available", lambda: False)


@pytest.fixture()
def client() -> Generator[TestClient, None, None]:
    with TestClient(app) as test_client:
        yield test_client
