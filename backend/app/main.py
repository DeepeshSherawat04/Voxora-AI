# backend/app/main.py
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.models.database import init_db
from app.routes import calls, history

app = FastAPI(title="Voxora AI — AI Voice Sales Agent", version="1.0.0")

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
# comma-separated extra origins from env (set your Vercel URL on Render)
if os.getenv("ALLOWED_ORIGINS"):
    ALLOWED_ORIGINS += [
        o.strip() for o in os.getenv("ALLOWED_ORIGINS").split(",") if o.strip()
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    os.makedirs(settings.RECORDINGS_DIR, exist_ok=True)
    # serves saved recordings at /recordings/<filename> (used in Stage 5)
    app.mount("/recordings", StaticFiles(directory=settings.RECORDINGS_DIR),
              name="recordings")


app.include_router(calls.router)
app.include_router(history.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "product": settings.PRODUCT_NAME}