"""Serializers: one module that turns model graphs into the nested response
shapes the frontend renders. GET endpoints use only these read paths and
never mutate state."""

from datetime import date, datetime
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Application,
    Challenge,
    Department,
    Evidence,
    Pilot,
    ReuseDecision,
    Startup,
    Vpr,
)
from app.services import reuse as reuse_service
from app.services import workflow


def _iso(value: datetime | date | None) -> Optional[str]:
    return value.isoformat() if value is not None else None


def _fmt_money(value) -> str:
    return f"{float(value):,.0f}"


def department_out(department: Department) -> dict:
    return {
        "id": department.id,
        "name": department.name,
        "short_name": department.short_name,
        "description": department.description,
    }


def startup_out(startup: Startup) -> dict:
    return {
        "id": startup.id,
        "name": startup.name,
        "tagline": startup.tagline,
        "description": startup.description,
        "sector": startup.sector,
        "city": startup.city,
    }


def evaluation_out(evaluation) -> dict:
    return {
        "id": evaluation.id,
        "evaluator_name": evaluation.evaluator_name,
        "evaluator_role": evaluation.evaluator_role,
        "score": float(evaluation.score),
        "dimensions": evaluation.dimensions,
        "summary": evaluation.summary,
        "evaluated_on": _iso(evaluation.evaluated_on),
    }


def application_out(application: Application) -> dict:
    return {
        "id": application.id,
        "status": application.status.value,
        "proposal": application.proposal,
        "submitted_on": _iso(application.submitted_on),
        "eligibility": {
            "eligible": application.eligible,
            "checks": application.eligibility_checks or [],
            "screened_on": _iso(application.screened_on),
        },
        "evaluations": [evaluation_out(e) for e in application.evaluations],
        "startup": startup_out(application.startup),
    }


def challenge_out(db: Session, challenge: Challenge, deep: bool = False) -> dict:
    result = {
        "id": challenge.id,
        "status": challenge.status.value,
        "title": challenge.title,
        "problem": challenge.problem,
        "expected_outcome": challenge.expected_outcome,
        "kpi": {
            "metric": challenge.kpi_metric,
            "baseline_value": float(challenge.baseline_value),
            "target_value": float(challenge.target_value),
            "target_operator": challenge.target_operator,
            "unit": challenge.unit,
        },
        "duration_days": challenge.duration_days,
        "eligibility_criteria": challenge.eligibility_criteria or [],
        "evaluation_dimensions": challenge.evaluation_dimensions or [],
        "pilot_expectations": challenge.pilot_expectations,
        "evidence_requirements": challenge.evidence_requirements or [],
        "tags": challenge.tags or [],
        "department": department_out(challenge.department),
        "created_at": _iso(challenge.created_at),
        "pilots": [pilot_brief(p) for p in challenge.pilots],
    }
    if deep:
        apps = list(challenge.applications)
        apps.sort(key=lambda a: -(_best_score(a) if a.eligible else -1))
        result["applications"] = [application_out(a) for a in apps]
        result["reuse_discovery"] = reuse_service.discovery(db, challenge)
        result["reuse_decisions"] = [
            reuse_decision_out(d)
            for d in db.execute(
                select(ReuseDecision).where(ReuseDecision.challenge_id == challenge.id)
            ).scalars()
        ]
    return result


def _best_score(application: Application) -> float:
    return max((float(e.score) for e in application.evaluations), default=0.0)


def milestone_out(milestone) -> dict:
    return {
        "seq": milestone.seq,
        "title": milestone.title,
        "description": milestone.description,
        "amount": _fmt_money(milestone.amount),
        "amount_raw": float(milestone.amount),
        "currency": milestone.currency,
        "status": milestone.status.value,
        "payment_status": milestone.payment_status.value,
        "note": milestone.note,
    }


def risk_out(risk) -> dict:
    return {
        "id": risk.id,
        "category": risk.category,
        "description": risk.description,
        "mitigation": risk.mitigation,
        "status": risk.status,
    }


