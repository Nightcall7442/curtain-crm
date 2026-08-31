"""Pydantic-схемы запросов и ответов API.

Все datetime в системе — наивные UTC; наружу отдаём ISO-8601 с суффиксом
"Z", чтобы браузер корректно переводил время в локальную зону.
Деньги наружу отдаём в рублях (число с двумя знаками).
"""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer

from app.models.table import TableStatus


def _to_iso_utc(value: datetime) -> str:
    return value.isoformat() + "Z"


UTCDateTime = Annotated[datetime, PlainSerializer(_to_iso_utc, return_type=str)]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# --- Столы -----------------------------------------------------------------


class TableCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TableOut(ORMModel):
    id: int
    name: str
    status: TableStatus
    created_at: UTCDateTime


# --- Тарифы ----------------------------------------------------------------


class TariffCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price_per_hour: int = Field(gt=0, description="Рублей в час")


class TariffOut(ORMModel):
    id: int
    name: str
    price_per_hour: int
    is_active: bool


# --- Сеансы ----------------------------------------------------------------


class SessionOpenRequest(BaseModel):
    tariff_id: int


class SessionOut(ORMModel):
    id: int
    table_id: int
    table_name: str
    tariff_id: int
    tariff_name: str
    price_per_hour: int
    started_at: UTCDateTime
    ended_at: UTCDateTime | None
    duration_seconds: int
    total_cost: float | None


# --- Dashboard -------------------------------------------------------------


class OpenSessionInfo(BaseModel):
    session_id: int
    tariff_name: str
    price_per_hour: int
    started_at: UTCDateTime
    elapsed_seconds: int
    current_cost: float


class DashboardTable(BaseModel):
    id: int
    name: str
    status: TableStatus
    light_on: bool
    session: OpenSessionInfo | None


# --- Журнал ----------------------------------------------------------------


class JournalEntryOut(ORMModel):
    id: int
    event: str
    message: str
    table_id: int | None
    session_id: int | None
    created_at: UTCDateTime
