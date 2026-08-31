"""API столов: список, создание, открытие и закрытие сеанса."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.mappers import session_to_out
from app.database import get_db
from app.schemas import SessionOpenRequest, SessionOut, TableCreate, TableOut
from app.services import sessions as sessions_service
from app.services import tables as tables_service

router = APIRouter(prefix="/api/tables", tags=["tables"])


@router.get("", response_model=list[TableOut])
def list_tables(db: Session = Depends(get_db)) -> list[TableOut]:
    return [TableOut.model_validate(t) for t in tables_service.list_tables(db)]


@router.post("", response_model=TableOut, status_code=201)
def create_table(payload: TableCreate, db: Session = Depends(get_db)) -> TableOut:
    return TableOut.model_validate(tables_service.create_table(db, payload.name))


@router.post("/{table_id}/open", response_model=SessionOut, status_code=201)
def open_session(
    table_id: int, payload: SessionOpenRequest, db: Session = Depends(get_db)
) -> SessionOut:
    session = sessions_service.open_session(db, table_id, payload.tariff_id)
    return session_to_out(session)


@router.post("/{table_id}/close", response_model=SessionOut)
def close_session(table_id: int, db: Session = Depends(get_db)) -> SessionOut:
    session = sessions_service.close_session(db, table_id)
    return session_to_out(session)