def evidence_out(evidence: Evidence) -> dict:
    checks = [
        {
            "id": c.id,
            "ok": c.ok,
            "method": c.method,
            "note": c.note,
            "checked_at": _iso(c.checked_at),
        }
        for c in evidence.checks
    ]
    return {
        "id": evidence.id,
        "kind": evidence.kind,
        "title": evidence.title,
        "description": evidence.description,
        "source": evidence.source,
        "occurred_on": _iso(evidence.occurred_on),
        "filename": evidence.filename,
        "content_type": evidence.content_type,
        "size_bytes": evidence.size_bytes,
        "sha256": evidence.sha256,
        "storage_backend": evidence.storage_backend,
        "uploaded_at": _iso(evidence.uploaded_at),
        "measurement_id": evidence.measurement_id,
        "measurement_label": evidence.measurement.label if evidence.measurement else None,
        "latest_check": checks[-1] if checks else None,
        "checks": checks,
    }


def protocol_out(protocol) -> dict:
    return {
        "id": protocol.id,
        "version": protocol.version,
        "status": protocol.status.value,
        "metric": protocol.metric,
        "target_operator": protocol.target_operator,
        "target_value": float(protocol.target_value),
        "unit": protocol.unit,
        "baseline_value": float(protocol.baseline_value),
        "duration_days": protocol.duration_days,
        "sample_interval": protocol.sample_interval,
        "measurement_method": protocol.measurement_method,
        "success_rule": protocol.success_rule,
        "content_hash": protocol.content_hash,
        "sealed_by": protocol.sealed_by,
        "sealed_at": _iso(protocol.sealed_at),
        "created_at": _iso(protocol.created_at),
        "updated_at": _iso(protocol.updated_at),
    }


def measurement_out(measurement) -> dict:
    return {
        "id": measurement.id,
        "label": measurement.label,
        "value": float(measurement.value),
        "unit": measurement.unit,
        "source": measurement.source,
        "recorded_on": _iso(measurement.recorded_on),
    }


def audit_out(event) -> dict:
    return {
        "id": event.id,
        "kind": event.kind,
        "summary": event.summary,
        "actor": event.actor,
        "occurred_at": _iso(event.occurred_at),
        "content_hash": event.content_hash,
        "prev_hash": event.prev_hash,
    }


def pilot_brief(pilot: Pilot) -> dict:
    sealed = workflow.current_sealed(pilot)
    protocol_state = (
        sealed.status.value
        if sealed
        else (pilot.protocols[-1].status.value if pilot.protocols else None)
    )
    return {
        "id": pilot.id,
        "status": pilot.status.value,
        "startup_id": pilot.startup_id,
        "startup": pilot.startup.name,
        "challenge_id": pilot.challenge_id,
        "challenge": pilot.challenge.title,
        "department": pilot.challenge.department.short_name,
        "protocol_status": protocol_state,
        "created_at": _iso(pilot.created_at),
    }


def pilot_out(db: Session, pilot: Pilot) -> dict:
    sealed = workflow.current_sealed(pilot)
    result: dict = {
        "id": pilot.id,
        "status": pilot.status.value,
        "scope": pilot.scope,
        "started_at": _iso(pilot.started_at),
        "completed_at": _iso(pilot.completed_at),
        "challenge": challenge_out(db, pilot.challenge),
        "startup": startup_out(pilot.startup),
        "protocols": [protocol_out(p) for p in pilot.protocols],
        "current_protocol": (
            protocol_out(max(pilot.protocols, key=lambda p: p.version))
            if pilot.protocols
            else None
        ),
        "sealed_protocol": protocol_out(sealed) if sealed else None,
        "milestones": [milestone_out(m) for m in pilot.milestones],
        "risks": [risk_out(r) for r in pilot.risks],
        "measurements": [measurement_out(m) for m in pilot.measurements],
        "evidence": [evidence_out(e) for e in pilot.evidence],
        "validations": [
            {
                "id": v.id,
                "validator_name": v.validator_name,
                "status": v.status.value,
                "notes": v.notes,
                "decided_at": _iso(v.decided_at),
                "created_at": _iso(v.created_at),
            }
            for v in pilot.validations
        ],
        "audit": [audit_out(e) for e in pilot.audit_events],
    }
    if pilot.verdict is not None:
        verdict = pilot.verdict
        result["verdict"] = {
            "id": verdict.id,
            "protocol_version": verdict.protocol_version,
            "metric": verdict.metric,
            "target_operator": verdict.target_operator,
            "target_value": float(verdict.target_value),
            "unit": verdict.unit,
            "observed_value": float(verdict.observed_value),
            "sample_count": verdict.sample_count,
            "method": verdict.method,
            "outcome": verdict.outcome.value,
            "issued_by": verdict.issued_by,
            "issued_at": _iso(verdict.issued_at),
        }
        if verdict.scale is not None:
            result["scale"] = {
                "outcome": verdict.scale.outcome.value,
                "basis": verdict.scale.basis,
                "decided_by": verdict.scale.decided_by,
                "decided_at": _iso(verdict.scale.decided_at),
            }
        if verdict.vpr is not None:
            result["vpr"] = {
                "id": verdict.vpr.id,
                "reference": verdict.vpr.reference,
                "status": verdict.vpr.status.value,
                "summary": verdict.vpr.summary,
                "issued_at": _iso(verdict.vpr.issued_at),
            }
    if pilot.measurements and sealed is not None:
        result["result"] = workflow.compute_result(db, pilot)
    return result


