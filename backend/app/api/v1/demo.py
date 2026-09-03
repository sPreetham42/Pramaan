"""Demo-only controls, reachable only while ``settings.demo_mode`` is on.

These are explicit presentation tools, not product features: resetting the
scenario to a milestone, syncing scheduled telemetry for a running pilot,
and tampering with one stored artifact to show integrity detection.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.db.session import get_db
from app.demo_seed import MILESTONES, reset_demo
from app.models import Evidence, Pilot
from app.services import demo as demo_service
from app.services.workflow import conflict
from app.storage import tamper_artifact

demo_router = APIRouter(prefix="/demo", tags=["demo"])


def _demo_enabled() -> None:
    if not settings.demo_mode:
        # Hidden, not forbidden-with-403: a public hint is unnecessary.
        raise HTTPException(status_code=404, detail="Not found.")


@demo_router.get("/state")
def demo_state() -> dict:
    _demo_enabled()
    return {
        "demo_mode": settings.demo_mode,
        "default_milestone": settings.demo_seed_milestone,
        "milestones": MILESTONES,
    }


class ResetRequest(BaseModel):
    milestone: str


@demo_router.post("/reset")
def reset(
    milestone: str | None = None,
    body: ResetRequest | None = None,
    db: Session = Depends(get_db),
) -> dict:
    """Reset the demo dataset to a milestone (query or body form)."""
    _demo_enabled()
    target = body.milestone if body is not None else milestone
    if target not in MILESTONES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown milestone. Choose one of: {', '.join(MILESTONES)}.",
        )
    return reset_demo(db, target)


class SyncWeekRequest(BaseModel):
    pilot_id: int


@demo_router.post("/sync-week")
def sync_week(body: SyncWeekRequest, db: Session = Depends(get_db)) -> dict:
    _demo_enabled()
    pilot = db.get(Pilot, body.pilot_id)
    if pilot is None:
        raise HTTPException(status_code=404, detail="Pilot not found.")
    result = demo_service.next_demo_week(db, pilot)
    return result


class TamperRequest(BaseModel):
    evidence_id: int


@demo_router.post("/tamper")
def tamper(body: TamperRequest, db: Session = Depends(get_db)) -> dict:
    """Flip one byte of a stored artifact so the next verification fails.
    Clearly a demo/developer action: normal workflows never alter evidence."""
    _demo_enabled()
    evidence = db.get(Evidence, body.evidence_id)
    if evidence is None:
        raise HTTPException(status_code=404, detail="Evidence not found.")
    if evidence.pilot.verdict is not None:
        raise conflict(
            "This pilot has a final verdict; tampering with its evidence is not available."
        )
    altered = tamper_artifact(evidence.storage_backend, evidence.stored_name)
    if altered is None:
        raise HTTPException(
            status_code=410,
            detail="The stored artifact is unavailable; nothing was altered.",
        )
    return {
        "altered": altered,
        "note": (
            "Demo tamper applied. Run evidence verification to see integrity detection."
        ),
    }
