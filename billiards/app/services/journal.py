"""Запись событий в журнал.

Единственная точка записи: все сервисы фиксируют события через log_event,
поэтому формат записей единообразен.
"""

from sqlalchemy.orm import Session

from app.models.journal import JournalEntry, JournalEvent


def log_event(
    db: Session,
    event: JournalEvent,
    message: str,
    *,
    table_id: int | None = None,
    session_id: int | None = None,
) -> JournalEntry:
    """Добавляет запись в журнал. Коммит выполняет вызывающий код."""
    entry = JournalEntry(
        event=event, message=message, table_id=table_id, session_id=session_id
    )
    db.add(entry)
    return entry
