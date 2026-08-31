"""Журнал событий клуба."""

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.timeutils import utcnow


class JournalEvent(enum.StrEnum):
    TABLE_CREATED = "table_created"
    TARIFF_CREATED = "tariff_created"
    SESSION_OPENED = "session_opened"
    SESSION_CLOSED = "session_closed"
    LIGHT_ON = "light_on"
    LIGHT_OFF = "light_off"


class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    event: Mapped[JournalEvent] = mapped_column(
        Enum(JournalEvent, values_callable=lambda e: [m.value for m in e]),
        nullable=False,
    )
    message: Mapped[str] = mapped_column(String(500), nullable=False)
    table_id: Mapped[int | None] = mapped_column(
        ForeignKey("tables.id", ondelete="SET NULL"), nullable=True
    )
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("table_sessions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False, index=True
    )
