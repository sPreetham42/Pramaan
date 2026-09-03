"""The PRAMAAN trust workflow, enforced server-side.

One owner per piece of state: the Pilot row is the journey; the Protocol is
versioned and becomes immutable at seal; Milestone and Payment state are
derived by this service from real workflow events; the Verdict is computed
deterministically from the SEALED protocol and stored measurements, never
hardcoded.
"""

import json
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    ApplicationStatus,
    Challenge,
    ChallengeStatus,
    Evaluation,
    Measurement,
    MilestoneStatus,
    PaymentStatus,
    Pilot,
    PilotMilestone,
    PilotRisk,
    PilotStatus,
    Protocol,
    ProtocolStatus,
    ScaleDecision,
    ScaleOutcome,
    Startup,
    Validation,
    ValidationStatus,
    Verdict,
    VerdictOutcome,
    Vpr,
    VprStatus,
)
from app.services.audit import append_audit

GOV_ACTOR = "Department evaluation cell"

OPERATOR_TEXT = {"lte": "<=", "gte": ">=", "lt": "<", "gt": ">"}
ALLOWED_OPERATORS = set(OPERATOR_TEXT)


def _now(at: datetime | None) -> datetime:
    return at or datetime.now(timezone.utc)


def _ops(op: str):
    return {"lte": lambda o, t: o <= t, "lt": lambda o, t: o < t,
            "gte": lambda o, t: o >= t, "gt": lambda o, t: o > t}[op]


def conflict(message: str) -> HTTPException:
    return HTTPException(status_code=409, detail=message)


# ---------------------------------------------------------------------------
# Small lookup helpers


def sealed_protocol(db: Session, pilot: Pilot) -> Optional[Protocol]:
    return db.execute(
        select(Protocol)
        .where(Protocol.pilot_id == pilot.id, Protocol.status == ProtocolStatus.SEALED)
        .order_by(Protocol.version.desc())
        .limit(1)
    ).scalar_one_or_none()


def current_sealed(pilot: Pilot) -> Optional[Protocol]:
    """Highest-version SEALED protocol of a pilot (relationship-based, no
    extra query)."""
    sealed = [p for p in pilot.protocols if p.status == ProtocolStatus.SEALED]
    if not sealed:
        return None
    return max(sealed, key=lambda p: p.version)


def draft_protocol(db: Session, pilot: Pilot) -> Optional[Protocol]:
    return db.execute(
        select(Protocol)
        .where(Protocol.pilot_id == pilot.id, Protocol.status == ProtocolStatus.DRAFT)
        .order_by(Protocol.version.desc())
        .limit(1)
    ).scalar_one_or_none()


def approved_protocol(db: Session, pilot: Pilot) -> Optional[Protocol]:
    return db.execute(
        select(Protocol)
        .where(
            Protocol.pilot_id == pilot.id,
            Protocol.status == ProtocolStatus.APPROVED,
        )
        .order_by(Protocol.version.desc())
        .limit(1)
    ).scalar_one_or_none()


