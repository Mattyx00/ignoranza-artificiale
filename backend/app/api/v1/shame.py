"""
Hall of Shame endpoints:
  GET  /api/v1/shame               — paginated gallery
  GET  /api/v1/shame/{slug}        — single entry detail
  POST /api/v1/shame               — submit / upsert entry
  POST /api/v1/shame/{slug}/upvote — upvote an entry
"""

import logging
import math
import secrets
from typing import Annotated, Literal

import redis.asyncio as aioredis
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request, status
from slugify import slugify
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.agent_registry import AGENTS
from app.core.dependencies import get_db, get_redis, get_session_id
from app.core.security import get_client_ip
from app.repositories.shame_repository import ShameRepository
from app.repositories.upvote_repository import UpvoteRepository
from app.schemas.shame import (
    PaginationMeta,
    ShameEntryCard,
    ShameEntryCreate,
    ShameEntryDetail,
    ShameListResponse,
    ShameSubmitResponse,
)
from app.schemas.upvotes import UpvoteResponse
from app.services.rate_limiter import rate_limiter

# NOTE: rate_limiter, get_redis and get_session_id are intentionally NOT used
# on the two public read endpoints (GET /shame and GET /shame/{slug}) because
# they are called server-side by Next.js without a session cookie and must
# remain unauthenticated.

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/shame", tags=["shame"])

# Accepts both legacy (4-char hex, token_hex(2)) and current (11-char URL-safe
# base64, token_urlsafe(8)) suffixes. Legacy form is preserved for backward
# compatibility with public URLs shared before slug entropy was increased.
_SLUG_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*-([0-9a-f]{4}|[A-Za-z0-9_-]{11})$"

# Upvote Redis key TTL: 90 days in seconds.
_UPVOTE_TTL_SECONDS = 90 * 24 * 3600


def _generate_slug(title: str) -> str:
    """Generate a URL-safe slug from a title with an 11-char random suffix.

    Uses ``secrets.token_urlsafe(8)`` which yields ~48 bits of entropy encoded
    as 11 URL-safe base64 characters (A-Za-z0-9_-), making the slug space
    infeasible to enumerate by brute-force (vs the previous token_hex(2) which
    only covered ~65 k values).
    """
    base = slugify(title, max_length=100, separator="-", lowercase=True)
    suffix = secrets.token_urlsafe(8)  # 8 bytes → 11 URL-safe base64 chars (~48 bits)
    return f"{base}-{suffix}"


def _extract_preview(transcript: list) -> str:
    """Return the content of the first agent message, truncated to 200 chars."""
    for msg in transcript:
        role = msg.get("role") if isinstance(msg, dict) else getattr(msg, "role", None)
        if role == "agent":
            content = msg.get("content") if isinstance(msg, dict) else getattr(msg, "content", "")
            return content[:200]
    return ""


# ---------------------------------------------------------------------------
# GET /shame
# ---------------------------------------------------------------------------
@router.get("", response_model=ShameListResponse)
async def list_shame_entries(
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, description="Numero pagina (1-indexed)"),
    page_size: int = Query(default=20, ge=1, le=50, description="Elementi per pagina"),
    sort: Literal["newest", "top"] = Query(default="newest", description="Ordinamento"),
    agent_slug: str | None = Query(default=None, description="Filtra per slug agente"),
) -> ShameListResponse:
    # Public read endpoint — no session or rate-limit check required.

    # Map API sort param to repository sort_by.
    sort_by: Literal["recent", "top"] = "top" if sort == "top" else "recent"

    repo = ShameRepository(db)
    entries, total = await repo.get_paginated(
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        agent_slug_filter=agent_slug,
    )

    total_pages = max(1, math.ceil(total / page_size))

    cards = [
        ShameEntryCard(
            id=entry.id,
            slug=entry.slug,
            title=entry.title,
            agent_slugs=entry.agent_slugs,
            upvote_count=entry.upvote_count,
            is_featured=entry.is_featured,
            preview=_extract_preview(entry.transcript),
            created_at=entry.created_at,
        )
        for entry in entries
    ]

    return ShameListResponse(
        entries=cards,
        pagination=PaginationMeta(
            page=page,
            page_size=page_size,
            total_entries=total,
            total_pages=total_pages,
        ),
    )


# ---------------------------------------------------------------------------
# GET /shame/{slug}
# ---------------------------------------------------------------------------
@router.get(
    "/{slug}",
    response_model=ShameEntryDetail,
    responses={404: {"description": "Entry non trovata"}},
)
async def get_shame_entry(
    slug: Annotated[str, Path(pattern=_SLUG_PATTERN)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShameEntryDetail:
    # Public read endpoint — no session or rate-limit check required.
    repo = ShameRepository(db)
    entry = await repo.get_by_slug(slug)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ENTRY_NOT_FOUND",
                "message": f"Nessuna entry trovata con slug '{slug}'.",
                "retry_after_seconds": None,
            },
        )

    return ShameEntryDetail(
        id=entry.id,
        slug=entry.slug,
        title=entry.title,
        agent_slugs=entry.agent_slugs,
        upvote_count=entry.upvote_count,
        is_featured=entry.is_featured,
        transcript=entry.transcript,
        created_at=entry.created_at,
    )


