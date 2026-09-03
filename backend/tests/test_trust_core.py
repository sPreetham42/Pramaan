"""Trust-core rules: criteria lock before outcome, verdict preconditions,
evidence integrity and tamper detection, invalid transitions."""

from fastapi.testclient import TestClient

PROTOCOL_BODY = {
    "metric": "Average registration-to-consultation waiting time",
    "target_operator": "lte",
    "target_value": 25,
    "unit": "minutes",
    "duration_days": 28,
    "sample_interval": "weekly",
    "measurement_method": "Weekly sampling from timestamped hospital records.",
}
CHANGED_BODY = {**PROTOCOL_BODY, "target_value": 20}


def _reset(client: TestClient, milestone: str) -> None:
    response = client.post("/api/v1/demo/reset", json={"milestone": milestone})
    assert response.status_code == 200, response.text


def _run_to_completed(client: TestClient, pilot_id: int) -> None:
    client.post(f"/api/v1/pilots/{pilot_id}/start")
    for _ in range(4):
        client.post("/api/v1/demo/sync-week", json={"pilot_id": pilot_id})


def test_sealed_criteria_cannot_be_modified(client: TestClient) -> None:
    _reset(client, "SEALED")
    pilot_id = client.get("/api/v1/challenges/1").json()["pilots"][0]["id"]

    locked = client.put(f"/api/v1/pilots/{pilot_id}/protocol", json=CHANGED_BODY)
    assert locked.status_code == 409
    assert "new protocol version" in locked.json()["detail"].lower()

    # The stored protocol still shows the sealed values.
    stored = client.get(f"/api/v1/pilots/{pilot_id}").json()["sealed_protocol"]
    assert stored["target_value"] == 25
    assert stored["status"] == "SEALED"

    # Approval already happened: further draft edits are blocked.
    _reset(client, "PROTOCOL_DRAFT")
    pilot_id = client.get("/api/v1/challenges/1").json()["pilots"][0]["id"]
    client.put(f"/api/v1/pilots/{pilot_id}/protocol", json=PROTOCOL_BODY)
    assert (
        client.post(f"/api/v1/pilots/{pilot_id}/protocol/approve").status_code == 200
    )
    blocked = client.put(f"/api/v1/pilots/{pilot_id}/protocol", json=CHANGED_BODY)
    assert blocked.status_code == 409


def test_new_protocol_version_is_the_amendment_path(client: TestClient) -> None:
    _reset(client, "SEALED")
    pilot_id = client.get("/api/v1/challenges/1").json()["pilots"][0]["id"]
    versioned = client.post(f"/api/v1/pilots/{pilot_id}/protocol/versions")
    assert versioned.status_code == 200
    draft = versioned.json()["protocol"]
    assert draft["version"] == 2
    assert draft["status"] == "DRAFT"

    # The new draft can be edited, re-approved, and re-sealed; v1 stays sealed.
    edited = client.put(
        f"/api/v1/pilots/{pilot_id}/protocol", json=CHANGED_BODY
    )
    assert edited.status_code == 200
    assert edited.json()["protocol"]["target_value"] == 20
    assert client.post(f"/api/v1/pilots/{pilot_id}/protocol/approve").status_code == 200
    resealed = client.post(f"/api/v1/pilots/{pilot_id}/protocol/seal")
    assert resealed.status_code == 200
    protocols = client.get(f"/api/v1/pilots/{pilot_id}").json()["protocols"]
    assert [p["version"] for p in protocols] == [1, 2]
    assert all(p["content_hash"] for p in protocols)

    # After the run starts, versioning is closed.
    client.post(f"/api/v1/pilots/{pilot_id}/start")
    assert (
        client.post(f"/api/v1/pilots/{pilot_id}/protocol/versions").status_code == 409
    )


def test_verdict_requires_completed_pilot_sealed_criteria_and_validation(client: TestClient) -> None:
    _reset(client, "PROTOCOL_DRAFT")
    pilot_id = client.get("/api/v1/challenges/1").json()["pilots"][0]["id"]

    # Not yet sealed, not running.
    early = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
    )
    assert early.status_code == 409

    # Running but measurement window still open.
    client.put(f"/api/v1/pilots/{pilot_id}/protocol", json=PROTOCOL_BODY)
    client.post(f"/api/v1/pilots/{pilot_id}/protocol/approve")
    client.post(f"/api/v1/pilots/{pilot_id}/protocol/seal")
    client.post(f"/api/v1/pilots/{pilot_id}/start")
    running = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
    )
    assert running.status_code == 409

    # Completed with measurements and verified evidence, but no validation.
    for _ in range(4):
        client.post("/api/v1/demo/sync-week", json={"pilot_id": pilot_id})
    no_validation = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
    )
    assert no_validation.status_code == 409

    # Sign off as validator, then the verdict is issued and final.
    client.post(
        f"/api/v1/pilots/{pilot_id}/validation",
        json={"validator_name": "Dr. Anita Rao (Independent Evaluator)"},
    )
    assert (
        client.post(
            f"/api/v1/pilots/{pilot_id}/validation/approve",
            json={"notes": "Reviewed."},
        ).status_code
        == 200
    )
    verdict = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
    )
    assert verdict.status_code == 200
    assert verdict.json()["verdict"]["outcome"] == "MET"
    assert (
        client.post(
            f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
        ).status_code
        == 409
    )


