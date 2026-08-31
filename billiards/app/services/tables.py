"""Операции со столами."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journal import JournalEvent
from app.models.table import Table
from app.services.errors import ConflictError, NotFoundError
from app.services.journal import log_event


def list_tables(db: Session) -> list[Table]:
    return list(db.scalars(select(Table).order_by(Table.id)))


def get_table(db: Session, table_id: int) -> Table:
    table = db.get(Table, table_id)
    if table is None:
        raise NotFoundError(f"Стол id={table_id} не найден")
    return table


def create_table(db: Session, name: str) -> Table:
    name = name.strip()
    if not name:
        raise ConflictError("Название стола не может быть пустым")
    exists = db.scalar(select(Table).where(Table.name == name))
    if exists is not None:
        raise ConflictError(f"Стол с названием «{name}» уже существует")
    table = Table(name=name)
    db.add(table)
    db.flush()  # получаем table.id для записи в журнал
    log_event(
        db,
        JournalEvent.TABLE_CREATED,
        f"Создан стол «{table.name}»",
        table_id=table.id,
    )
    db.commit()
    return table
