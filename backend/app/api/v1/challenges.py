from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Challenge, Department, ReuseAction, Startup, Vpr
from app.services import reuse as reuse_service
from app.services import workflow
from app.services.serializers import challenge_out, pilot_out, startup_out

departments_router = APIRouter(prefix="/departments", tags=["departments"])
challenges_router = APIRouter(prefix="/challenges", tags=["challenges"])
templates_router = APIRouter(prefix="/challenges", tags=["challenges"])

OPERATOR_TEXT = {"lte": "<=", "gte": ">=", "lt": "<", "gt": ">"}


@departments_router.get("")
def list_departments(db: Session = Depends(get_db)) -> dict:
    departments = db.execute(select(Department).order_by(Department.id)).scalars().all()
    return {
        "departments": [
            {
                "id": d.id,
                "name": d.name,
                "short_name": d.short_name,
                "description": d.description,
            }
            for d in departments
        ]
    }


@challenges_router.get("")
def list_challenges(db: Session = Depends(get_db)) -> dict:
    challenges = db.execute(select(Challenge).order_by(Challenge.id)).scalars().all()
    return {"challenges": [challenge_out(db, c) for c in challenges]}


@challenges_router.get("/{challenge_id}")
def get_challenge(challenge_id: int, db: Session = Depends(get_db)) -> dict:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    return challenge_out(db, challenge, deep=True)


@challenges_router.get("/{challenge_id}/proof")
def proof_discovery(challenge_id: int, db: Session = Depends(get_db)) -> dict:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    return {
        "challenge_id": challenge.id,
        "challenge_status": challenge.status.value,
        "discovery": reuse_service.discovery(db, challenge),
    }


class SelectPilotRequest(BaseModel):
    startup_id: int
    scope: Optional[str] = None


@challenges_router.post("/{challenge_id}/pilots", status_code=201)
def select_pilot(
    challenge_id: int, body: SelectPilotRequest, db: Session = Depends(get_db)
) -> dict:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    startup = db.get(Startup, body.startup_id)
    if startup is None:
        raise HTTPException(status_code=404, detail="Startup not found.")
    pilot = workflow.create_pilot(db, challenge, startup, scope=body.scope or "")
    db.refresh(pilot)
    return pilot_out(db, pilot)


class ReuseDecisionRequest(BaseModel):
    vpr_id: int
    action: ReuseAction
    rationale: str = ""
    decided_by: str = "Department evaluation cell"


@challenges_router.post("/{challenge_id}/reuse-decision")
def reuse_decision(
    challenge_id: int, body: ReuseDecisionRequest, db: Session = Depends(get_db)
) -> dict:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    vpr = db.get(Vpr, body.vpr_id)
    if vpr is None:
        raise HTTPException(status_code=404, detail="Verified Pilot Record not found.")
    decision = reuse_service.record_reuse(
        db, challenge, vpr, body.action, body.rationale, body.decided_by
    )
    db.refresh(challenge)
    return {
        "decision": {
            "id": decision.id,
            "action": decision.action.value,
            "vpr_reference": vpr.reference,
            "confirmatory_pilot_id": decision.confirmatory_pilot_id,
            "decided_at": decision.decided_at,
        },
        "challenge": challenge_out(db, challenge, deep=True),
    }


# ---------------------------------------------------------------------------
# Standard templates: government does not start from a blank page.


def _template_docs(challenge: Challenge) -> list[dict]:
    kpi = challenge.kpi_metric
    target = f"{OPERATOR_TEXT.get(challenge.target_operator, challenge.target_operator)} {float(challenge.target_value):g} {challenge.unit}"
    dept = challenge.department.short_name
    return [
        {
            "slug": "problem-statement",
            "title": "Problem statement template",
            "purpose": "Turn an operational pain into a testable challenge.",
            "content": (
                f"{challenge.title}. Current baseline for {kpi} is "
                f"{float(challenge.baseline_value):g} {challenge.unit}. The department "
                f"seeks a solution that reaches {target} within "
                f"{challenge.duration_days} days and can be proven in a controlled pilot."
            ),
        },
        {
            "slug": "evaluation-criteria",
            "title": "Evaluation criteria template",
            "purpose": "Publish how applicants will be scored before applications open.",
            "content": (
                f"Eligibility: {', '.join(c['label'] for c in challenge.eligibility_criteria) or 'open'}. "
                f"Expert scoring across: {', '.join(challenge.evaluation_dimensions) or 'fit, capability, readiness'}, "
                "each with visible reasons. The department selects on evidence, not claims."
            ),
        },
        {
            "slug": "pilot-agreement",
            "title": "Pilot agreement template",
            "purpose": "Milestone scope and staged payment.",
            "content": (
                f"Four milestone blocks for {dept}: setup and baseline, initial "
                "measurement period, target performance period, final evaluation. "
                "Payments release against completed, validated milestones through "
                "PRAMAAN; the pilot runs at named sites for the stated duration."
            ),
        },
        {
            "slug": "data-ip",
            "title": "Data and IP clauses template",
            "purpose": "Who owns what before the pilot starts.",
            "content": (
                "Government retains ownership of operational data. The startup "
                "keeps its foreground IP; the department obtains a non-exclusive "
                "right to use verified pilot results. Aggregates are de-identified "
                "before they leave the pilot sites."
            ),
        },
        {
            "slug": "cybersecurity",
            "title": "Cybersecurity baseline template",
            "purpose": "Minimum controls for third-party systems.",
            "content": (
                "Sandboxed environment, no production data writes, restricted "
                "connectivity to the reporting interface only, vendor audit, and "
                "an agreed incident channel before go-live."
            ),
        },
        {
            "slug": "risk-management",
            "title": "Risk management template",
            "purpose": "Named risks with mitigations, reviewed at milestones.",
            "content": (
                "Operational disruption, data privacy, cybersecurity, and service "
                "continuity are each assessed with a mitigation and owner before "
                "the pilot starts, and re-reviewed at every milestone."
            ),
        },
        {
            "slug": "procurement-pathway",
            "title": "Procurement pathway template",
            "purpose": "How a successful pilot becomes a decision.",
            "content": (
                "A successful pilot produces a Verified Pilot Record used by the "
                "department for a scale-up decision. PRAMAAN supplies verified "
                "evidence; procurement authority remains with the government."
            ),
        },
    ]


@templates_router.get("/{challenge_id}/templates")
def challenge_templates(challenge_id: int, db: Session = Depends(get_db)) -> dict:
    challenge = db.get(Challenge, challenge_id)
    if challenge is None:
        raise HTTPException(status_code=404, detail="Challenge not found.")
    return {"challenge_id": challenge.id, "templates": _template_docs(challenge)}