def test_verdict_withheld_when_no_evidence(client: TestClient) -> None:
    """A completed pilot without evidence cannot pass validation or verdict."""
    _reset(client, "PROTOCOL_DRAFT")
    pilot_id = client.get("/api/v1/challenges/1").json()["pilots"][0]["id"]
    client.put(f"/api/v1/pilots/{pilot_id}/protocol", json=PROTOCOL_BODY)
    client.post(f"/api/v1/pilots/{pilot_id}/protocol/approve")
    client.post(f"/api/v1/pilots/{pilot_id}/protocol/seal")
    client.post(f"/api/v1/pilots/{pilot_id}/start")
    # Manual measurements, no evidence artifacts at all.
    for week, value in [("Week 1", 30), ("Week 2", 26)]:
        recorded = client.post(
            f"/api/v1/pilots/{pilot_id}/measurements",
            json={"label": week, "value": value, "recorded_on": "2026-07-01"},
        )
        assert recorded.status_code == 200, recorded.text
    client.post(f"/api/v1/pilots/{pilot_id}/close")
    client.post(
        f"/api/v1/pilots/{pilot_id}/validation",
        json={"validator_name": "Validator"},
    )
    signing = client.post(
        f"/api/v1/pilots/{pilot_id}/validation/approve",
        json={"notes": "No evidence to inspect."},
    )
    assert signing.status_code == 409
    verdict = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
    )
    assert verdict.status_code == 409


def test_tamper_detection_blocks_validation_and_verdict(client: TestClient) -> None:
    _reset(client, "MEASURED")
    pilot = client.get("/api/v1/pilots/1").json()
    pilot_id = pilot["id"]
    first = pilot["evidence"][0]

    assert client.post(f"/api/v1/evidence/{first['id']}/verify").json()["ok"] is True

    tampered = client.post(
        "/api/v1/demo/tamper", json={"evidence_id": first["id"]}
    )
    assert tampered.status_code == 200

    check = client.post(f"/api/v1/evidence/{first['id']}/verify").json()
    assert check["ok"] is False
    assert check["computed_hash"] != check["recorded_hash"]

    # Validation sign-off and the verdict must both be withheld.
    client.post(
        f"/api/v1/pilots/{pilot_id}/validation",
        json={"validator_name": "Validator"},
    )
    signing = client.post(
        f"/api/v1/pilots/{pilot_id}/validation/approve", json={"notes": "x"}
    )
    assert signing.status_code == 409
    verdict = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict", json={"issued_by": "Dept"}
    )
    assert verdict.status_code == 409


def test_invalid_evidence_and_measurement_states(client: TestClient) -> None:
    # Default VERDICTED state: evidence uploads and measurements are closed.
    closed = client.post(
        "/api/v1/pilots/1/evidence",
        files={"file": ("late.txt", b"late", "text/plain")},
        data={"title": "Late upload"},
    )
    assert closed.status_code == 409

    # Measurement before the pilot runs is rejected.
    _reset(client, "SEALED")
    pilot_id = client.get("/api/v1/challenges/1").json()["pilots"][0]["id"]
    measured = client.post(
        f"/api/v1/pilots/{pilot_id}/measurements",
        json={"label": "Week 1", "value": 30, "recorded_on": "2026-07-01"},
    )
    assert measured.status_code == 409

    # Evidence upload while the pilot is running is allowed.
    client.post(f"/api/v1/pilots/{pilot_id}/start")
    uploaded = client.post(
        f"/api/v1/pilots/{pilot_id}/evidence",
        files={"file": ("note.txt", b"pilot note bytes", "text/plain")},
        data={"title": "Deployment report", "kind": "report", "source": "site"},
    )
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()["evidence"]
    assert body["sha256"]
    assert body["storage_backend"] == "local"

    # Empty files are rejected.
    empty = client.post(
        f"/api/v1/pilots/{pilot_id}/evidence",
        files={"file": ("empty.txt", b"", "text/plain")},
        data={"title": "Empty"},
    )
    assert empty.status_code == 422


def test_download_and_get_do_not_mutate(client: TestClient) -> None:
    evidence = client.get("/api/v1/pilots/1").json()["evidence"][0]
    download = client.get(f"/api/v1/evidence/{evidence['id']}/download")
    assert download.status_code == 200
    import hashlib

    downloaded_hash = hashlib.sha256(download.content).hexdigest()
    assert downloaded_hash == evidence["sha256"]

    # A GET on the journey and result must not add audit events or change state.
    before = client.get("/api/v1/pilots/1").json()
    client.get("/api/v1/pilots/1/result")
    client.get(f"/api/v1/vprs/{before['vpr']['id']}")
    after = client.get("/api/v1/pilots/1").json()
    assert len(after["audit"]) == len(before["audit"])
    assert after["verdict"]["outcome"] == before["verdict"]["outcome"]
