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


settings = Settings()