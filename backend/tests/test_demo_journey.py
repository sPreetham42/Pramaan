"""The golden path: challenge -> selection -> protocol -> seal -> pilot ->
measurement -> evidence -> validation -> verdict -> VPR. Driven through the
public API on a fresh seeded database per test."""

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


def _reset(client: TestClient, milestone: str) -> None:
    response = client.post("/api/v1/demo/reset", json={"milestone": milestone})
    assert response.status_code == 200, response.text


def test_default_state_is_fully_seeded(client: TestClient) -> None:
    challenges = client.get("/api/v1/challenges").json()["challenges"]
    assert [c["id"] for c in challenges] == [1, 2]

    challenge1 = client.get("/api/v1/challenges/1").json()
    assert challenge1["status"] == "COMPLETED"
    assert len(challenge1["applications"]) == 3
    # Three startups with different eligibility outcomes.
    by_name = {a["startup"]["name"]: a for a in challenge1["applications"]}
    assert by_name["Pravaah Health Systems"]["status"] == "SELECTED"
    assert by_name["Pravaah Health Systems"]["eligibility"]["eligible"] is True
    assert by_name["QueTek Solutions"]["status"] == "NOT_SELECTED"
    assert by_name["FlowGrid Labs"]["status"] == "INELIGIBLE"
    assert len(by_name["Pravaah Health Systems"]["evaluations"]) == 2

    pilot = client.get("/api/v1/pilots/1").json()
    assert pilot["status"] == "VERDICTED"
    assert pilot["verdict"]["outcome"] == "MET"
    assert pilot["verdict"]["observed_value"] == 24.0
    assert pilot["vpr"]["reference"] == "VPR/2026/KHFW-001"
    assert [m["payment_status"] for m in pilot["milestones"]] == [
        "RELEASED",
        "RELEASED",
        "RELEASED",
        "RELEASED",
    ]
    assert len(pilot["evidence"]) == 4
    assert all(e["latest_check"]["ok"] for e in pilot["evidence"])
    assert pilot["sealed_protocol"]["content_hash"] is not None

    vpr = client.get("/api/v1/vprs/1").json()
    assert vpr["verdict"]["outcome"] == "MET"
    assert vpr["scale"]["outcome"] == "SCALE_UP_RECOMMENDED"
    assert vpr["validation"]["validator_name"] is not None
    assert client.get("/api/v1/vprs/1/audit-verify").json()["ok"] is True

    # Second department challenge is open and waiting for a reuse decision.
    challenge2 = client.get("/api/v1/challenges/2").json()
    assert challenge2["status"] == "OPEN"
    assert challenge2["department"]["short_name"] == "Karnataka One"


def test_golden_path_from_pre_selection_to_vpr(client: TestClient) -> None:
    _reset(client, "PRE_SELECTION")

    before = client.get("/api/v1/challenges/1").json()
    assert before["status"] == "OPEN"
    assert before["pilots"] == []

    # 1. Competitive selection of the strongest startup.
    selected = client.post(
        "/api/v1/challenges/1/pilots", json={"startup_id": 1}
    )
    assert selected.status_code == 201
    pilot = selected.json()
    assert pilot["status"] == "SELECTED"
    pilot_id = pilot["id"]
    assert len(pilot["milestones"]) == 4
    assert len(pilot["risks"]) == 4

    # 2. Define the draft protocol, then approve and seal it.
    drafted = client.put(
        f"/api/v1/pilots/{pilot_id}/protocol", json=PROTOCOL_BODY
    )
    assert drafted.status_code == 200
    stored = drafted.json()["protocol"]
    assert stored["target_value"] == 25
    assert stored["success_rule"]

    approved = client.post(f"/api/v1/pilots/{pilot_id}/protocol/approve")
    assert approved.status_code == 200

    sealed = client.post(f"/api/v1/pilots/{pilot_id}/protocol/seal")
    assert sealed.status_code == 200
    sealed_body = sealed.json()
    assert sealed_body["status"] == "SEALED"
    assert sealed_body["protocol"]["status"] == "SEALED"
    assert sealed_body["protocol"]["content_hash"]

    # 3. Run the pilot with the demo's deterministic weekly telemetry.
    started = client.post(f"/api/v1/pilots/{pilot_id}/start")
    assert started.status_code == 200
    assert started.json()["status"] == "RUNNING"

    for week in range(4):
        sync = client.post("/api/v1/demo/sync-week", json={"pilot_id": pilot_id})
        assert sync.status_code == 200, sync.text

    closed = client.get(f"/api/v1/pilots/{pilot_id}").json()
    assert closed["status"] == "COMPLETED"
    values = [m["value"] for m in closed["measurements"]]
    assert values == [31.0, 26.0, 21.0, 18.0]
    assert len(closed["evidence"]) == 4

    # 4. Result is computed from stored measurements, never hardcoded.
    result = client.get(f"/api/v1/pilots/{pilot_id}/result").json()
    assert result["observed_value"] == 24.0
    assert result["met"] is True
    assert result["sample_count"] == 4

    # 5. Verify every evidence artifact against its recorded hash.
    for evidence in closed["evidence"]:
        check = client.post(f"/api/v1/evidence/{evidence['id']}/verify").json()
        assert check["ok"] is True
        assert check["computed_hash"] == evidence["sha256"]

    # 6. Independent validation signs off.
    opened = client.post(
        f"/api/v1/pilots/{pilot_id}/validation",
        json={"validator_name": "Dr. Anita Rao (Independent Evaluator)"},
    )
    assert opened.status_code == 200
    signed = client.post(
        f"/api/v1/pilots/{pilot_id}/validation/approve",
        json={"notes": "Logs match source records at both sites."},
    )
    assert signed.status_code == 200

    # 7. Deterministic verdict, then the Verified Pilot Record.
    verdict = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict",
        json={"issued_by": "Health and Family Welfare Department"},
    )
    assert verdict.status_code == 200
    final = verdict.json()
    assert final["status"] == "VERDICTED"
    assert final["verdict"]["outcome"] == "MET"
    assert final["verdict"]["observed_value"] == 24.0
    assert final["verdict"]["protocol_version"] == 1
    assert final["vpr"]["reference"] == "VPR/2026/KHFW-001"
    assert final["scale"]["outcome"] == "SCALE_UP_RECOMMENDED"
    assert client.get("/api/v1/challenges/1").json()["status"] == "COMPLETED"
    assert client.get(f"/api/v1/vprs/{final['vpr']['id']}/audit-verify").json()["ok"]

    # The verdict is final: issuing again must fail without changing state.
    repeat = client.post(
        f"/api/v1/pilots/{pilot_id}/verdict",
        json={"issued_by": "Health and Family Welfare Department"},
    )
    assert repeat.status_code == 409
    audit_count = client.get(f"/api/v1/pilots/{pilot_id}").json()
    assert len(audit_count["audit"]) > 20


def test_earlier_milestone_seeds_exist(client: TestClient) -> None:
    """Each milestone seeds a coherent, viewable state (used for demo replays)."""
    expectations = {
        "PROTOCOL_DRAFT": "SELECTED",
        "SEALED": "SEALED",
        "RUNNING": "RUNNING",
        "MEASURED": "COMPLETED",
        "VALIDATED": "COMPLETED",
        "VERDICTED": "VERDICTED",
    }
    for milestone, pilot_status in expectations.items():
        _reset(client, milestone)
        body = client.get("/api/v1/challenges/1").json()
        assert body["pilots"], milestone
        assert client.get("/api/v1/pilots/1").json()["status"] == pilot_status, milestone
