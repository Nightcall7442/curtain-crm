"""API истории закрытых сеансов."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.mappers import session_to_out
from app.database import get_db
from app.schemas import SessionOut
from app.services.sessions import list_history

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=list[SessionOut])
def history(
    limit: int = Query(default=100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[SessionOut]:
    return [session_to_out(s) for s in list_history(db, limit=limit)]
