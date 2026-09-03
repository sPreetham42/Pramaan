"""Deterministic demo dataset and milestone engine.

Seeding replays the real workflow services (selection, protocol approval and
seal, pilot start, weekly measurements with real hashed evidence, validation,
verdict, VPR), so the seeded final state is byte-for-byte the state a live
presentation would produce. ``reset_demo`` deletes the demo rows (and local
evidence artifacts) and re-seeds up to a chosen milestone, giving presenters
a repeatable replay: PRE_SELECTION, PROTOCOL_DRAFT, SEALED, RUNNING,
MEASURED, VALIDATED, VERDICTED.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationStatus,
    AuditEvent,
    Challenge,
    ChallengeStatus,
    Department,
    Evaluation,
    Evidence,
    EvidenceCheck,
    Measurement,
    Pilot,
    PilotMilestone,
    PilotRisk,
    Protocol,
    ReuseDecision,
    ScaleDecision,
    Startup,
    Validation,
    Verdict,
    Vpr,
)
from app.services import demo as demo_service
from app.services import evidence as evidence_service
from app.services import workflow

MILESTONES = [
    "PRE_SELECTION",
    "PROTOCOL_DRAFT",
    "SEALED",
    "RUNNING",
    "MEASURED",
    "VALIDATED",
    "VERDICTED",
]

_UTC = timezone.utc


def _dt(year: int, month: int, day: int, hour: int = 9, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=_UTC)


# Fixed demo timeline (2026).
SELECTION_AT = _dt(2026, 6, 15, 10, 0)
APPROVE_AT = _dt(2026, 6, 16, 14, 0)
SEAL_AT = _dt(2026, 6, 17, 9, 30)
START_AT = _dt(2026, 6, 22, 9, 0)
VALIDATE_AT = _dt(2026, 7, 22, 11, 0)
VERDICT_AT = _dt(2026, 7, 24, 10, 0)

SCREENING_ON = date(2026, 6, 6)
EVALUATED_ON = date(2026, 6, 12)


def _eligibility(met_deployment: bool, met_docs: bool, detail_deployment: str, detail_docs: str) -> list[dict]:
    return [
        {
            "check": "Recognized startup",
            "met": True,
            "detail": "DPIIT recognition certificate verified against the startup registry.",
        },
        {"check": "Domain fit", "met": True, "detail": "Proposal targets the published problem domain."},
        {
            "check": "Deployment capability",
            "met": met_deployment,
            "detail": detail_deployment,
        },
        {
            "check": "Required documentation",
            "met": met_docs,
            "detail": detail_docs,
        },
    ]


def _seed_reference_data(db: Session) -> dict:
    """Departments, challenges, startups, applications, evaluations."""
    khfw = Department(
        name="Health and Family Welfare Department, Government of Karnataka",
        short_name="KHFW",
        description=(
            "Operates district and taluk hospitals across Karnataka. Runs the "
            "challenge to cut outpatient waiting times through a competitive pilot."
        ),
    )
    e_governance = Department(
        name="Department of e-Governance, Government of Karnataka",
        short_name="Karnataka One",
        description=(
            "Operates Karnataka One citizen service centres that issue "
            "certificates and process citizen requests at the counter."
        ),
    )
    db.add_all([khfw, e_governance])
    db.flush()

    challenge1 = Challenge(
        department_id=khfw.id,
        status=ChallengeStatus.OPEN,
        title="Reduce outpatient waiting time at Karnataka district hospitals",
        problem=(
            "Patients at district hospital OPDs wait an average of 42 minutes "
            "between registration and consultation. Long waits crowd waiting "
            "areas and delay care. The department wants a proven solution "
            "before committing to a wider rollout."
        ),
        expected_outcome=(
            "A measurable reduction in registration-to-consultation waiting "
            "time at two pilot hospitals, verified against criteria fixed "
            "before the pilot runs."
        ),
        kpi_metric="Average registration-to-consultation waiting time",
        baseline_value=42.0,
        target_value=25.0,
        target_operator="lte",
        unit="minutes",
        duration_days=28,
        eligibility_criteria=[
            {"label": "Recognized startup", "requirement": "Registered startup with valid recognition."},
            {"label": "Domain fit", "requirement": "Solution directly targets outpatient hospital operations."},
            {"label": "Deployment capability", "requirement": "Can deploy at two district hospitals within 30 days."},
            {"label": "Required documentation", "requirement": "Capability evidence and data-safety documentation submitted."},
        ],
        evaluation_dimensions=[
            "Problem Fit",
            "Technical Capability",
            "Implementation Readiness",
            "Evidence of Capability",
            "Pilot Feasibility",
            "Risk",
        ],
        pilot_expectations=(
            "Run the intervention at two district hospital OPDs for four weeks. "
            "Report the average registration-to-consultation waiting time every "
            "week and submit timestamped sampling logs as evidence."
        ),
        evidence_requirements=[
            {"label": "Weekly sampling logs", "requirement": "Timestamped registration-to-consultation records, aggregated per week per site."},
            {"label": "Deployment report", "requirement": "Sites, go-live dates, and configuration summary."},
            {"label": "Data safety note", "requirement": "De-identification and retention approach for patient timestamps."},
        ],
        tags=["health", "outpatient", "waiting_time"],
    )
    challenge2 = Challenge(
        department_id=e_governance.id,
        status=ChallengeStatus.OPEN,
        title="Reduce waiting time at Karnataka One citizen service centres",
        problem=(
            "Citizens queue at Karnataka One counters for certificates and "
            "service requests. Average counter waiting time is 38 minutes and "
            "peaks disrupt the working day. The department wants verified "
            "evidence before scaling any queue-management intervention."
        ),
        expected_outcome=(
            "A decision on how to act: reuse verified evidence from a similar "
            "departmental pilot or run a short confirmatory pilot."
        ),
        kpi_metric="Average counter waiting time (token to service start)",
        baseline_value=38.0,
        target_value=25.0,
        target_operator="lte",
        unit="minutes",
        duration_days=14,
        eligibility_criteria=[],
        evaluation_dimensions=[],
        pilot_expectations="",
        evidence_requirements=[],
        tags=["citizen_services", "waiting_time", "service_delivery"],
    )
    db.add_all([challenge1, challenge2])
    db.flush()

    pravaah = Startup(
        name="Pravaah Health Systems",
        tagline="Queue-flow orchestration built for hospital outpatient departments",
        description=(
            "Pravaah builds registration-to-consultation queue orchestration "
            "for public hospitals: digital token flow, counter load balancing, "
            "and weekly operational reporting. Prior deployments at two "
            "secondary-care hospitals in Karnataka cut average waits from "
            "45 to 26 minutes."
        ),
        sector="Health technology",
        city="Bengaluru",
    )
    quetek = Startup(
        name="QueTek Solutions",
        tagline="Digital token and queue analytics for high-volume service counters",
        description=(
            "QueTek operates token and queue analytics for service counters "
            "in the private sector. Strong queuing model, but no published "
            "health-facility deployment and no data-handling agreement with "
            "a public hospital yet."
        ),
        sector="Queue analytics",
        city="Mysuru",
    )
    flowgrid = Startup(
        name="FlowGrid Labs",
        tagline="Footfall sensing and scheduling platform",
        description=(
            "FlowGrid provides sensor-based footfall sensing and staff "
            "scheduling for commercial venues. Applied for the health "
            "challenge but could not demonstrate health-sector deployment "
            "or submit the required data-safety documentation."
        ),
        sector="Workforce scheduling",
        city="Hubballi",
    )
    db.add_all([pravaah, quetek, flowgrid])
    db.flush()

    # --- Applications and eligibility screening ---------------------------
    app_pravaah = Application(
        challenge_id=challenge1.id,
        startup_id=pravaah.id,
        status=ApplicationStatus.SUBMITTED,
        proposal=(
            "Deploy the queue orchestration stack at two district hospital "
            "OPDs. Rebalance registration counters from live queue data and "
            "publish weekly registration-to-consultation aggregates through "
            "the PRAMAAN pilot interface."
        ),
        submitted_on=date(2026, 6, 3),
        eligible=True,
        screened_on=SCREENING_ON,
        eligibility_checks=_eligibility(
            True,
            True,
            "Prior deployments at two Karnataka secondary-care hospitals.",
            "Capability deck, data-safety note, and team credentials submitted.",
        ),
    )
    app_quetek = Application(
        challenge_id=challenge1.id,
        startup_id=quetek.id,
        status=ApplicationStatus.SUBMITTED,
        proposal=(
            "Bring token-based queuing and analytics to OPD registration. "
            "Proposes a 45-day ramp at two hospitals."
        ),
        submitted_on=date(2026, 6, 4),
        eligible=True,
        screened_on=SCREENING_ON,
        eligibility_checks=_eligibility(
            True,
            True,
            "Operates at service counters in the private sector; hospital deployment not yet demonstrated.",
            "Documentation submitted; references are non-hospital counters.",
        ),
    )
    app_flowgrid = Application(
        challenge_id=challenge1.id,
        startup_id=flowgrid.id,
        status=ApplicationStatus.INELIGIBLE,
        proposal=(
            "Sensor-based footfall sensing and staff scheduling for OPD "
            "registration areas."
        ),
        submitted_on=date(2026, 6, 5),
        eligible=False,
        screened_on=SCREENING_ON,
        eligibility_checks=_eligibility(
            False,
            False,
            "No health-sector deployment; proposed timeline of 45 days exceeds the published 30-day window.",
            "Data-safety documentation was not submitted at screening close.",
        ),
    )
    db.add_all([app_pravaah, app_quetek, app_flowgrid])
    db.flush()

    def _eval(app, evaluator, role, overall, dims, summary) -> None:
        db.add(
            Evaluation(
                application_id=app.id,
                evaluator_name=evaluator,
                evaluator_role=role,
                score=overall,
                dimensions=dims,
                summary=summary,
                evaluated_on=EVALUATED_ON,
            )
        )

    _eval(
        app_pravaah,
        "Dr. Meera Krishnan",
        "Public health systems specialist, evaluation panel",
        4.7,
        [
            {"dimension": "Problem Fit", "score": 5.0, "note": "Directly targets the registration-to-consultation bottleneck and understands OPD flow."},
            {"dimension": "Technical Capability", "score": 4.5, "note": "Mature queue orchestration stack with an API-based reporting path."},
            {"dimension": "Implementation Readiness", "score": 4.5, "note": "Team has run two similar hospital rollouts; 30-day plan is credible."},
            {"dimension": "Evidence of Capability", "score": 5.0, "note": "Reference sites show measured wait reduction from 45 to 26 minutes."},
            {"dimension": "Pilot Feasibility", "score": 4.5, "note": "Two-hospital scope fits team capacity; on-site support offered."},
            {"dimension": "Risk", "score": 4.5, "note": "Clear operational and data mitigations; rollback plan defined."},
        ],
        "Strongest overall fit. Prior public-hospital results give the panel "
        "confidence the pilot target is reachable in four weeks.",
    )
    _eval(
        app_pravaah,
        "R. Srinivasan",
        "Director, e-Governance cell, evaluation panel",
        4.5,
        [
            {"dimension": "Problem Fit", "score": 4.5, "note": "Good match; proposal focuses on the measured KPI."},
            {"dimension": "Technical Capability", "score": 4.5, "note": "Proven integration pattern with hospital systems."},
            {"dimension": "Implementation Readiness", "score": 4.5, "note": "Named on-site team and two-week deployment plan."},
            {"dimension": "Evidence of Capability", "score": 4.5, "note": "Verifiable reference hospitals with reported metrics."},
            {"dimension": "Pilot Feasibility", "score": 4.5, "note": "Scope achievable within four weeks."},
            {"dimension": "Risk", "score": 4.5, "note": "Risks identified with assigned mitigations."},
        ],
        "Strong technical readiness and credible evidence base.",
    )
    _eval(
        app_quetek,
        "Dr. Meera Krishnan",
        "Public health systems specialist, evaluation panel",
        3.8,
        [
            {"dimension": "Problem Fit", "score": 4.0, "note": "Relevant queuing model, generic to service counters."},
            {"dimension": "Technical Capability", "score": 4.0, "note": "Solid token platform; hospital integration unproven."},
            {"dimension": "Implementation Readiness", "score": 3.5, "note": "No health facility deployment; ramp plan is longer."},
            {"dimension": "Evidence of Capability", "score": 3.0, "note": "References are malls and offices, not hospitals."},
            {"dimension": "Pilot Feasibility", "score": 4.0, "note": "Feasible if hospital connectivity is resolved early."},
            {"dimension": "Risk", "score": 3.5, "note": "No existing data-handling agreement with public hospitals."},
        ],
        "Capable queuing vendor; evidence base is not health-specific.",
    )
    _eval(
        app_quetek,
        "R. Srinivasan",
        "Director, e-Governance cell, evaluation panel",
        3.6,
        [
            {"dimension": "Problem Fit", "score": 4.0, "note": "Addresses wait reduction generally."},
            {"dimension": "Technical Capability", "score": 4.0, "note": "Analytics are strong; OPD integration unproven."},
            {"dimension": "Implementation Readiness", "score": 3.5, "note": "Longer ramp and fewer named hospital resources."},
            {"dimension": "Evidence of Capability", "score": 3.0, "note": "No public-sector health references."},
            {"dimension": "Pilot Feasibility", "score": 3.5, "note": "Dependent on early connectivity approval."},
            {"dimension": "Risk", "score": 3.5, "note": "Integration and data-handling unknowns."},
        ],
        "Mid-ranking proposal; gap in health-sector evidence.",
    )
    db.commit()

    return {
        "khfw": khfw,
        "e_governance": e_governance,
        "challenge1": challenge1,
        "challenge2": challenge2,
        "pravaah": pravaah,
        "quetek": quetek,
        "flowgrid": flowgrid,
        "app_pravaah": app_pravaah,
    }


def _stage_pilot(db: Session, refs: dict, milestone: str) -> None:
    """Replay the workflow services up to the requested milestone."""
    order = MILESTONES.index(milestone)

    pilot = None
    if order >= MILESTONES.index("PROTOCOL_DRAFT"):
        pilot = workflow.create_pilot(
            db,
            challenge=refs["challenge1"],
            startup=refs["pravaah"],
            scope=(
                "Pravaah queue orchestration at two district hospital OPDs "
                "(Bengaluru and Tumakuru), four weekly measurement periods, "
                "28-day window."
            ),
            at=SELECTION_AT,
        )
        workflow.ensure_draft(db, pilot)
    if order >= MILESTONES.index("SEALED"):
        workflow.approve_protocol(db, pilot, at=APPROVE_AT)
        workflow.seal_protocol(db, pilot, at=SEAL_AT)
    if order >= MILESTONES.index("RUNNING"):
        workflow.start_pilot(db, pilot, at=START_AT)
    if order >= MILESTONES.index("MEASURED"):
        for _ in range(4):
            demo_service.next_demo_week(db, pilot, at=VERDICT_AT - timedelta(days=2))
    if order >= MILESTONES.index("VALIDATED"):
        validation = workflow.request_validation(
            db, pilot, "Dr. Anita Rao (Independent Evaluator)",
            actor="Independent evaluation unit", at=VALIDATE_AT - timedelta(days=1),
        )
        workflow.approve_validation(
            db, pilot, validation,
            notes=(
                "Independent cross-check of weekly sampling logs against "
                "counter registers at both pilot sites. Reported aggregates "
                "match source records; evidence integrity verified. Approved."
            ),
            at=VALIDATE_AT,
        )
    if order >= MILESTONES.index("VERDICTED"):
        workflow.issue_verdict(
            db, pilot,
            issued_by="Health and Family Welfare Department, Government of Karnataka",
            at=VERDICT_AT,
        )


def seed_demo(db: Session, milestone: str) -> None:
    """Seed the full demo dataset up to ``milestone`` (assumes empty DB)."""
    if milestone not in MILESTONES:
        raise HTTPException(status_code=422, detail=f"Unknown milestone: {milestone}")
    refs = _seed_reference_data(db)
    _stage_pilot(db, refs, milestone)


def reset_demo(db: Session, milestone: str) -> dict:
    """Wipe demo data (including local evidence artifacts) and reseed to the
    requested milestone. Keeps the schema intact."""
    if milestone not in MILESTONES:
        raise HTTPException(status_code=422, detail=f"Unknown milestone: {milestone}")

    from app.storage import delete_artifact

    artifacts = db.execute(select(Evidence)).scalars()
    for evidence in artifacts:
        delete_artifact(evidence.storage_backend, evidence.stored_name)

    for model in [
        ReuseDecision,
        Vpr,
        ScaleDecision,
        Verdict,
        Validation,
        EvidenceCheck,
        Evidence,
        AuditEvent,
        Measurement,
        PilotRisk,
        PilotMilestone,
        Protocol,
        Pilot,
        Evaluation,
        Application,
        Challenge,
        Startup,
        Department,
    ]:
        db.execute(delete(model))
    db.commit()
    seed_demo(db, milestone)
    return {"milestone": milestone, "seeded": True}
