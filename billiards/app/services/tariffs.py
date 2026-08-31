"""Операции с тарифами."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.journal import JournalEvent
from app.models.tariff import Tariff
from app.services.errors import ConflictError, NotFoundError
from app.services.journal import log_event


def list_tariffs(db: Session, *, only_active: bool = False) -> list[Tariff]:
    query = select(Tariff).order_by(Tariff.id)
    if only_active:
        query = query.where(Tariff.is_active.is_(True))
    return list(db.scalars(query))


def get_tariff(db: Session, tariff_id: int) -> Tariff:
    tariff = db.get(Tariff, tariff_id)
    if tariff is None:
        raise NotFoundError(f"Тариф id={tariff_id} не найден")
    return tariff


def create_tariff(db: Session, name: str, price_per_hour: int) -> Tariff:
    name = name.strip()
    if not name:
        raise ConflictError("Название тарифа не может быть пустым")
    if price_per_hour <= 0:
        raise ConflictError("Цена тарифа должна быть больше нуля")
    exists = db.scalar(select(Tariff).where(Tariff.name == name))
    if exists is not None:
        raise ConflictError(f"Тариф с названием «{name}» уже существует")
    tariff = Tariff(name=name, price_per_hour=price_per_hour)
    db.add(tariff)
    db.flush()
    log_event(
        db,
        JournalEvent.TARIFF_CREATED,
        f"Создан тариф «{tariff.name}» — {tariff.price_per_hour} ₽/час",
    )
    db.commit()
    return tariff