def reuse_decision_out(decision: ReuseDecision) -> dict:
    return {
        "id": decision.id,
        "action": decision.action.value,
        "rationale": decision.rationale,
        "decided_by": decision.decided_by,
        "decided_at": _iso(decision.decided_at),
        "vpr_id": decision.vpr_id,
        "vpr_reference": decision.vpr.reference if decision.vpr else None,
        "confirmatory_pilot_id": decision.confirmatory_pilot_id,
    }


def vpr_out(db: Session, vpr: Vpr) -> dict:
    verdict = vpr.verdict
    pilot = verdict.pilot
    sealed = workflow.current_sealed(pilot)
    winning_application = next(
        (
            a
            for a in pilot.challenge.applications
            if a.startup_id == pilot.startup_id
        ),
        None,
    )
    approved = next(
        (v for v in pilot.validations if v.status.value == "APPROVED"), None
    )
    return {
        "id": vpr.id,
        "reference": vpr.reference,
        "status": vpr.status.value,
        "summary": vpr.summary,
        "issued_at": _iso(vpr.issued_at),
        "department": department_out(pilot.challenge.department),
        "challenge": {
            "id": pilot.challenge.id,
            "title": pilot.challenge.title,
            "problem": pilot.challenge.problem,
        },
        "startup": startup_out(pilot.startup),
        "application": (
            application_out(winning_application) if winning_application else None
        ),
        "pilot": {
            "id": pilot.id,
            "status": pilot.status.value,
            "scope": pilot.scope,
            "started_at": _iso(pilot.started_at),
            "completed_at": _iso(pilot.completed_at),
        },
        "protocol": protocol_out(sealed) if sealed else None,
        "verdict": {
            "id": verdict.id,
            "protocol_version": verdict.protocol_version,
            "metric": verdict.metric,
            "target_operator": verdict.target_operator,
            "target_value": float(verdict.target_value),
            "unit": verdict.unit,
            "observed_value": float(verdict.observed_value),
            "sample_count": verdict.sample_count,
            "method": verdict.method,
            "outcome": verdict.outcome.value,
            "issued_by": verdict.issued_by,
            "issued_at": _iso(verdict.issued_at),
        },
        "scale": (
            {
                "outcome": verdict.scale.outcome.value,
                "basis": verdict.scale.basis,
                "decided_by": verdict.scale.decided_by,
                "decided_at": _iso(verdict.scale.decided_at),
            }
            if verdict.scale is not None
            else None
        ),
        "milestones": [milestone_out(m) for m in pilot.milestones],
        "measurements": [measurement_out(m) for m in pilot.measurements],
        "evidence": [evidence_out(e) for e in pilot.evidence],
        "validation": (
            {
                "validator_name": approved.validator_name if approved else None,
                "notes": approved.notes if approved else "",
                "decided_at": _iso(approved.decided_at) if approved else None,
            }
        ),
        "audit": [audit_out(e) for e in pilot.audit_events],
    }
