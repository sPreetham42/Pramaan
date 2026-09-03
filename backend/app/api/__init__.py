"""HTTP layer.

The foundation exposes only system endpoints (:mod:`app.api.system`).
Future developers add one router module per domain under ``/api/v1`` and
mount it in ``app.main`` — ``main.py`` must never grow into a giant file.
"""
