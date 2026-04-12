from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # No defaults for secrets/credentials — the app MUST fail loudly if .env is missing.
    DATABASE_URL: str
    REDIS_URL: str
    OPENROUTER_API_KEY: str

    CORS_ORIGINS: list[AnyHttpUrl] = ["http://localhost:3000"]
    HTTPS_ENABLED: bool = False


settings = Settings()
