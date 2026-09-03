"""Proof reuse across departments plus the founder/records views."""

from fastapi.testclient import TestClient


def test_discovery_lists_the_verified_record(client: TestClient) -> None:
    discovery = client.get("/api/v1/challenges/2/proof").json()["discovery"]
    assert len(discovery) == 1
    item = discovery[0]
    assert item["source_department"] == (
        "Health and Family Welfare Department, Government of Karnataka"
    )
    assert item["reference"] == "VPR/2026/KHFW-001"
    assert item["startup"] == "Pravaah Health Systems"
    assert item["outcome"] == "MET"
    assert item["shared_tags"] == ["waiting_time"]
    assert item["evidence_verified"] is True


def test_reuse_verified_evidence(client: TestClient) -> None:
    vpr = client.get("/api/v1/vprs/1").json()
    decision = client.post(
        "/api/v1/challenges/2/reuse-decision",
        json={
            "vpr_id": vpr["id"],
            "action": "REUSE_EVIDENCE",
            "rationale": (
                "Same operational metric family and waiting-time target at "
                "citizen service counters; verified evidence is relevant."
            ),
            "decided_by": "Karnataka One evaluation cell",
        },
    )
    assert decision.status_code == 200, decision.text
    challenge2 = decision.json()["challenge"]
    assert challenge2["status"] == "COMPLETED"
    assert challenge2["reuse_decisions"][0]["action"] == "REUSE_EVIDENCE"

    # The department decision does not claim procurement approval.
    pilot = client.get("/api/v1/pilots/1").json()
    assert "recommendation to the department" in pilot["scale"]["basis"]
    assert "procurement authority" in pilot["scale"]["basis"]

    again = client.post(
        "/api/v1/challenges/2/reuse-decision",
        json={"vpr_id": vpr["id"], "action": "REUSE_EVIDENCE"},
    )
    assert again.status_code == 409


def test_confirmatory_pilot_inherits_sealed_criteria(client: TestClient) -> None:
    vpr = client.get("/api/v1/vprs/1").json()
    decision = client.post(
        "/api/v1/challenges/2/reuse-decision",
        json={
            "vpr_id": vpr["id"],
            "action": "CONFIRMATORY_PILOT",
            "rationale": "Re-measure at counter locations before deciding.",
            "decided_by": "Karnataka One evaluation cell",
        },
    )
    assert decision.status_code == 200, decision.text
    body = decision.json()
    assert body["decision"]["confirmatory_pilot_id"] is not None
    assert body["challenge"]["status"] == "IN_PILOT"

    confirmatory_id = body["decision"]["confirmatory_pilot_id"]
    confirmatory = client.get(f"/api/v1/pilots/{confirmatory_id}").json()
    assert confirmatory["startup"]["name"] == "Pravaah Health Systems"
    assert confirmatory["status"] == "SELECTED"
    # Criteria inherited from the verified record: same metric and target.
    protocol = confirmatory["current_protocol"]
    assert protocol["status"] == "DRAFT"
    assert protocol["target_value"] == 25
    assert protocol["metric"] == vpr["verdict"]["metric"]
    assert "VPR/2026/KHFW-001" in protocol["measurement_method"]
    assert len(confirmatory["milestones"]) == 4
    assert len(confirmatory["risks"]) == 4


def test_startup_founder_and_records_views(client: TestClient) -> None:
    startups = client.get("/api/v1/startups").json()["startups"]
    assert [s["name"] for s in startups] == [
        "Pravaah Health Systems",
        "QueTek Solutions",
        "FlowGrid Labs",
    ]
    pravaah = client.get("/api/v1/startups/1").json()
    assert pravaah["applications"][0]["status"] == "SELECTED"
    assert len(pravaah["pilots"]) == 1

    # An ineligible founder sees why they were screened out.
    flowgrid = client.get("/api/v1/startups/3").json()
    application = flowgrid["applications"][0]
    assert application["status"] == "INELIGIBLE"
    assert application["eligibility"]["eligible"] is False
    unmet = [c for c in application["eligibility"]["checks"] if not c["met"]]
    assert len(unmet) == 2

    vprs = client.get("/api/v1/vprs").json()["vprs"]
    assert vprs[0]["reference"] == "VPR/2026/KHFW-001"
    assert vprs[0]["outcome"] == "MET"


def test_challenge_publishes_criteria_and_templates(client: TestClient) -> None:
    challenge = client.get("/api/v1/challenges/1").json()
    assert len(challenge["eligibility_criteria"]) == 4
    assert challenge["evaluation_dimensions"] == [
        "Problem Fit",
        "Technical Capability",
        "Implementation Readiness",
        "Evidence of Capability",
        "Pilot Feasibility",
        "Risk",
    ]
    assert challenge["kpi"]["baseline_value"] == 42.0
    assert challenge["kpi"]["target_value"] == 25.0

    templates = client.get("/api/v1/challenges/1/templates").json()["templates"]
    slugs = [t["slug"] for t in templates]
    assert slugs == [
        "problem-statement",
        "evaluation-criteria",
        "pilot-agreement",
        "data-ip",
        "cybersecurity",
        "risk-management",
        "procurement-pathway",
    ]
    problem = next(t for t in templates if t["slug"] == "problem-statement")
    assert "42" in problem["content"]
