"""Proof reuse: a second department discovers verified pilot records for
similar challenges and decides to reuse the verified evidence or run a
confirmatory pilot. PRAMAAN supplies evidence for the department decision;
it never awards procurement itself.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Challenge,
    ChallengeStatus,
    Pilot,
    PilotStatus,
    Protocol,
    ProtocolStatus,
    ReuseAction,
    ReuseDecision,
    Vpr,
    VprStatus,
)
from app.services.audit import append_audit
from app.services.workflow import DEFAULT_MILESTONES, DEFAULT_RISKS, build_success_rule
from app.services.workflow import PilotMilestone, PilotRisk


def _now(at: datetime | None) -> datetime:
    return at or datetime.now(timezone.utc)


def discovery(db: Session, challenge: Challenge) -> list[dict]:
    """Verified records from other departments whose challenge shares
    criteria tags with this challenge."""
    items: list[dict] = []
    vprs = db.execute(
        select(Vpr).where(Vpr.status == VprStatus.ACTIVE)
    ).scalars()
    for vpr in vprs:
        verdict = vpr.verdict
        if verdict is None:
            continue
        source_pilot = verdict.pilot
        source_challenge = source_pilot.challenge
        if source_challenge.department_id == challenge.department_id:
            continue
        shared = sorted(
            set(source_challenge.tags or []) & set(challenge.tags or [])
        )
        if not shared:
            continue
        items.append(
            {
                "vpr_id": vpr.id,
                "reference": vpr.reference,
                "issued_at": vpr.issued_at,
                "source_department": source_challenge.department.name,
                "source_challenge": source_challenge.title,
                "startup_id": source_pilot.startup_id,
                "startup": source_pilot.startup.name,
                "metric": verdict.metric,
                "target_operator": verdict.target_operator,
                "target_value": float(verdict.target_value),
                "unit": verdict.unit,
                "observed_value": float(verdict.observed_value),
                "outcome": verdict.outcome.value,
                "shared_tags": shared,
                "evidence_count": len(source_pilot.evidence),
                "evidence_verified": all(
                    e.checks and e.checks[-1].ok for e in source_pilot.evidence
                ),
                "validated_by": next(
                    (
                        v.validator_name
                        for v in source_pilot.validations
                        if v.status.value == "APPROVED"
                    ),
                    None,
                ),
            }
        )
    items.sort(key=lambda item: len(item["shared_tags"]), reverse=True)
    return items


def record_reuse(
    db: Session,
    challenge: Challenge,
    vpr: Vpr,
    action: ReuseAction,
    rationale: str,
    decided_by: str,
    at: datetime | None = None,
) -> ReuseDecision:
    if challenge.status != ChallengeStatus.OPEN:
        raise HTTPException(
            status_code=409, detail="This challenge is no longer open to a reuse decision."
        )
    existing = db.execute(
        select(ReuseDecision).where(ReuseDecision.challenge_id == challenge.id)
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="A reuse decision has already been recorded for this challenge.",
        )
    if vpr.status != VprStatus.ACTIVE or vpr.verdict is None:
        raise HTTPException(status_code=409, detail="The referenced record is not active.")

    confirmatory_pilot: Optional[Pilot] = None
    if action == ReuseAction.CONFIRMATORY_PILOT:
        source_verdict = vpr.verdict
        source_pilot = source_verdict.pilot
        source_protocol = db.execute(
            select(Protocol).where(
                Protocol.id == source_verdict.protocol_id,
                Protocol.status == ProtocolStatus.SEALED,
            )
        ).scalar_one_or_none()
        confirmatory_pilot = Pilot(
            challenge_id=challenge.id,
            startup_id=source_pilot.startup_id,
            status=PilotStatus.SELECTED,
            scope=(
                f"Confirmatory re-measurement of {source_verdict.metric} at "
                f"{challenge.department.short_name} service locations over "
                "two weeks, against criteria inherited from a verified pilot "
                "record."
            ),
        )
        db.add(confirmatory_pilot)
        db.flush()
        for i, (title, description, amount) in enumerate(DEFAULT_MILESTONES, start=1):
            db.add(
                PilotMilestone(
                    pilot_id=confirmatory_pilot.id,
                    seq=i,
                    title=title,
                    description=description,
                    amount=amount,
                )
            )
        for category, description, mitigation, status in DEFAULT_RISKS:
            db.add(
                PilotRisk(
                    pilot_id=confirmatory_pilot.id,
                    category=category,
                    description=description,
                    mitigation=mitigation,
                    status=status,
                )
            )
        duration_days = min(14, source_protocol.duration_days if source_protocol else 14)
        protocol = Protocol(
            pilot_id=confirmatory_pilot.id,
            version=1,
            status=ProtocolStatus.DRAFT,
            metric=source_verdict.metric,
            target_operator=source_verdict.target_operator,
            target_value=float(source_verdict.target_value),
            unit=source_verdict.unit,
            baseline_value=float(challenge.baseline_value),
            duration_days=duration_days,
            sample_interval="weekly",
            measurement_method=(
                f"Re-measures {source_verdict.metric} at the challenge site. "
                f"Criteria inherited from {vpr.reference}; results are compared "
                "against the same sealed target."
            ),
        )
        protocol.success_rule = build_success_rule(protocol)
        db.add(protocol)
        challenge.status = ChallengeStatus.IN_PILOT
        append_audit(
            db, confirmatory_pilot, "state",
            f"Confirmatory pilot created under {challenge.title}; criteria inherited "
            f"from verified record {vpr.reference}.",
            actor=decided_by, occurred_at=_now(at),
        )
        db.flush()
    else:
        challenge.status = ChallengeStatus.COMPLETED

    decision = ReuseDecision(
        challenge_id=challenge.id,
        vpr_id=vpr.id,
        action=action,
        rationale=rationale,
        decided_by=decided_by,
        confirmatory_pilot_id=confirmatory_pilot.id if confirmatory_pilot else None,
        decided_at=_now(at),
    )
    db.add(decision)
    db.commit()
    db.refresh(decision)
    return decision
