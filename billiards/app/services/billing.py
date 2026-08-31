"""Расчёт стоимости сеанса.

Стоимость пропорциональна времени: price_per_hour за каждый полный час,
доли часа — посекундно. Считаем в копейках целочисленной арифметикой,
округление половины — вверх (в пользу привычного кассового округления).
"""

from datetime import datetime

SECONDS_PER_HOUR = 3600
KOPECKS_PER_RUBLE = 100


def cost_kopecks(price_per_hour: int, duration_seconds: int) -> int:
    """Стоимость сеанса в копейках.

    price_per_hour — цена тарифа, рублей в час.
    duration_seconds — длительность сеанса в секундах (не меньше нуля).
    """
    if price_per_hour < 0:
        raise ValueError("price_per_hour must be >= 0")
    if duration_seconds < 0:
        raise ValueError("duration_seconds must be >= 0")
    numerator = price_per_hour * KOPECKS_PER_RUBLE * duration_seconds
    # Целочисленное деление с округлением половины вверх.
    return (numerator + SECONDS_PER_HOUR // 2) // SECONDS_PER_HOUR


def session_cost_kopecks(
    price_per_hour: int, started_at: datetime, ended_at: datetime
) -> int:
    """Стоимость сеанса между двумя метками времени (UTC)."""
    if ended_at < started_at:
        raise ValueError("ended_at must not be earlier than started_at")
    duration = int((ended_at - started_at).total_seconds())
    return cost_kopecks(price_per_hour, duration)


def kopecks_to_rubles(kopecks: int) -> float:
    """Для отображения в API: 90050 -> 900.5."""
    return kopecks / KOPECKS_PER_RUBLE
