# backend/app/routes/history.py
import os
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.database import Call, get_db
from app.models.schemas import CallDetail, CallOut

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/calls", response_model=List[CallOut])
def list_calls(db: Session = Depends(get_db)):
    calls = db.query(Call).order_by(Call.started_at.desc()).limit(50).all()
    result = []
    for c in calls:
        item = CallOut.model_validate(c).model_dump()
        item["recording_url"] = (
            f"/recordings/{os.path.basename(c.recording_path)}" if c.recording_path else None
        )
        result.append(item)
    return result


@router.get("/calls/{call_id}", response_model=CallDetail)
def get_call(call_id: int, db: Session = Depends(get_db)):
    call = db.query(Call).filter(Call.id == call_id).first()
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    return call