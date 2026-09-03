# database/

Central database assets for PRAMAAN.

The foundation phase defines **no domain schema**, so this directory is
intentionally empty. As module developers introduce tables (challenge,
startup, protocol, evidence, VPR, ...) this is where migration scripts
(e.g. Alembic) and demo seed data will live.

PostgreSQL itself runs through docker-compose (`postgres` service) and the
backend connects via `DATABASE_URL` (see `.env.example`).
