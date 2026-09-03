# PRAMAAN

**Prove Once. Reuse the Proof.**

PRAMAAN is an offline-first Smart India Hackathon prototype that will let a
government department publish a problem, run a sealed pilot with a startup,
collect tamper-evident evidence, and produce a **Verified Pilot Record (VPR)**
that can be reused for procurement decisions.

## Current phase: DEMO PROTOTYPE

The repository now contains a working **demonstration prototype**: the full
government-to-reuse journey (challenge, competitive evaluation, sealed
protocol, pilot, evidence, validation, verdict, Verified Pilot Record and
proof reuse) runs on seeded Karnataka case-study data. See
[`CONTEXT.md`](CONTEXT.md) for the product context and the 4-person work
division. Production concerns (authentication, nationwide evidence
infrastructure, real integrations) are deliberately out of scope.

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

- The complete demo journey: challenge → applicants → competitive selection
  → sealed evaluation criteria → pilot → weekly measurements → evidence →
  validation → deterministic verdict → Verified Pilot Record → proof reuse
  in a second department
- Role-aware demo UI (Government / Startup / Validator) with comparison
  charts and progress visuals
- Deterministic seeded case study (Karnataka) with demo telemetry and a
  tamper-detection demonstration
- Docker Compose stack (frontend, backend, PostgreSQL, MinIO); backend
  tests and frontend lint/build run in CI

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
.venv/Scripts/python -m pytest          # hermetic defaults; 18 tests
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

## Contributing

- **`main` is protected** — nobody (including maintainers) pushes to it
directly.
- Create a **feature branch** from `main` for your work:
  `feat/<name>`, `fix/<name>`, `docs/<name>`, `refactor/<name>`, `test/<name>`.
- All changes land on `main` **through a Pull Request**.
- At least **one teammate reviews** the PR before it is merged.
- **CI must pass** before merging (backend tests + frontend lint/build).
- Run the tests before opening a PR (backend: `pytest`; frontend:
  `npm run build` and `npm run lint`).

Full instructions, branch conventions, and the PR/review workflow live in
[`CONTRIBUTING.md`](CONTRIBUTING.md). Security expectations live in
[`SECURITY.md`](SECURITY.md).

## GitHub Pages (static preview)

The frontend can be published to GitHub Pages as a **read-only snapshot** of
the demo data (no backend on Pages, so the hosted site serves the seeded
case study from a committed snapshot instead of the API).

1. In the repository settings, enable Pages with **Source: GitHub Actions**.
2. Push to `main` (or run the *Deploy static demo to GitHub Pages* workflow
   manually). The workflow builds with `VITE_STATIC_DEMO=true` and deploys
   `frontend/dist`.
3. The hosted site shows the full journey outline, charts, and the Verified
   Pilot Record. Mutations and live evidence verification are disabled with a
   clear notice — run the app locally or via Docker Compose for the
   interactive flow.

After changing the seeded scenario, refresh the snapshot and commit it:

```bash
# backend must be running on :8000
node frontend/scripts/generate-static-data.mjs
```
