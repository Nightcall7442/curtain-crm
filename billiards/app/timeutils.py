"""Работа со временем.

Все метки времени в системе — наивные datetime в UTC. Единая функция
utcnow() исключает разнобой между datetime.utcnow (устарела) и
datetime.now(...) с разными зонами.
"""

from datetime import UTC, datetime


def utcnow() -> datetime:
    """Текущее время в UTC без tzinfo (так оно хранится в SQLite)."""
    return datetime.now(UTC).replace(tzinfo=None)
