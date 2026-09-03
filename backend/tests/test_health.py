import os

import pytest
from fastapi.testclient import TestClient


def test_root(client: TestClient) -> None:
    response = client.get("/")
    assert response.status_code == 200
    body = response.json()
    assert body["service"] == "PRAMAAN Backend"
    assert "Prove Once. Reuse the Proof." in body["message"]


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "pramaan-backend"
    assert body["environment"] == "development"
    assert set(body["checks"]) == {"database", "storage"}
    assert body["checks"]["database"] in {"ok", "unavailable"}
    assert body["checks"]["storage"] in {"ok", "unavailable"}


@pytest.mark.skipif(
    not os.environ.get("DATABASE_URL"),
    reason="DATABASE_URL not set — not testing against real PostgreSQL",
)
def test_health_database_ok_when_postgres_configured(client: TestClient) -> None:
    """With DATABASE_URL pointed at PostgreSQL, /health must report it."""
    body = client.get("/health").json()
    assert body["checks"]["database"] == "ok"
