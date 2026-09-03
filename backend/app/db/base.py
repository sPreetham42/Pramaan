"""Declarative base for PRAMAAN domain models.

The foundation defines no domain tables yet — module developers (Persons
2-4) add their models here later, all inheriting from :class:`Base`.
"""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
