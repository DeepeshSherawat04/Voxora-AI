# backend/app/auth.py
"""
Google Sign-In for Voxora AI.

Flow:
 1. Frontend shows the Google button and gets a Google ID token ("credential").
 2. Frontend POSTs it to /auth/google.
 3. We VERIFY it with Google (signature + audience = our client id + expiry),
    then return OUR OWN session token (JWT, 7 days).
 4. Every other API call sends:  Authorization: Bearer <our token>
    (WebSockets and <audio> tags can't set headers, so they use ?token=...)

Env vars (set on Render):
    GOOGLE_CLIENT_ID   - OAuth "Web application" client id from Google Cloud
    JWT_SECRET         - long random string (python -c "import secrets; print(secrets.token_urlsafe(48))")
"""
from app.config import settings
import os
import time

import jwt  # PyJWT (already in your requirements.txt)
from fastapi import APIRouter, Header, HTTPException, Query, WebSocket
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel

JWT_ALG = "HS256"
JWT_TTL_SECONDS = 7 * 24 * 3600

router = APIRouter(prefix="/auth", tags=["auth"])


def _secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret or len(secret) < 32:
        raise HTTPException(500, "Server auth is not configured (JWT_SECRET).")
    return secret


def _client_id() -> str:
    cid = os.getenv("GOOGLE_CLIENT_ID")
    if not cid:
        raise HTTPException(500, "Server auth is not configured (GOOGLE_CLIENT_ID).")
    return cid


class GoogleLogin(BaseModel):
    credential: str


@router.post("/google")
def google_login(body: GoogleLogin):
    try:
        info = id_token.verify_oauth2_token(
            body.credential, google_requests.Request(), _client_id()
        )
    except ValueError:
        raise HTTPException(401, "Invalid Google sign-in. Please try again.")

    if not info.get("email_verified"):
        raise HTTPException(401, "Your Google email is not verified.")
    
    email = (info.get("email") or "").lower()
    allowed = {e.strip().lower() for e in settings.ALLOWED_EMAILS.split(",") if e.strip()}
    if allowed and email not in allowed:
        raise HTTPException(403, "This Google account is not authorized for Voxora AI.")
    
    user = {
        "id": info["sub"],  # stable, unique Google account id
        "email": info.get("email", ""),
        "name": info.get("name") or info.get("email", ""),
        "picture": info.get("picture", ""),
    }
    now = int(time.time())
    token = jwt.encode(
        {**user, "iat": now, "exp": now + JWT_TTL_SECONDS},
        _secret(),
        algorithm=JWT_ALG,
    )
    return {"token": token, "user": user}


def _decode(token: str) -> dict:
    try:
        data = jwt.decode(token, _secret(), algorithms=[JWT_ALG])
    except jwt.PyJWTError:
        raise HTTPException(401, "Session expired. Please sign in again.")
    return {k: data[k] for k in ("id", "email", "name", "picture") if k in data}


def current_user(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> dict:
    """FastAPI dependency: use as  user: dict = Depends(current_user)."""
    raw = token
    if authorization and authorization.lower().startswith("bearer "):
        raw = authorization[7:].strip()
    if not raw:
        raise HTTPException(401, "Please sign in.")
    return _decode(raw)


async def ws_user(websocket: WebSocket) -> dict | None:
    """For WebSocket routes. Call BEFORE websocket.accept():
         user = await ws_user(websocket)
         if not user: return
    """
    raw = websocket.query_params.get("token")
    try:
        if not raw:
            raise HTTPException(401)
        return _decode(raw)
    except HTTPException:
        await websocket.close(code=4401)
        return None