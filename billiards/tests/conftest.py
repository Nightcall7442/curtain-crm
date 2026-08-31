"""Общие фикстуры тестов.

Переменные окружения выставляются ДО импорта приложения: тестовая база —
отдельный файл, сидинг стартовых данных выключен, чтобы каждый тест
начинался с пустой базы.
"""

import os
import tempfile
from collections.abc import Iterator
from pathlib import Path

_TEST_DB = Path(tempfile.gettempdir()) / "billiards_test.db"
os.environ["BILLIARDS_DATABASE_URL"] = f"sqlite:///{_TEST_DB}"
os.environ["BILLIARDS_SEED"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401 — регистрация моделей в metadata
from app.database import Base, engine  # noqa: E402
from app.main import app as fastapi_app  # noqa: E402


@pytest.fixture()
def client() -> Iterator[TestClient]:
    """HTTP-клиент с чистой базой для каждого теста."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(fastapi_app) as test_client:
        yield test_client


@pytest.fixture()
def table_id(client: TestClient) -> int:
    """Созданный стол."""
    response = client.post("/api/tables", json={"name": "Тестовый стол"})
    assert response.status_code == 201
    return response.json()["id"]


@pytest.fixture()
def tariff_id(client: TestClient) -> int:
    """Созданный тариф 600 ₽/час."""
    response = client.post(
        "/api/tariffs", json={"name": "Тестовый тариф", "price_per_hour": 600}
    )
    assert response.status_code == 201
    return response.json()["id"]
