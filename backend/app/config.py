# backend/app/config.py
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "openai/gpt-oss-120b"
    DATABASE_URL: str = "postgresql://postgres:postgres123@localhost:5432/voxora"
    RECORDINGS_DIR: str = "recordings"
    PRODUCT_NAME: str = "CloudDesk CRM"

    # Email (MCP server reads the same .env directly; listed here so the
    # rest of the app can check they exist without importing os everywhere)
    SENDER_EMAIL: str = ""
    GMAIL_APP_PASSWORD: str = ""
    MEETING_LINK: str = ""
    DEMO_LINK: str = ""
    CHECKPOINT_DB_URL: str = ""   # optional; MemorySaver when empty
    AGENTS_API_KEY: str = ""   # if set, follow-up endpoints require X-API-Key header
    ALLOWED_EMAILS: str = ""
        # Sarvam AI (TTS now, STT next)
    SARVAM_API_KEY: str = ""
    SARVAM_TTS_MODEL: str = "bulbul:v4-flash"
    SARVAM_TTS_SPEAKER: str = "simran_en_sales"
    SARVAM_LANGUAGE: str = "en-IN"
    SARVAM_STT_MODEL: str = "saaras:v4"

    STT_KEYTERMS: str = "CloudDesk,Voxora,CRM,Aria"
    STT_SILENCE_MS: int = 1200
    STT_THRESHOLD: float = 0.3
    STT_MIN_SPEECH_MS: int = 250


settings = Settings()