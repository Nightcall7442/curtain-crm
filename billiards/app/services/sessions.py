"""Открытие и закрытие сеансов — ядро бизнес-логики клуба.

Правила:
- открыть сеанс можно только на свободном столе;
- закрыть сеанс можно только на занятом столе (с открытым сеансом);
- цена фиксируется на момент открытия (снимок тарифа);
- при открытии включается свет над столом, при закрытии — выключается;
- каждое действие фиксируется в журнале.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journal import JournalEvent
from app.models.session import TableSession
from app.models.table import TableStatus
from app.services import billing
from app.services.errors import ConflictError
from app.services.journal import log_event
from app.services.lighting import get_lighting_controller
from app.services.tables import get_table
from app.services.tariffs import get_tariff
from app.timeutils import utcnow


def get_open_session(db: Session, table_id: int) -> TableSession | None:
    """Открытый сеанс стола, если есть."""
    return db.scalar(
        select(TableSession).where(
            TableSession.table_id == table_id,
            TableSession.ended_at.is_(None),
        )
    )


def open_session(db: Session, table_id: int, tariff_id: int) -> TableSession:
    """Открывает сеанс: стол занят, свет включён, событие в журнале."""
    table = get_table(db, table_id)
    tariff = get_tariff(db, tariff_id)
    if not tariff.is_active:
        raise ConflictError(f"Тариф «{tariff.name}» отключён")
    if table.status is not TableStatus.FREE or get_open_session(db, table.id):
        raise ConflictError(f"Стол «{table.name}» уже занят")

    session = TableSession(
        table_id=table.id,
        tariff_id=tariff.id,
        price_per_hour_snapshot=tariff.price_per_hour,
        started_at=utcnow(),
    )
    table.status = TableStatus.BUSY
    db.add(session)
    db.flush()  # session.id нужен для журнала

    log_event(
        db,
        JournalEvent.SESSION_OPENED,
        f"Открыт сеанс на столе «{table.name}», тариф «{tariff.name}» "
        f"({tariff.price_per_hour} ₽/час)",
        table_id=table.id,
        session_id=session.id,
    )
    get_lighting_controller().turn_light_on(table.id)
    log_event(
        db,
        JournalEvent.LIGHT_ON,
        f"Включён свет над столом «{table.name}»",
        table_id=table.id,
        session_id=session.id,
    )
    db.commit()
    return session


def close_session(db: Session, table_id: int) -> TableSession:
    """Закрывает сеанс: считает стоимость, освобождает стол, гасит свет."""
    table = get_table(db, table_id)
    session = get_open_session(db, table.id)
    if session is None:
        raise ConflictError(f"Стол «{table.name}» свободен — закрывать нечего")

    session.ended_at = utcnow()
    session.total_cost_kopecks = billing.session_cost_kopecks(
        session.price_per_hour_snapshot, session.started_at, session.ended_at
    )
    table.status = TableStatus.FREE

    total_rubles = billing.kopecks_to_rubles(session.total_cost_kopecks)
    log_event(
        db,
        JournalEvent.SESSION_CLOSED,
        f"Закрыт сеанс на столе «{table.name}», итог {total_rubles:.2f} ₽",
        table_id=table.id,
        session_id=session.id,
    )
    get_lighting_controller().turn_light_off(table.id)
    log_event(
        db,
        JournalEvent.LIGHT_OFF,
        f"Выключен свет над столом «{table.name}»",
        table_id=table.id,
        session_id=session.id,
    )
    db.commit()
    return session


def current_cost_kopecks(session: TableSession) -> int:
    """Текущая стоимость: для открытого сеанса — по времени «сейчас»."""
    if session.total_cost_kopecks is not None:
        return session.total_cost_kopecks
    return billing.session_cost_kopecks(
        session.price_per_hour_snapshot, session.started_at, utcnow()
    )


def list_history(db: Session, limit: int = 100) -> list[TableSession]:
    """Закрытые сеансы, новые сверху."""
    return list(
        db.scalars(
            select(TableSession)
            .where(TableSession.ended_at.is_not(None))
            .order_by(TableSession.ended_at.desc())
            .limit(limit)
        )
    )
