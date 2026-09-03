from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.system import system_router
from app.config import settings
from app.storage import ensure_evidence_bucket


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Best-effort bucket bootstrap — never blocks startup (e.g. when MinIO
    # is not running in bare local development).
    ensure_evidence_bucket()
    yield


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description=(
            "PRAMAAN — Prove Once. Reuse the Proof. "
            "Offline-first SIH demonstration backend (foundation phase)."
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
    return app


app = create_app()
