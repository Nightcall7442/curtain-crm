"""Сеанс игры за столом.

Открытый сеанс: ended_at и total_cost_kopecks равны NULL.
price_per_hour_snapshot фиксирует цену на момент открытия, чтобы
изменение тарифа не влияло на уже идущие сеансы.

Деньги в итоговой стоимости храним в копейках (целое число) —
никаких float для денег.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.table import Table
from app.models.tariff import Tariff
from app.timeutils import utcnow


class TableSession(Base):
    __tablename__ = "table_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(
        ForeignKey("tables.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    tariff_id: Mapped[int] = mapped_column(
        ForeignKey("tariffs.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    price_per_hour_snapshot: Mapped[int] = mapped_column(Integer, nullable=False)
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    total_cost_kopecks: Mapped[int | None] = mapped_column(Integer, nullable=True)

    table: Mapped[Table] = relationship(lazy="joined")
    tariff: Mapped[Tariff] = relationship(lazy="joined")

    @property
    def is_open(self) -> bool:
        return self.ended_at is None
