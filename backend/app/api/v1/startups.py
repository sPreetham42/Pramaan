from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models import Application, Pilot, Startup
from app.services.serializers import (
    application_out,
    pilot_brief,
    startup_out,
)

startups_router = APIRouter(prefix="/startups", tags=["startups"])


@startups_router.get("")
def list_startups(db: Session = Depends(get_db)) -> dict:
    startups = db.execute(select(Startup).order_by(Startup.id)).scalars().all()
    items = []
    for startup in startups:
        item = startup_out(startup)
        applications = db.execute(
            select(Application).where(Application.startup_id == startup.id)
        ).scalars().all()
        item["applications"] = [
            {
                "id": a.id,
                "challenge_id": a.challenge_id,
                "challenge": a.challenge.title,
                "department": a.challenge.department.short_name,
                "status": a.status.value,
                "submitted_on": a.submitted_on,
            }
            for a in applications
        ]
        item["wins"] = sum(1 for a in applications if a.status.value == "SELECTED")
        items.append(item)
    return {"startups": items}


@startups_router.get("/{startup_id}")
def get_startup(startup_id: int, db: Session = Depends(get_db)) -> dict:
    startup = db.get(Startup, startup_id)
    if startup is None:
        raise HTTPException(status_code=404, detail="Startup not found.")
    applications = db.execute(
        select(Application).where(Application.startup_id == startup.id)
    ).scalars().all()
    pilots = db.execute(
        select(Pilot).where(Pilot.startup_id == startup.id).order_by(Pilot.id)
    ).scalars().all()
    return {
        "startup": startup_out(startup),
        "applications": [
            {
                **application_out(a),
                "challenge_id": a.challenge_id,
                "challenge_title": a.challenge.title,
                "challenge_status": a.challenge.status.value,
                "department": a.challenge.department.short_name,
            }
            for a in applications
        ],
        "pilots": [pilot_brief(p) for p in pilots],
    }
