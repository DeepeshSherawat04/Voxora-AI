# backend/app/models/schemas.py
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel


class SalesStatus(str, Enum):
    CONVERTED = "Converted"
    INTERESTED = "Interested"
    FOLLOW_UP = "Follow-up Required"
    NOT_INTERESTED = "Not Interested"
    DEMO_REQUESTED = "Demo Requested"
    NO_RESPONSE = "No Response"


class MessageOut(BaseModel):
    sender: str
    text: str
    timestamp: datetime

    model_config = {"from_attributes": True}


class CallStartRequest(BaseModel):
    customer_name: str = "Customer"
    phone: Optional[str] = None
    language: str = "English"
    recording_consent: bool = False


class CallOut(BaseModel):
    id: int
    customer_name: str
    phone: Optional[str]
    language: str
    status: str
    sales_status: Optional[str]
    recording_consent: str
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: int
    summary: Optional[str]
    requirements: Optional[str]
    objections: Optional[str]
    next_steps: Optional[str]
    buying_intent: int
    sentiment: str
    recording_url: Optional[str] = None

    model_config = {"from_attributes": True}


class CallDetail(CallOut):
    messages: List[MessageOut] = []


# Returned by Groq at end of call (stage 5)
class CallSummary(BaseModel):
    summary: str
    requirements: str
    objections: str
    next_steps: str
    sales_status: SalesStatus
    buying_intent: int
    sentiment: str