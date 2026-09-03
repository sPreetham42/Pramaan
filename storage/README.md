# storage/

Object-storage assets for PRAMAAN.

MinIO runs through docker-compose (`minio` service). The backend creates the
`pramaan-evidence` bucket at startup and reports MinIO availability through
`GET /health`.

Future evidence files for the SIH demonstration (pilot logs, exports, ...)
will be staged in this directory so they ship with the repository and can be
uploaded/hashed during demo setup. Intentionally empty during the foundation
phase.