# ---------------------------------------------------------------------------
# POST /shame
# ---------------------------------------------------------------------------
@router.post(
    "",
    response_model=ShameSubmitResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        200: {"description": "Entry aggiornata (conversation_id già esistente)"},
        201: {"description": "Nuova entry creata"},
        403: {"description": "Vietato — conversation_id appartiene a un'altra sessione"},
        422: {"description": "Transcript non valido"},
    },
)
async def submit_shame_entry(
    request: Request,
    body: ShameEntryCreate,
    session_id: Annotated[str, Depends(get_session_id)],
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ShameSubmitResponse:
    client_ip = get_client_ip(request)
    if client_ip is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to determine client IP",
        )
    await rate_limiter.check_rate_limit(
        session_id=session_id,
        client_ip=client_ip,
        redis=redis,
        endpoint_key="shame_submit",
        session_limit=3,
        ip_limit=10,
    )

    # --- Validate agent slugs against in-memory registry ---
    for slug in body.agent_slugs:
        if slug not in AGENTS:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "INVALID_TRANSCRIPT",
                    "message": f"Lo slug agente '{slug}' non è registrato.",
                    "retry_after_seconds": None,
                },
            )

    # --- Validate agent messages in transcript ---
    for msg in body.transcript:
        if msg.role == "agent":
            if msg.agent_slug not in AGENTS:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "INVALID_TRANSCRIPT",
                        "message": f"Lo slug agente '{msg.agent_slug}' nel transcript non è registrato.",
                        "retry_after_seconds": None,
                    },
                )
            # Agent name integrity check.
            expected_name = AGENTS[msg.agent_slug].name
            if msg.agent_name != expected_name:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail={
                        "code": "INVALID_TRANSCRIPT",
                        "message": (
                            f"Il nome agente '{msg.agent_name}' non corrisponde "
                            f"a quello registrato ('{expected_name}') per lo slug '{msg.agent_slug}'."
                        ),
                        "retry_after_seconds": None,
                    },
                )

    # --- Check Redis for active conversation history (H2 validation) ---
    redis_history_key = f"chat:history:{session_id}"
    history_exists = await redis.exists(redis_history_key)
    if not history_exists:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "CONVERSATION_NOT_FOUND",
                "message": "Nessuna conversazione attiva trovata per questa sessione. La sessione potrebbe essere scaduta.",
                "retry_after_seconds": None,
            },
        )

    # --- Upsert ---
    generated_slug = _generate_slug(body.title)
    repo = ShameRepository(db)
    entry, is_new = await repo.upsert(
        conversation_id=body.conversation_id,
        submitter_session_id=session_id,
        data=body,
        generated_slug=generated_slug,
    )

    # Ownership conflict — another session owns this conversation_id.
    if not is_new and entry.submitter_session_id != session_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "FORBIDDEN",
                "message": "Questa conversazione appartiene a un'altra sessione.",
                "retry_after_seconds": None,
            },
        )

    response = ShameSubmitResponse(
        id=entry.id,
        slug=entry.slug,
        title=entry.title,
        public_url=f"/hall-of-shame/{entry.slug}",
        created_at=entry.created_at,
    )

    # FastAPI uses the route-level status_code for all responses from this handler.
    # To return 200 on update vs 201 on insert we use a Response object trick.
    from fastapi.responses import JSONResponse

    if not is_new:
        return JSONResponse(
            content=response.model_dump(mode="json"),
            status_code=status.HTTP_200_OK,
        )

    return response


# ---------------------------------------------------------------------------
# POST /shame/{slug}/upvote
# ---------------------------------------------------------------------------
@router.post(
    "/{slug}/upvote",
    response_model=UpvoteResponse,
    responses={
        409: {"description": "Hai già votato questa entry"},
        404: {"description": "Entry non trovata"},
    },
)
async def upvote_shame_entry(
    request: Request,
    slug: Annotated[str, Path(pattern=_SLUG_PATTERN)],
    session_id: Annotated[str, Depends(get_session_id)],
    redis: Annotated[aioredis.Redis, Depends(get_redis)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UpvoteResponse:
    client_ip = get_client_ip(request)
    if client_ip is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unable to determine client IP",
        )
    await rate_limiter.check_rate_limit(
        session_id=session_id,
        client_ip=client_ip,
        redis=redis,
        endpoint_key="shame_upvote",
        session_limit=10,
        ip_limit=30,
    )

    # Step 1: Resolve slug → entry.
    shame_repo = ShameRepository(db)
    entry = await shame_repo.get_by_slug(slug)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ENTRY_NOT_FOUND",
                "message": f"Nessuna entry trovata con slug '{slug}'.",
                "retry_after_seconds": None,
            },
        )

    # Step 2: Redis fast-path check for duplicate upvote.
    redis_upvote_key = f"upvote:{entry.id}:{session_id}"
    already_voted = await redis.exists(redis_upvote_key)
    if already_voted:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_UPVOTED",
                "message": "Hai già votato questa entry.",
                "retry_after_seconds": None,
            },
        )

    # Step 3: Insert upvote + atomic counter increment.
    upvote_repo = UpvoteRepository(db)
    try:
        new_count = await upvote_repo.add_vote(
            entry_id=entry.id,
            voter_session_id=session_id,
        )
    except IntegrityError:
        # UNIQUE constraint race condition — treat as already upvoted.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "ALREADY_UPVOTED",
                "message": "Hai già votato questa entry.",
                "retry_after_seconds": None,
            },
        )

    # Step 4: Persist the Redis upvote marker (90 days TTL).
    await redis.set(redis_upvote_key, "1", ex=_UPVOTE_TTL_SECONDS)

    return UpvoteResponse(slug=slug, upvote_count=new_count)
