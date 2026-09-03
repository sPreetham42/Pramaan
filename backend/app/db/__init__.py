"""Database layer: engine/session plumbing and the declarative base.

Future developers: domain models inherit ``app.db.base.Base`` and register
in this package (``models/__init__.py``), and routers receive sessions via
the ``get_db`` dependency when domain endpoints are added.
"""
