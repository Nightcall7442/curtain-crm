"""Начальные данные для пустой базы.

При первом запуске (в базе нет ни столов, ни тарифов) создаём стартовый
набор, чтобы клуб мог работать сразу. На непустую базу не влияет.
"""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.table import Table
from app.models.tariff import Tariff
from app.services.tables import create_table
from app.services.tariffs import create_tariff

INITIAL_TABLES = ["Стол 1", "Стол 2", "Стол 3"]
INITIAL_TARIFFS = [("Будний день", 400), ("Выходной день", 600)]


def seed_initial_data(db: Session) -> None:
    has_tables = db.scalar(select(Table.id).limit(1)) is not None
    has_tariffs = db.scalar(select(Tariff.id).limit(1)) is not None
    if has_tables or has_tariffs:
        return
    for name in INITIAL_TABLES:
        create_table(db, name)
    for name, price in INITIAL_TARIFFS:
        create_tariff(db, name, price)
