"""Тесты расчёта стоимости."""

from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update

from app.database import SessionLocal
from app.models.session import TableSession
from app.services.billing import cost_kopecks, session_cost_kopecks
from app.timeutils import utcnow

PRICE = 600  # ₽/час


def test_cost_30_minutes() -> None:
    assert cost_kopecks(PRICE, 30 * 60) == 300 * 100


def test_cost_1_hour() -> None:
    assert cost_kopecks(PRICE, 60 * 60) == 600 * 100


def test_cost_1_5_hours() -> None:
    assert cost_kopecks(PRICE, 90 * 60) == 900 * 100


def test_cost_zero_duration() -> None:
    assert cost_kopecks(PRICE, 0) == 0


def test_cost_rounds_half_up() -> None:
    # 500 ₽/час за 1 секунду = 13.888... копейки -> 14.
    assert cost_kopecks(500, 1) == 14


def test_negative_duration_rejected() -> None:
    with pytest.raises(ValueError):
        cost_kopecks(PRICE, -1)


def test_session_cost_between_timestamps() -> None:
    start = datetime(2026, 1, 1, 12, 0, 0)
    assert session_cost_kopecks(PRICE, start, start + timedelta(minutes=90)) == 90000


def test_close_uses_snapshot_price(
    client: TestClient, table_id: int, tariff_id: int
) -> None:
    """Интеграция: сеанс длительностью 1 час стоит ровно цену тарифа."""
    opened = client.post(
        f"/api/tables/{table_id}/open", json={"tariff_id": tariff_id}
    ).json()

    # Сдвигаем начало сеанса на час назад прямо в базе.
    with SessionLocal() as db:
        db.execute(
            update(TableSession)
            .where(TableSession.id == opened["id"])
            .values(started_at=utcnow() - timedelta(hours=1))
        )
        db.commit()

    closed = client.post(f"/api/tables/{table_id}/close").json()
    assert closed["total_cost"] == pytest.approx(600.0, abs=0.5)
