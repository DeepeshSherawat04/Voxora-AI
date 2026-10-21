# backend/app/models/database.py
import os
from datetime import datetime

from sqlalchemy import (
    Column, Integer, String, Text, DateTime, ForeignKey, create_engine
)
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

from app.config import settings

# The 6 statuses required by the assignment
SALES_STATUSES = [
    "Converted", "Interested", "Follow-up Required",
    "Not Interested", "Demo Requested", "No Response",
]

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Call(Base):
    __tablename__ = "calls"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String(120), default="Customer")
    phone = Column(String(30), nullable=True)
    language = Column(String(40), default="English")

    status = Column(String(20), default="in_call")          # in_call / ended
    sales_status = Column(String(30), nullable=True)        # one of SALES_STATUSES
    recording_consent = Column(String(20), default="pending")  # pending / given / declined

    started_at = Column(DateTime, default=datetime.utcnow, index=True)
    ended_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)

    recording_path = Column(String(255), nullable=True)

    # AI pipeline output (shown in the AI Summary panel)
    summary = Column(Text, nullable=True)
    requirements = Column(Text, nullable=True)
    objections = Column(Text, nullable=True)
    next_steps = Column(Text, nullable=True)
    buying_intent = Column(Integer, default=0)   # 0-100, drives the LIVE BUYING INTENT bar
    sentiment = Column(String(20), default="Neutral")  # Positive / Neutral / Negative

    messages = relationship(
        "Message", back_populates="call",
        cascade="all, delete-orphan",
        order_by="Message.timestamp",
    )


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    call_id = Column(Integer, ForeignKey("calls.id", ondelete="CASCADE"), index=True)
    sender = Column(String(20))              # "ai" | "customer" | "system"
    text = Column(Text)
    timestamp = Column(DateTime, default=datetime.utcnow)

    call = relationship("Call", back_populates="messages")


def init_db():
    """Create tables + recordings folder if missing."""
    os.makedirs(settings.RECORDINGS_DIR, exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()