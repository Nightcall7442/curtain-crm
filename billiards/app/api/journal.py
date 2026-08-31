"""API журнала событий."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.journal import JournalEntry
from app.schemas import JournalEntryOut

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.get("", response_model=list[JournalEntryOut])
def journal(
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[JournalEntryOut]:
    entries = db.scalars(
        select(JournalEntry)
        .order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc())
        .limit(limit)
    )
    return [JournalEntryOut.model_validate(e) for e in entries]
