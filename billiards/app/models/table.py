"""Бильярдный стол."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.timeutils import utcnow


class TableStatus(enum.StrEnum):
    FREE = "free"
    BUSY = "busy"


class Table(Base):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[TableStatus] = mapped_column(
        Enum(TableStatus, values_callable=lambda e: [m.value for m in e]),
        default=TableStatus.FREE,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )
