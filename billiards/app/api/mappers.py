"""Преобразование ORM-объектов в схемы ответов API."""

from app.models.session import TableSession
from app.schemas import SessionOut
from app.services.billing import kopecks_to_rubles
from app.timeutils import utcnow


def session_to_out(session: TableSession) -> SessionOut:
    end = session.ended_at or utcnow()
    return SessionOut(
        id=session.id,
        table_id=session.table_id,
        table_name=session.table.name,
        tariff_id=session.tariff_id,
        tariff_name=session.tariff.name,
        price_per_hour=session.price_per_hour_snapshot,
        started_at=session.started_at,
        ended_at=session.ended_at,
        duration_seconds=max(0, int((end - session.started_at).total_seconds())),
        total_cost=(
            kopecks_to_rubles(session.total_cost_kopecks)
            if session.total_cost_kopecks is not None
            else None
        ),
    )
