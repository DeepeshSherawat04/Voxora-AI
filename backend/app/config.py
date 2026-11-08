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


settings = Settings()