def protocol_content_hash(protocol: Protocol) -> str:
    """Canonical SHA-256 over the criteria snapshot that gets sealed."""
    import hashlib

    snapshot = json.dumps(
        {
            "metric": protocol.metric,
            "target_operator": protocol.target_operator,
            "target_value": float(protocol.target_value),
            "unit": protocol.unit,
            "baseline_value": float(protocol.baseline_value),
            "duration_days": protocol.duration_days,
            "sample_interval": protocol.sample_interval,
            "measurement_method": protocol.measurement_method,
            "success_rule": protocol.success_rule,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return hashlib.sha256(snapshot.encode("utf-8")).hexdigest()


def build_success_rule(protocol: Protocol) -> str:
    sym = OPERATOR_TEXT.get(protocol.target_operator, protocol.target_operator)
    return (
        f"The pilot succeeds when the {protocol.metric.lower()} is {sym} "
        f"{float(protocol.target_value):g} {protocol.unit} across the measured "
        f"{protocol.sample_interval} periods."
    )


# ---------------------------------------------------------------------------
# Pilot creation (competitive selection) and default pilot plan


DEFAULT_MILESTONES = [
    ("Setup and baseline", "Deployment at pilot sites, go-live, and baseline measurement of the KPI before the intervention ramps up.", 100000),
    ("Initial measurement period", "Weekly KPI samples recorded during the first half of the pilot window.", 200000),
    ("Target performance period", "Weekly KPI samples recorded during the second half of the pilot window.", 300000),
    ("Final evaluation and reporting", "Close-out analysis, complete evidence package, and independent validation review.", 400000),
]

DEFAULT_RISKS = [
    ("Operational disruption", "Daily OPD flow could be disturbed by new queue software at live counters.", "Phased rollout per counter group; rollback plan; pilot runs in parallel with manual fallback registration.", "MITIGATED"),
    ("Data privacy", "Patient registration timestamps are personal data under DPDP rules.", "Sampling extracts are de-identified; only aggregate wait times leave the hospital; access logged.", "MITIGATED"),
    ("Cybersecurity", "A third-party system connects to hospital network services.", "Sandboxed environment, no production data writes, vendor audit, and connectivity only to the reporting API.", "MONITORED"),
    ("Service continuity", "A software fault must never block a patient from being registered.", "Manual registration remains available at all times; uptime and fallback exercised weekly.", "MITIGATED"),
]


def _add_default_plan(db: Session, pilot: Pilot) -> None:
    for i, (title, description, amount) in enumerate(DEFAULT_MILESTONES, start=1):
        db.add(
            PilotMilestone(
                pilot_id=pilot.id,
                seq=i,
                title=title,
                description=description,
                amount=amount,
            )
        )
    for category, description, mitigation, status in DEFAULT_RISKS:
        db.add(
            PilotRisk(
                pilot_id=pilot.id,
                category=category,
                description=description,
                mitigation=mitigation,
                status=status,
            )
        )


def create_pilot(
    db: Session,
    challenge: Challenge,
    startup: Startup,
    actor: str = GOV_ACTOR,
    scope: str = "",
    at: datetime | None = None,
) -> Pilot:
    """Select the winning startup: requires an eligible, evaluated
    application; creates the pilot and its milestone/risk plan."""
    if db.execute(
        select(Pilot).where(Pilot.challenge_id == challenge.id).limit(1)
    ).scalar_one_or_none():
        raise conflict("A pilot has already been selected for this challenge.")
    application = db.execute(
        select(Application).where(
            Application.challenge_id == challenge.id,
            Application.startup_id == startup.id,
        )
    ).scalar_one_or_none()
    if application is None:
        raise conflict("The startup has not applied to this challenge.")
    if not application.eligible:
        raise conflict("The startup did not pass eligibility screening.")
    has_evaluation = db.execute(
        select(Evaluation).where(Evaluation.application_id == application.id).limit(1)
    ).scalar_one_or_none()
    if has_evaluation is None:
        raise conflict("Expert evaluation is required before a startup can be selected.")

    pilot = Pilot(
        challenge_id=challenge.id,
        startup_id=startup.id,
        status=PilotStatus.SELECTED,
        scope=scope or challenge.pilot_expectations,
    )
    db.add(pilot)
    db.flush()
    _add_default_plan(db, pilot)

    application.status = ApplicationStatus.SELECTED
    other = db.execute(
        select(Application).where(
            Application.challenge_id == challenge.id,
            Application.id != application.id,
        )
    ).scalars()
    for app_row in other:
        if app_row.status == ApplicationStatus.SUBMITTED:
            app_row.status = ApplicationStatus.NOT_SELECTED
    challenge.status = ChallengeStatus.IN_PILOT

    append_audit(
        db, pilot, "state",
        f"Pilot selected for {startup.name} after competitive evaluation.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(pilot)
    return pilot


# ---------------------------------------------------------------------------
# Protocol lifecycle


def protocol_draft_defaults(challenge: Challenge) -> dict:
    return {
        "metric": challenge.kpi_metric,
        "target_operator": challenge.target_operator,
        "target_value": float(challenge.target_value),
        "unit": challenge.unit,
        "duration_days": challenge.duration_days,
        "sample_interval": "weekly",
        "measurement_method": (
            "Pilot sites compute the average registration-to-consultation wait "
            "time each week from timestamped registration and consultation "
            "records, and submit the weekly sample through the pilot reporting "
            "interface."
        ),
    }


def ensure_draft(db: Session, pilot: Pilot) -> Protocol:
    """Create the first draft protocol from the challenge if none exists."""
    existing = draft_protocol(db, pilot)
    if existing is not None:
        return existing
    if sealed_protocol(db, pilot) is not None:
        raise conflict("Sealed criteria cannot be re-drafted; create a new version.")
    challenge = pilot.challenge
    data = protocol_draft_defaults(challenge)
    protocol = Protocol(
        pilot_id=pilot.id,
        version=1,
        status=ProtocolStatus.DRAFT,
        metric=data["metric"],
        target_operator=data["target_operator"],
        target_value=data["target_value"],
        unit=data["unit"],
        baseline_value=float(challenge.baseline_value),
        duration_days=data["duration_days"],
        sample_interval=data["sample_interval"],
        measurement_method=data["measurement_method"],
    )
    protocol.success_rule = build_success_rule(protocol)
    db.add(protocol)
    db.commit()
    db.refresh(protocol)
    return protocol


def save_protocol_draft(
    db: Session, pilot: Pilot, data: dict, actor: str = GOV_ACTOR
) -> Protocol:
    """Update the draft criteria. Only possible while the pilot is still in
    the SELECTED stage and the criteria are not sealed."""
    if pilot.status != PilotStatus.SELECTED:
        raise conflict(
            "Evaluation criteria are locked at this stage; changing criteria "
            "requires a new protocol version."
        )
    latest = db.execute(
        select(Protocol)
        .where(Protocol.pilot_id == pilot.id)
        .order_by(Protocol.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest is not None and latest.status != ProtocolStatus.DRAFT:
        raise conflict(
            "The current criteria are approved or sealed and cannot be modified. "
            "Any new criteria requires a new protocol version."
        )
    protocol = draft_protocol(db, pilot)
    if protocol is None:
        protocol = ensure_draft(db, pilot)
    operator = data.get("target_operator", protocol.target_operator)
    if operator not in ALLOWED_OPERATORS:
        raise HTTPException(status_code=422, detail="Unsupported comparison operator.")
    target = float(data.get("target_value", protocol.target_value))
    duration = int(data.get("duration_days", protocol.duration_days))
    if target <= 0 or duration <= 0:
        raise HTTPException(status_code=422, detail="Target and duration must be positive.")

    protocol.metric = data.get("metric", protocol.metric)
    protocol.target_operator = operator
    protocol.target_value = target
    protocol.unit = data.get("unit", protocol.unit)
    protocol.duration_days = duration
    protocol.sample_interval = data.get("sample_interval", protocol.sample_interval)
    protocol.measurement_method = data.get("measurement_method", protocol.measurement_method)
    if data.get("success_rule"):
        protocol.success_rule = data["success_rule"]
    else:
        protocol.success_rule = build_success_rule(protocol)
    db.commit()
    db.refresh(protocol)
    return protocol


def approve_protocol(db: Session, pilot: Pilot, actor: str = GOV_ACTOR, at: datetime | None = None) -> Protocol:
    if pilot.status != PilotStatus.SELECTED:
        raise conflict("Criteria cannot be approved at the current pilot stage.")
    protocol = draft_protocol(db, pilot)
    if protocol is None:
        raise conflict("Define the evaluation criteria before approving them.")
    protocol.status = ProtocolStatus.APPROVED
    append_audit(
        db, pilot, "protocol",
        f"Evaluation protocol v{protocol.version} approved by the department for sealing.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(protocol)
    return protocol


def seal_protocol(db: Session, pilot: Pilot, actor: str = GOV_ACTOR, at: datetime | None = None) -> Protocol:
    """Commit the approved criteria before any outcome is known."""
    if pilot.status != PilotStatus.SELECTED:
        raise conflict("Criteria can only be sealed before the pilot starts.")
    protocol = approved_protocol(db, pilot)
    if protocol is None:
        raise conflict("Approve the evaluation protocol before sealing it.")
    protocol.status = ProtocolStatus.SEALED
    protocol.content_hash = protocol_content_hash(protocol)
    protocol.sealed_by = actor
    protocol.sealed_at = _now(at)
    pilot.status = PilotStatus.SEALED
    append_audit(
        db, pilot, "protocol",
        f"Evaluation criteria locked (protocol v{protocol.version}, "
        f"SHA-256 {protocol.content_hash[:12]}) before the pilot started.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(protocol)
    return protocol


def new_protocol_version(db: Session, pilot: Pilot, actor: str = GOV_ACTOR, at: datetime | None = None) -> Protocol:
    """Amendment path: sealing freezes a version; new criteria means a new
    version, never mutation of a sealed one. Only allowed before the run."""
    if pilot.status not in (PilotStatus.SELECTED, PilotStatus.SEALED):
        raise conflict("Criteria can only be re-versioned before the pilot starts.")
    latest = db.execute(
        select(Protocol)
        .where(Protocol.pilot_id == pilot.id)
        .order_by(Protocol.version.desc())
        .limit(1)
    ).scalar_one_or_none()
    if latest is None:
        raise conflict("No protocol exists yet.")
    template = sealed_protocol(db, pilot) or latest
    if template.status == ProtocolStatus.DRAFT:
        raise conflict("The current protocol is still a draft; edit it directly instead.")
    new_version = Protocol(
        pilot_id=pilot.id,
        version=latest.version + 1,
        status=ProtocolStatus.DRAFT,
        metric=template.metric,
        target_operator=template.target_operator,
        target_value=template.target_value,
        unit=template.unit,
        baseline_value=template.baseline_value,
        duration_days=template.duration_days,
        sample_interval=template.sample_interval,
        measurement_method=template.measurement_method,
        success_rule=template.success_rule,
    )
    db.add(new_version)
    if pilot.status == PilotStatus.SEALED:
        pilot.status = PilotStatus.SELECTED
    append_audit(
        db, pilot, "protocol",
        f"New protocol version v{new_version.version} drafted; "
        f"sealed v{latest.version} is preserved unchanged.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(new_version)
    return new_version


# ---------------------------------------------------------------------------
# Pilot execution


def start_pilot(db: Session, pilot: Pilot, actor: str = GOV_ACTOR, at: datetime | None = None) -> Pilot:
    if pilot.status != PilotStatus.SEALED:
        raise conflict("Seal the evaluation protocol before starting the pilot.")
    if sealed_protocol(db, pilot) is None:
        raise conflict("Seal the evaluation protocol before starting the pilot.")
    pilot.status = PilotStatus.RUNNING
    pilot.started_at = _now(at)
    _complete_milestone(db, pilot, 1, at=_now(at))
    append_audit(
        db, pilot, "state",
        "Pilot started at the pilot sites. Milestone 1 (setup and baseline) completed.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(pilot)
    return pilot


def add_measurement(
    db: Session,
    pilot: Pilot,
    *,
    label: str,
    value: float,
    source: str,
    recorded_on: date,
    unit: str | None = None,
    actor: str = GOV_ACTOR,
    at: datetime | None = None,
) -> Measurement:
    if pilot.status != PilotStatus.RUNNING:
        raise conflict("Measurements can only be recorded while the pilot is running.")
    protocol = sealed_protocol(db, pilot)
    if protocol is None:
        raise conflict("No sealed protocol exists for this pilot.")
    if value < 0:
        raise HTTPException(status_code=422, detail="Measurement value cannot be negative.")
    exists = db.execute(
        select(Measurement).where(
            Measurement.pilot_id == pilot.id, Measurement.label == label
        )
    ).scalar_one_or_none()
    if exists is not None:
        raise conflict(f"A measurement for {label} is already recorded.")
    measurement = Measurement(
        pilot_id=pilot.id,
        protocol_id=protocol.id,
        label=label,
        value=value,
        unit=unit or protocol.unit,
        source=source,
        recorded_on=recorded_on,
    )
    db.add(measurement)
    db.flush()
    count = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .where(Measurement.pilot_id == pilot.id)
    )
    if count >= 2:
        _complete_milestone(db, pilot, 2, at=_now(at))
    append_audit(
        db, pilot, "measurement",
        f"Measurement recorded: {label} {value:g} {measurement.unit} ({source}).",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(measurement)
    return measurement


def close_measurements(db: Session, pilot: Pilot, actor: str = GOV_ACTOR, at: datetime | None = None) -> Pilot:
    if pilot.status != PilotStatus.RUNNING:
        raise conflict("Only a running pilot can close its measurement window.")
    count = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .where(Measurement.pilot_id == pilot.id)
    )
    if not count:
        raise conflict("Close the measurement window only after at least one measurement.")
    pilot.status = PilotStatus.COMPLETED
    pilot.completed_at = _now(at)
    if count >= 3:
        _complete_milestone(db, pilot, 3, at=_now(at))
    append_audit(
        db, pilot, "state",
        "Measurement window closed. The pilot is ready for evidence verification and independent validation.",
        actor=actor, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(pilot)
    return pilot


def compute_result(db: Session, pilot: Pilot) -> dict:
    """Deterministic, side-effect-free calculation from stored data."""
    protocol = sealed_protocol(db, pilot)
    if protocol is None:
        raise conflict("No sealed protocol exists for this pilot.")
    samples = db.execute(
        select(Measurement)
        .where(Measurement.pilot_id == pilot.id)
        .order_by(Measurement.id)
    ).scalars().all()
    if not samples:
        raise conflict("No measurements recorded yet.")
    observed = sum(float(m.value) for m in samples) / len(samples)
    met = _ops(protocol.target_operator)(observed, float(protocol.target_value))
    return {
        "protocol_version": protocol.version,
        "metric": protocol.metric,
        "target_operator": protocol.target_operator,
        "target": float(protocol.target_value),
        "unit": protocol.unit,
        "sample_count": len(samples),
        "observed_value": round(observed, 2),
        "met": bool(met),
        "method": (
            f"Mean of {len(samples)} weekly samples; target "
            f"{OPERATOR_TEXT[protocol.target_operator]} {float(protocol.target_value):g} {protocol.unit}."
        ),
    }


def _complete_milestone(
    db: Session, pilot: Pilot, seq: int, at: datetime | None = None
) -> None:
    milestone = next((m for m in pilot.milestones if m.seq == seq), None)
    if milestone is None or milestone.status == MilestoneStatus.COMPLETED:
        return
    milestone.status = MilestoneStatus.COMPLETED
    milestone.payment_status = PaymentStatus.PAYMENT_ELIGIBLE
    milestone.note = f"Completed at {_now(at).strftime('%d %b %Y, %H:%M')} UTC."
    append_audit(
        db, pilot, "state",
        f"Milestone {milestone.seq}: {milestone.title} completed. Payment eligible.",
        occurred_at=_now(at),
    )


def _release_completed_milestones(db: Session, pilot: Pilot, at: datetime | None = None) -> None:
    for milestone in pilot.milestones:
        if (
            milestone.status == MilestoneStatus.COMPLETED
            and milestone.payment_status == PaymentStatus.PAYMENT_ELIGIBLE
        ):
            milestone.payment_status = PaymentStatus.RELEASED
            milestone.note = (
                f"Released on validation of {milestone.title}. "
                f"{_now(at).strftime('%d %b %Y, %H:%M')} UTC."
            )
            append_audit(
                db, pilot, "state",
                f"Milestone payment released for milestone {milestone.seq}: {milestone.title}.",
                occurred_at=_now(at),
            )


# ---------------------------------------------------------------------------
# Independent validation


def request_validation(
    db: Session,
    pilot: Pilot,
    validator_name: str,
    actor: str | None = None,
    at: datetime | None = None,
) -> Validation:
    if pilot.status != PilotStatus.COMPLETED:
        raise conflict("Independent validation begins after the measurement window closes.")
    existing_approved = db.execute(
        select(Validation).where(
            Validation.pilot_id == pilot.id,
            Validation.status == ValidationStatus.APPROVED,
        )
    ).scalar_one_or_none()
    if existing_approved is not None:
        raise conflict("This pilot has already been validated.")
    validation = db.execute(
        select(Validation).where(
            Validation.pilot_id == pilot.id,
            Validation.status == ValidationStatus.PENDING,
        )
    ).scalar_one_or_none()
    if validation is None:
        validation = Validation(pilot_id=pilot.id, validator_name=validator_name)
        db.add(validation)
        db.flush()
    validation.validator_name = validator_name
    append_audit(
        db, pilot, "validation",
        f"Independent validation opened for review by {validator_name}.",
        actor=actor or validator_name, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(validation)
    return validation


def approve_validation(
    db: Session,
    pilot: Pilot,
    validation: Validation,
    notes: str,
    at: datetime | None = None,
) -> Validation:
    if pilot.status != PilotStatus.COMPLETED:
        raise conflict("A completed pilot is required for validation.")
    if validation.status != ValidationStatus.PENDING:
        raise conflict("Validation is not pending.")
    protocol = sealed_protocol(db, pilot)
    measurement_count = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .where(Measurement.pilot_id == pilot.id)
    )
    if protocol is None or not measurement_count:
        raise conflict("Sealed criteria and measurements are required before validation.")
    if not all_evidence_verified(db, pilot):
        raise conflict(
            "Evidence integrity is not confirmed for every artifact. "
            "Verify the evidence before signing off."
        )
    validation.status = ValidationStatus.APPROVED
    validation.notes = notes
    validation.decided_at = _now(at)
    _release_completed_milestones(db, pilot, at=_now(at))
    append_audit(
        db, pilot, "validation",
        f"Independent validator {validation.validator_name} approved the pilot result and evidence.",
        actor=validation.validator_name, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(validation)
    return validation


def all_evidence_verified(db: Session, pilot: Pilot) -> bool:
    """True when every evidence artifact has a latest check that passed.
    Reads the latest check per artifact from the database so it never trusts
    stale in-session relationship caches."""
    from app.models import Evidence, EvidenceCheck

    rows = db.execute(
        select(Evidence).where(Evidence.pilot_id == pilot.id)
    ).scalars().all()
    if not rows:
        return False
    for evidence in rows:
        latest = db.execute(
            select(EvidenceCheck)
            .where(EvidenceCheck.evidence_id == evidence.id)
            .order_by(EvidenceCheck.id.desc())
            .limit(1)
        ).scalar_one_or_none()
        if latest is None or not latest.ok:
            return False
    return True


# ---------------------------------------------------------------------------
# Verdict, scale recommendation, Verified Pilot Record


def _vpr_reference(department_short: str, challenge_id: int, year: int) -> str:
    return f"VPR/{year}/{department_short}-{challenge_id:03d}"


def issue_verdict(
    db: Session,
    pilot: Pilot,
    issued_by: str,
    at: datetime | None = None,
) -> dict:
    """Compute the outcome from stored data and freeze it. Refuses to run
    twice and refuses to run before validation and verified evidence."""
    if pilot.status != PilotStatus.COMPLETED:
        raise conflict("Issue the verdict only after the pilot is completed.")
    if pilot.verdict is not None:
        raise conflict("A final verdict has already been issued for this pilot.")
    protocol = sealed_protocol(db, pilot)
    measurement_count = db.scalar(
        select(func.count())
        .select_from(Measurement)
        .where(Measurement.pilot_id == pilot.id)
    )
    if protocol is None or not measurement_count:
        raise conflict("Sealed criteria and measurements are required for a verdict.")
    validation = db.execute(
        select(Validation).where(
            Validation.pilot_id == pilot.id,
            Validation.status == ValidationStatus.APPROVED,
        )
    ).scalar_one_or_none()
    if validation is None:
        raise conflict(
            "Independent validation must be approved before a verdict can be issued."
        )
    if not all_evidence_verified(db, pilot):
        raise conflict(
            "Evidence integrity is not confirmed for every artifact. "
            "The verdict is withheld until verification passes."
        )

    result = compute_result(db, pilot)
    observed = result["observed_value"]
    met = result["met"]
    outcome = VerdictOutcome.MET if met else VerdictOutcome.NOT_MET

    verdict = Verdict(
        pilot_id=pilot.id,
        protocol_id=protocol.id,
        protocol_version=protocol.version,
        metric=protocol.metric,
        target_operator=protocol.target_operator,
        target_value=float(protocol.target_value),
        unit=protocol.unit,
        observed_value=observed,
        sample_count=result["sample_count"],
        method=result["method"],
        outcome=outcome,
        issued_by=issued_by,
        issued_at=_now(at),
    )
    db.add(verdict)
    db.flush()

    pilot.status = PilotStatus.VERDICTED
    _complete_milestone(db, pilot, 4, at=_now(at))
    for milestone in pilot.milestones:
        if milestone.status == MilestoneStatus.COMPLETED:
            milestone.payment_status = PaymentStatus.RELEASED
    pilot.challenge.status = ChallengeStatus.COMPLETED

    outcome_text = {
        VerdictOutcome.MET: (
            f"MET: the average {protocol.metric} reached {observed:g} {protocol.unit}, "
            f"within the sealed target."
        ),
        VerdictOutcome.NOT_MET: (
            f"NOT MET: the average {protocol.metric} was {observed:g} {protocol.unit}, "
            f"outside the sealed target."
        ),
    }[outcome]
    append_audit(
        db, pilot, "verdict",
        f"Deterministic verdict issued: {outcome.value} "
        f"(observed {observed:g}, target {OPERATOR_TEXT[protocol.target_operator]} "
        f"{float(protocol.target_value):g} {protocol.unit}, protocol v{protocol.version}).",
        actor=issued_by, occurred_at=_now(at),
    )

    basis = (
        f"Pilot outcome {outcome.value} ({observed:g} {protocol.unit} vs target "
        f"{OPERATOR_TEXT[protocol.target_operator]} {float(protocol.target_value):g}), "
        "evidence integrity verified, independent validation approved. "
        "This is a recommendation to the department; procurement authority "
        "remains with the government."
    )
    scale_outcome = (
        ScaleOutcome.SCALE_UP_RECOMMENDED
        if met
        else ScaleOutcome.NOT_RECOMMENDED
    )
    scale = ScaleDecision(
        verdict_id=verdict.id,
        outcome=scale_outcome,
        basis=basis,
        decided_by=issued_by,
        decided_at=_now(at),
    )
    db.add(scale)
    append_audit(
        db, pilot, "state",
        f"Scale recommendation recorded: {scale_outcome.value}.",
        actor=issued_by, occurred_at=_now(at),
    )

    vpr = Vpr(
        verdict_id=verdict.id,
        reference=_vpr_reference(
            pilot.challenge.department.short_name, pilot.challenge.id, _now(at).year
        ),
        status=VprStatus.ACTIVE,
        issued_at=_now(at),
    )
    vpr.summary = (
        f"{pilot.challenge.department.name} tested {pilot.startup.name} against a sealed "
        f"evaluation protocol for {protocol.metric} "
        f"(target {OPERATOR_TEXT[protocol.target_operator]} {float(protocol.target_value):g} "
        f"{protocol.unit}). Observed average {observed:g} {protocol.unit} over "
        f"{result['sample_count']} weekly samples. Verdict: {outcome.value}. "
        "Evidence verified, validation approved."
    )
    db.add(vpr)
    append_audit(
        db, pilot, "state",
        f"Verified Pilot Record {vpr.reference} issued.",
        actor=issued_by, occurred_at=_now(at),
    )
    db.commit()
    db.refresh(verdict)
    db.refresh(vpr)
    return {"verdict_id": verdict.id, "vpr_id": vpr.id}
