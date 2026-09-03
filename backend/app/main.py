from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.system import system_router
from app.api.v1 import api_v1
from app.config import settings
from app.db.init import init_schema_and_seed
from app.storage import ensure_evidence_bucket


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Best-effort bucket bootstrap; never blocks startup when MinIO is not
    # running in bare local development.
    ensure_evidence_bucket()
    # Prototype initialisation: create tables, seed the deterministic demo
    # scenario when the database is empty.
    init_schema_and_seed()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description=(
            "PRAMAAN — Prove Once. Reuse the Proof. "
            "SIH demonstration: transparent challenge evaluation, sealed pilot "
            "criteria, verified evidence, deterministic verdicts, reusable records."
        ),
        version=__version__,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(system_router)
    app.include_router(api_v1)
    return app


app = create_app()
