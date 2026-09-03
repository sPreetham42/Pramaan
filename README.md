# PRAMAAN

**Prove Once. Reuse the Proof.**

PRAMAAN is an offline-first Smart India Hackathon prototype that will let a
government department publish a problem, run a sealed pilot with a startup,
collect tamper-evident evidence, and produce a **Verified Pilot Record (VPR)**
that can be reused for procurement decisions.

## Current phase: FOUNDATION

This repository is the **technical foundation only**. No PRAMAAN business
modules (challenges, evaluations, protocols, sealing, pilots, evidence,
validation, verdicts, VPR, reuse, procurement, AI, authentication) are
implemented yet. See [`CONTEXT.md`](CONTEXT.md) for the full project context
and the 4-person work division.

## Technology stack

| Layer | Choice |
| --- | --- |
| Frontend | React + TypeScript (strict) + Tailwind CSS + Vite |
| Backend | FastAPI (Python) |
| Database | PostgreSQL (SQLAlchemy 2.x) |
| Object storage | MinIO (S3-compatible) |
| API | REST (`/api/v1` reserved for future domain routes) |
| Orchestration | Docker Compose |

## What works today

- `GET /` and `GET /health` (reports PostgreSQL and MinIO reachability)
- PostgreSQL + MinIO + backend + frontend run together via Docker Compose
- The backend creates the `pramaan-evidence` bucket in MinIO at startup
- A minimal React page ("Foundation build is running") that calls the
  backend `/health` through a centralized API client

## Run with Docker Compose

```bash
cp .env.example .env      # optional — dev defaults work as-is
docker compose up --build
```

Then open:

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API docs (Swagger): http://localhost:8000/docs
- MinIO console: http://localhost:9001 (credentials in `.env`)

Health check:

```bash
curl http://localhost:8000/health
# {"status":"ok", ..., "checks":{"database":"ok","storage":"ok"}}
```

## Run without Docker (local development)

Backend (Python 3.12):

```bash
cd backend
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt -r requirements-dev.txt   # Windows
# .venv/bin/pip ...                                                     # Linux/macOS
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000       # Windows
```

Start PostgreSQL and MinIO through Compose if you do not want the full stack:

```bash
docker compose up -d postgres minio
```

Frontend:

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173, proxies /api and /health to :8000
```

## Tests

```bash
cd backend
.venv/Scripts/python -m pytest          # hermetic defaults; 3 tests
# Against a real PostgreSQL (disposable database):
# DATABASE_URL=postgresql+psycopg://user:pass@host:5432/dbname .venv/Scripts/python -m pytest
```

## Repository structure

```text
frontend/    React + TypeScript + Tailwind + Vite (minimal page + API client)
backend/     FastAPI app (main.py, config.py, api/, db/, models/, schemas/, services/)
database/    Placeholder — future migrations/seed data live here
storage/     Placeholder — future demo evidence files live here
```

See [`CONTEXT.md`](CONTEXT.md) for what each developer will build next and
which files to work in.
