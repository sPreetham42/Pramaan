"""Evidence artifact storage: MinIO (S3) when reachable, else a local demo
directory. Every artifact is hashed with SHA-256 server-side at upload time;
verification recomputes the hash over the stored bytes.

The local backend is honest about being demo storage: it persists real bytes
under ``settings.evidence_local_dir`` (gitignored), so hash verification is
genuine in bare local development. docker-compose runs with MinIO and keeps
objects there instead.
"""

import hashlib
import logging
import uuid
from pathlib import Path

import urllib3
from minio import Minio

from app.config import settings

logger = logging.getLogger(__name__)

LOCAL = "local"
MINIO = "minio"


def _client() -> Minio:
    """Minio client with short timeouts and no internal retries so checks
    fail fast when the server is down."""
    http_client = urllib3.PoolManager(
        timeout=urllib3.Timeout(connect=1.0, read=5.0),
        retries=urllib3.Retry(total=0, connect=0, read=0),
    )
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
        http_client=http_client,
    )


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def new_stored_name() -> str:
    return uuid.uuid4().hex


def ensure_evidence_bucket(retries: int = 2, delay: float = 0.5) -> bool:
    """Create the configured bucket if missing. Never raises."""
    for attempt in range(1, retries + 1):
        try:
            client = _client()
            if not client.bucket_exists(settings.minio_bucket):
                client.make_bucket(settings.minio_bucket)
                logger.info("Created MinIO bucket '%s'", settings.minio_bucket)
            return True
        except Exception as exc:  # noqa: BLE001 — storage is best-effort
            logger.warning("MinIO not ready (attempt %s/%s): %s", attempt, retries, exc)
            if attempt < retries:
                import time

                time.sleep(delay)
    return False


def storage_available() -> bool:
    """True when the MinIO server answers (used by /health)."""
    try:
        _client().bucket_exists(settings.minio_bucket)
        return True
    except Exception:  # noqa: BLE001 — health checks must not crash
        return False


def _local_root() -> Path:
    root = Path(settings.evidence_local_dir)
    root.mkdir(parents=True, exist_ok=True)
    return root


# ---------------------------------------------------------------------------
# Artifact operations (backend chosen per artifact and recorded on the row)


def store_artifact(data: bytes, content_type: str) -> tuple[str, str]:
    """Persist bytes and return ``(stored_name, backend)``.

    MinIO is used when reachable; otherwise the local demo directory.
    """
    stored_name = new_stored_name()
    if storage_available():
        try:
            _client().put_object(
                settings.minio_bucket,
                stored_name,
                data,
                length=len(data),
                content_type=content_type or "application/octet-stream",
            )
            return stored_name, MINIO
        except Exception as exc:  # noqa: BLE001
            logger.warning("MinIO upload failed, falling back to local: %s", exc)
    path = _local_root() / stored_name
    path.write_bytes(data)
    return stored_name, LOCAL


def load_artifact(backend: str, stored_name: str) -> bytes | None:
    """Return stored bytes, or None when the artifact cannot be read."""
    try:
        if backend == MINIO:
            response = _client().get_object(settings.minio_bucket, stored_name)
            try:
                return response.read()
            finally:
                response.close()
                response.release_conn()
        path = _local_root() / stored_name
        return path.read_bytes() if path.exists() else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to load artifact %s (%s): %s", stored_name, backend, exc)
        return None


def delete_artifact(backend: str, stored_name: str) -> None:
    try:
        if backend == MINIO:
            _client().remove_object(settings.minio_bucket, stored_name)
        else:
            path = _local_root() / stored_name
            if path.exists():
                path.unlink()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to delete artifact %s (%s): %s", stored_name, backend, exc)


def tamper_artifact(backend: str, stored_name: str) -> int | None:
    """Flip the first byte of a stored artifact (demo-only capability).

    Returns the number of bytes altered, or None if the artifact is missing.
    """
    data = load_artifact(backend, stored_name)
    if data is None or len(data) == 0:
        return None
    flipped = bytearray(data)
    flipped[0] = flipped[0] ^ 0xFF
    altered = bytes(flipped)
    if backend == MINIO:
        try:
            _client().put_object(
                settings.minio_bucket, stored_name, altered, length=len(altered)
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("MinIO tamper failed: %s", exc)
            return None
    else:
        (_local_root() / stored_name).write_bytes(altered)
    return 1
