"""
Dependency Injection providers for FastAPI routes.

Provides:
- get_db: yields an async SQLAlchemy session with commit-on-success / rollback-on-error
- get_redis: yields an async Redis client
- get_session_id: validates the X-Session-ID header
- get_openrouter_key: reads OPENROUTER_API_KEY from settings
- get_agent: resolves an agent slug against the in-memory registry
"""

import logging
import re
from collections.abc import AsyncGenerator
from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

# Compiled once at module import — used by get_session_id to prevent Redis key injection.
_SESSION_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Database engine — created once at module import time and reused across requests.
# ---------------------------------------------------------------------------
# SQLite doesn't support pool_size/max_overflow; only apply them for other databases
_engine_kwargs: dict = {
    "echo": False,
}

if "sqlite" not in settings.DATABASE_URL.lower():
    _engine_kwargs.update({
        "pool_pre_ping": True,
        "pool_size": 10,
        "max_overflow": 20,
    })

# asyncpg does not honour ?sslmode=require as a URL query parameter.
# The correct approach is to pass ssl=True via connect_args when the host
# requires TLS (e.g. DigitalOcean Managed Postgres, Neon, Supabase).
# We also disable asyncpg's prepared-statement cache because all the managed
# Postgres providers above place a connection pooler (pgBouncer in transaction
# mode) in front of the database. In that mode, client-cached prepared
# statements are invalidated on every connection swap, producing intermittent
# `InvalidSQLStatementNameError: prepared statement "__asyncpg_stmt_X__" does
# not exist` errors. statement_cache_size=0 disables the cache entirely.
if settings.DB_SSL_REQUIRE:
    _engine_kwargs["connect_args"] = {
        "ssl": True,
        "statement_cache_size": 0,
    }

_engine = create_async_engine(
    settings.DATABASE_URL,
    **_engine_kwargs,
)

_AsyncSessionFactory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=_engine,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yield an AsyncSession.

    Transaction contract:
    - commit() is called after the route handler returns successfully.
    - rollback() is called on any exception.
    - Route handlers and repositories must NOT call commit() — only flush() if needed.
    """
    async with _AsyncSessionFactory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ---------------------------------------------------------------------------
# Redis connection pool — created once at module import time and reused across
# requests.  Individual clients borrow a connection from the pool and return it
# on aclose(), avoiding a new TCP handshake per request.
# ---------------------------------------------------------------------------
_redis_pool: aioredis.ConnectionPool | None = None


def get_redis_pool() -> aioredis.ConnectionPool:
    """Return the module-level Redis connection pool, initialising it on first call."""
    global _redis_pool
    if _redis_pool is None:
        _redis_pool = aioredis.ConnectionPool.from_url(
            settings.REDIS_URL,
            max_connections=20,
            decode_responses=True,
        )
    return _redis_pool


async def get_redis() -> AsyncGenerator[aioredis.Redis, None]:
    """
    Yield an async Redis client backed by the shared connection pool.

    The client returns its connection to the pool on aclose() — no new TCP
    connection is established per request.
    """
    client: aioredis.Redis = aioredis.Redis(connection_pool=get_redis_pool())
    try:
        yield client
    finally:
        await client.aclose()


# ---------------------------------------------------------------------------
# Session ID validation
# ---------------------------------------------------------------------------
def get_session_id(
    x_session_id: Annotated[str | None, Header(alias="X-Session-ID")] = None,
) -> str:
    """
    Validate the X-Session-ID request header.

    Rules:
    - Must be present and non-empty.
    - Must match [a-zA-Z0-9_-] with a maximum length of 64 characters.

    The strict charset prevents Redis key injection / namespace collision when
    the value is interpolated into keys such as `ratelimit:{session_id}:{endpoint}`.

    Raises:
        HTTPException(400): with code SESSION_ID_MISSING if absent.
        HTTPException(400): with code SESSION_ID_INVALID if the charset/length check fails.
    """
    if not x_session_id or not x_session_id.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SESSION_ID_MISSING",
                "message": "L'header X-Session-ID è obbligatorio e non può essere vuoto.",
                "retry_after_seconds": None,
            },
        )
    if not _SESSION_ID_PATTERN.match(x_session_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SESSION_ID_INVALID",
                "message": (
                    "L'header X-Session-ID deve contenere solo caratteri alfanumerici, "
                    "trattini o underscore, con lunghezza massima di 64 caratteri."
                ),
                "retry_after_seconds": None,
            },
        )
    return x_session_id


# ---------------------------------------------------------------------------
# OpenRouter API key
# ---------------------------------------------------------------------------
def get_openrouter_key() -> str:
    """
    Resolve the server-side OpenRouter API key.

    Raises:
        HTTPException(500): with code NO_API_KEY if the env var is not configured.
    """
    key = settings.OPENROUTER_API_KEY
    if not key or not key.strip():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "NO_API_KEY",
                "message": "La chiave API OpenRouter non è configurata sul server.",
                "retry_after_seconds": None,
            },
        )
    return key


# ---------------------------------------------------------------------------
# Agent resolver
# ---------------------------------------------------------------------------
def get_agent(slug: str) -> "AgentConfig":  # noqa: F821
    """
    Resolve a slug to an AgentConfig from the in-memory registry.

    Raises:
        HTTPException(404): with code AGENT_NOT_FOUND if not found.
    """
    from app.core.agent_registry import AGENTS

    agent = AGENTS.get(slug)
    if agent is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "AGENT_NOT_FOUND",
                "message": f"L'agente '{slug}' non esiste.",
                "retry_after_seconds": None,
            },
        )
    return agent
