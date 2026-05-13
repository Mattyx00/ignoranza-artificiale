from pydantic import AnyHttpUrl
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # No defaults for secrets/credentials — the app MUST fail loudly if .env is missing.
    DATABASE_URL: str
    REDIS_URL: str
    OPENROUTER_API_KEY: str

    # SSL — required by DigitalOcean Managed Postgres.
    # asyncpg does not honour ?sslmode=require as a query parameter; SSL must be
    # passed via connect_args={"ssl": True} at engine-creation time instead.
    # Set DB_SSL_REQUIRE=true in any environment that uses a TLS-only Postgres host.
    DB_SSL_REQUIRE: bool = False

    # CORS — development default: http://localhost:3000
    # In production: set CORS_ORIGINS to the public frontend domain.
    CORS_ORIGINS: list[AnyHttpUrl] = ["http://localhost:3000"]

    # Security headers
    HTTPS_ENABLED: bool = False

    # Trusted hosts — MUST be set explicitly in production.
    # Example: ALLOWED_HOSTS=yourdomain.com,api.yourdomain.com
    # An empty list causes TrustedHostMiddleware to reject all requests, so
    # this must be populated before running in any environment.
    ALLOWED_HOSTS: list[str] = []

    # OpenAPI/Swagger docs — disabled by default (production-safe).
    # Set DOCS_ENABLED=true only in development environments.
    DOCS_ENABLED: bool = False

    # Reverse-proxy trust — controls whether X-Forwarded-For is honoured.
    # Set TRUST_PROXY=true ONLY when the application sits behind a trusted reverse
    # proxy (Nginx, Traefik, AWS ALB, DO Load Balancer) that is the sole public
    # entry point AND that proxy overwrites/strips client-supplied XFF headers.
    # Leaving this false prevents rate-limit bypass via header spoofing.
    TRUST_PROXY: bool = False

    # Rate limiting — sliding window thresholds applied server-wide (no BYOK).
    RATE_LIMIT_REQUESTS: int = 20
    RATE_LIMIT_WINDOW_SECONDS: int = 60


settings = Settings()
