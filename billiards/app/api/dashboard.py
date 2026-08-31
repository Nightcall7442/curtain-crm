"""API dashboard: столы с живым состоянием сеансов.

Сервер сам считает elapsed_seconds и current_cost — фронтенду не нужно
сверять часы с сервером, он лишь тикает между опросами.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import DashboardTable, OpenSessionInfo
from app.services import tables as tables_service
from app.services.billing import kopecks_to_rubles
from app.services.lighting import get_lighting_controller
from app.services.sessions import current_cost_kopecks, get_open_session
from app.timeutils import utcnow

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=list[DashboardTable])
def dashboard(db: Session = Depends(get_db)) -> list[DashboardTable]:
    lighting = get_lighting_controller()
    now = utcnow()
    result: list[DashboardTable] = []
    for table in tables_service.list_tables(db):
        session = get_open_session(db, table.id)
        info = None
        if session is not None:
            info = OpenSessionInfo(
                session_id=session.id,
                tariff_name=session.tariff.name,
                price_per_hour=session.price_per_hour_snapshot,
                started_at=session.started_at,
                elapsed_seconds=max(
                    0, int((now - session.started_at).total_seconds())
                ),
                current_cost=kopecks_to_rubles(current_cost_kopecks(session)),
            )
        result.append(
            DashboardTable(
                id=table.id,
                name=table.name,
                status=table.status,
                light_on=lighting.is_light_on(table.id),
                session=info,
            )
        )
    return result
