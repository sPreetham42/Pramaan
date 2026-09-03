"""MinIO (S3-compatible) object storage wiring.

Foundation scope: connect at startup, make sure the evidence bucket exists,
and expose an availability check used by ``/health``. Evidence upload and
hashing are future modules — they will build on this client.
"""

import logging
import time

import urllib3
from minio import Minio

from app.config import settings

logger = logging.getLogger(__name__)


def _client() -> Minio:
    """Minio client with short timeouts and no internal retries so checks
    fail fast when the server is down (bare local development without
    MinIO). Reachable servers answer well inside these limits."""
    http_client = urllib3.PoolManager(
        timeout=urllib3.Timeout(connect=1.0, read=3.0),
        retries=urllib3.Retry(total=0, connect=0, read=0),
    )
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
        http_client=http_client,
    )


def ensure_evidence_bucket(retries: int = 2, delay: float = 0.5) -> bool:
    """Create the configured bucket if missing.

    Never raises: object storage must not block backend startup. Returns
    True when the bucket is ready (or was already present).
    """
    for attempt in range(1, retries + 1):
        try:
            client = _client()
            if not client.bucket_exists(settings.minio_bucket):
                client.make_bucket(settings.minio_bucket)
                logger.info("Created MinIO bucket '%s'", settings.minio_bucket)
            return True
        except Exception as exc:  # noqa: BLE001 — storage is best-effort
            logger.warning(
                "MinIO not ready (attempt %s/%s): %s", attempt, retries, exc
            )
            if attempt < retries:
                time.sleep(delay)
    return False


def storage_available() -> bool:
    """True when the MinIO server answers (bucket presence is irrelevant)."""
    try:
        _client().bucket_exists(settings.minio_bucket)
        return True
    except Exception:  # noqa: BLE001 — health checks must not crash
        return False
