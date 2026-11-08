# backend/app/main.py
import os
import threading
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.models.database import init_db
from app.routes import calls, history, agents


def _warm_models():
    """Load the embedding model + Chroma in the background so the first real
    request is fast. Runs AFTER the port is open, so Render's port scan passes."""
    try:
        from app.rag import rag_pipeline as rp
        rp._embedder()
        rp._collection()
        print("[startup] RAG models warmed up")
    except Exception as e:  # never crash the server because of warm-up
        print(f"[startup] RAG warm-up skipped: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    os.makedirs(settings.RECORDINGS_DIR, exist_ok=True)
    if os.getenv("WARM_MODELS", "true").lower() == "true":
        threading.Thread(target=_warm_models, daemon=True).start()
    yield
    # ---- shutdown (nothing to clean up) ----


app = FastAPI(
    title="Voxora AI — AI Voice Sales Agent",
    version="1.0.0",
    lifespan=lifespan,
)

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

# serves saved recordings at /recordings/<filename>
# (mounted at import time; the folder must exist before StaticFiles is created)
os.makedirs(settings.RECORDINGS_DIR, exist_ok=True)
app.mount(
    "/recordings",
    StaticFiles(directory=settings.RECORDINGS_DIR),
    name="recordings",
)

app.include_router(calls.router)
app.include_router(history.router)
app.include_router(agents.router)


@app.get("/health")
def health():
    return {"status": "ok", "product": settings.PRODUCT_NAME}