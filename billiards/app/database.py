"""Подключение к SQLite через SQLAlchemy 2.0.

Единственная точка создания engine и сессий. Остальной код получает
сессию через зависимость get_db и не знает о деталях подключения.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_URL


class Base(DeclarativeBase):
    """Базовый класс всех ORM-моделей."""


def _make_engine(url: str) -> Engine:
    connect_args = {}
    if url.startswith("sqlite"):
        # FastAPI обрабатывает запросы в пуле потоков — разрешаем
        # использование соединения не из создавшего его потока.
        connect_args["check_same_thread"] = False
    return create_engine(url, connect_args=connect_args)


engine = _make_engine(DATABASE_URL)


@event.listens_for(Engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _record) -> None:
    """SQLite по умолчанию не проверяет внешние ключи — включаем."""
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
    finally:
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Создаёт таблицы, которых ещё нет. Вызывается при старте приложения."""
    # Импорт нужен, чтобы модели зарегистрировались в Base.metadata.
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """Зависимость FastAPI: одна сессия БД на один HTTP-запрос."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
