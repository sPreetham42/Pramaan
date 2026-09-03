"""PRAMAAN demo API under /api/v1. Each module owns one product concept."""

from fastapi import APIRouter

from app.api.v1.challenges import challenges_router, departments_router, templates_router
from app.api.v1.demo import demo_router
from app.api.v1.evidence import evidence_router, pilot_evidence_router
from app.api.v1.pilots import pilots_router
from app.api.v1.startups import startups_router
from app.api.v1.vprs import vprs_router

api_v1 = APIRouter(prefix="/api/v1")
api_v1.include_router(departments_router)
api_v1.include_router(challenges_router)
api_v1.include_router(startups_router)
api_v1.include_router(pilots_router)
api_v1.include_router(evidence_router)
api_v1.include_router(pilot_evidence_router)
api_v1.include_router(vprs_router)
api_v1.include_router(templates_router)
api_v1.include_router(demo_router)
