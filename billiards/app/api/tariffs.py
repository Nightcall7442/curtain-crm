"""API тарифов."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import TariffCreate, TariffOut
from app.services import tariffs as tariffs_service

router = APIRouter(prefix="/api/tariffs", tags=["tariffs"])


@router.get("", response_model=list[TariffOut])
def list_tariffs(
    only_active: bool = False, db: Session = Depends(get_db)
) -> list[TariffOut]:
    tariffs = tariffs_service.list_tariffs(db, only_active=only_active)
    return [TariffOut.model_validate(t) for t in tariffs]


@router.post("", response_model=TariffOut, status_code=201)
def create_tariff(payload: TariffCreate, db: Session = Depends(get_db)) -> TariffOut:
    tariff = tariffs_service.create_tariff(db, payload.name, payload.price_per_hour)
    return TariffOut.model_validate(tariff)
