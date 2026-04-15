"""
Chat service — orchestrates LLM streaming via Datapizza AI.

Responsibilities:
- Accept session_id, message, optional agent_slug, and conversation_history.
- Load / persist conversation history from Redis (key: chat:history:{session_id}).
- Run Master Agent routing when no agent_slug is provided.
- Stream the selected agent's response as SSE-formatted strings.
- Persist the completed exchange back to Redis with a 30-minute TTL.

SSE event types emitted:
  agent_selected  — {"event": "agent_selected", "data": {"slug": ..., "name": ..., "color_hex": ..., "vibe_label": ...}}
  token           — {"event": "token", "data": {"delta": "..."}}
  done            — {"event": "done", "data": {"conversation_id": "...", "total_tokens": N}}
  error           — {"event": "error", "data": {"code": "...", "message": "..."}}
"""

from __future__ import annotations

import asyncio
import json
import logging
import random
from collections.abc import AsyncGenerator
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import redis.asyncio as aioredis
from datapizza.clients.openai_like import OpenAILikeClient
from datapizza.memory import Memory
from datapizza.type import ROLE, TextBlock

from app.core.agent_registry import AGENTS, AgentConfig
from app.schemas.chat import MessageItem

if TYPE_CHECKING:
    pass

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_MODEL = "openai/gpt-4o-mini"
_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Redis conversation history settings
_HISTORY_KEY_PREFIX = "chat:history"
_HISTORY_TTL_SECONDS = 1800  # 30 minutes
_MAX_HISTORY_TURNS = 20

# Timeout constants (seconds)
_ROUTING_TIMEOUT_SECONDS = 10.0   # H-2: max wait for Master Agent routing call
_STREAM_TIMEOUT_SECONDS = 120.0   # H-2: max wait for full streaming response

# Max token constants
_ROUTING_MAX_TOKENS = 30          # H-1: routing only needs a single slug
_STREAM_MAX_TOKENS = 1024         # H-1: cap generated response length

# Master Agent routing prompt — instructs the LLM to pick the best persona.
_MASTER_ROUTING_SYSTEM_PROMPT = """Sei un router intelligente per un sistema di agenti AI italiani volutamente assurdi.
Il tuo UNICO compito è leggere il messaggio dell'utente e rispondere con esattamente un slug
tra quelli disponibili — senza aggiungere nulla, nessuna spiegazione, nessun punto, nessuna virgola.
Rispondi SOLO con lo slug.

Agenti disponibili:
{agents_list}

Scegli l'agente il cui carattere sarebbe più divertente e appropriato per rispondere
al messaggio dell'utente. Considera il tono, l'argomento e il potenziale comico."""


# ---------------------------------------------------------------------------
# SSE helpers
# ---------------------------------------------------------------------------


def _sse(event_type: str, payload: dict) -> str:
    """Format a single SSE message string."""
    data = json.dumps({"event": event_type, "data": payload}, ensure_ascii=False)
    return f"data: {data}\n\n"


def _sse_agent_selected(agent: AgentConfig) -> str:
    return _sse(
        "agent_selected",
        {
            "slug": agent.slug,
            "name": agent.name,
            "color_hex": agent.color_hex,
            "vibe_label": agent.vibe_label,
        },
    )


def _sse_token(delta: str) -> str:
    return _sse("token", {"delta": delta})


def _sse_done(conversation_id: str, total_tokens: int) -> str:
    return _sse("done", {"conversation_id": conversation_id, "total_tokens": total_tokens})


def _sse_error(code: str, message: str) -> str:
    return _sse("error", {"code": code, "message": message})


# ---------------------------------------------------------------------------
# Redis conversation history helpers
# ---------------------------------------------------------------------------


def _redis_history_key(session_id: str) -> str:
    return f"{_HISTORY_KEY_PREFIX}:{session_id}"


async def load_history_from_redis(session_id: str, redis: aioredis.Redis) -> list[dict]:
    """
    Load the conversation history JSON array from Redis.
    Returns an empty list if the key does not exist or is malformed.
    """
    key = _redis_history_key(session_id)
    raw = await redis.get(key)
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return data
    except (json.JSONDecodeError, TypeError):
        logger.warning("Impossibile decodificare la cronologia Redis per session_id='%s'.", session_id)
    return []


async def save_history_to_redis(
    session_id: str,
    redis: aioredis.Redis,
    history: list[dict],
    new_user_message: str,
    new_assistant_message: str,
    agent_slug: str,
) -> None:
    """
    Append the new user/assistant exchange to the history and persist it.

    Trims to the latest _MAX_HISTORY_TURNS turns (each turn = 2 entries).
    Resets the TTL to _HISTORY_TTL_SECONDS on every write.
    """
    history = list(history)  # defensive copy
    history.append({"role": "user", "content": new_user_message, "agent_slug": agent_slug})
    history.append({"role": "assistant", "content": new_assistant_message, "agent_slug": agent_slug})

    # Keep only the last _MAX_HISTORY_TURNS * 2 entries (user+assistant pairs).
    max_entries = _MAX_HISTORY_TURNS * 2
    if len(history) > max_entries:
        history = history[-max_entries:]

    key = _redis_history_key(session_id)
    await redis.set(key, json.dumps(history, ensure_ascii=False), ex=_HISTORY_TTL_SECONDS)


# ---------------------------------------------------------------------------
# Memory builder
# ---------------------------------------------------------------------------


def _build_memory(conversation_history: list[MessageItem]) -> Memory:
    """Convert the request's conversation_history list into a Datapizza Memory object."""
    memory = Memory()
    for item in conversation_history:
        role = ROLE.USER if item.role == "user" else ROLE.ASSISTANT
        memory.add_turn(TextBlock(content=item.content), role=role)
    return memory


# ---------------------------------------------------------------------------
# Master Agent routing
# ---------------------------------------------------------------------------


async def _route_to_agent(
    message: str,
    api_key: str,
    effective_agents: dict[str, AgentConfig],
    last_agent_slug: str | None = None,
) -> AgentConfig | None:
    """
    Call a fast non-streaming LLM to pick the best agent slug for this message.

    Returns the matched AgentConfig from effective_agents, or None if routing
    fails (caller falls back to a random agent from the same pool).
    """
    if not effective_agents:
        return None

    agents_list = "\n".join(
        f"- {slug}: {agent.name} ({agent.vibe_label}) — {agent.persona_summary}"
        for slug, agent in effective_agents.items()
    )
    continuity_hint = (
        f"\nL'utente stava già conversando con l'agente: {last_agent_slug}. "
        "Preferisci cambiare agente se il messaggio si adatta meglio a un altro — "
        "la varietà è più comica della continuità. "
        "Tieni lo stesso agente solo se il messaggio non suggerisce chiaramente un'alternativa migliore."
        if last_agent_slug
        else ""
    )
    routing_prompt = _MASTER_ROUTING_SYSTEM_PROMPT.format(agents_list=agents_list) + continuity_hint

    client = OpenAILikeClient(
        api_key=api_key,
        model=_MODEL,
        system_prompt=routing_prompt,
        base_url=_OPENROUTER_BASE_URL,
    )

    try:
        # Non-streaming invoke — we only need the slug string back.
        # max_tokens passed here, not in constructor (H-1: single slug needs at most ~30 tokens).
        # H-2: enforce a hard timeout so a hanging OpenRouter call doesn't block the worker.
        response = await asyncio.wait_for(
            client.a_invoke(message, max_tokens=_ROUTING_MAX_TOKENS),
            timeout=_ROUTING_TIMEOUT_SECONDS,
        )
        raw: str = response.text if hasattr(response, "text") else str(response)
        slug = raw.strip().lower().strip('"').strip("'")

        if slug in effective_agents:
            logger.info("Master Agent routing: slug='%s' selezionato per il messaggio.", slug)
            return effective_agents[slug]

        logger.warning(
            "Master Agent ha restituito uno slug sconosciuto: '%s'. Fallback random.",
            slug,
        )
    except asyncio.TimeoutError:
        logger.warning("Master Agent routing timeout dopo %ss. Fallback random.", _ROUTING_TIMEOUT_SECONDS)
    except Exception as exc:
        logger.warning("Master Agent routing fallito (%s). Fallback random.", exc)

    return None


def _random_agent(effective_agents: dict[str, AgentConfig]) -> AgentConfig:
    """Pick a random agent from the effective pool."""
    return random.choice(list(effective_agents.values()))


# ---------------------------------------------------------------------------
# Core streaming generator
# ---------------------------------------------------------------------------


async def stream_chat_response(
    *,
    session_id: str,
    message: str,
    agent_slug: str | None,
    effective_agents: dict[str, AgentConfig],
    conversation_history: list[MessageItem],
    conversation_id: UUID | None,
    api_key: str,
    redis: aioredis.Redis,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.

    Flow:
    1. Resolve the target agent (explicit slug → validate, None → Master Agent routes).
    2. Emit agent_selected event.
    3. Build Memory from conversation_history.
    4. Stream tokens from the agent, emitting token events.
    5. Emit done event and persist history to Redis.
    6. On any upstream error, emit error event and stop.

    Raises:
        HTTPException: Only BEFORE the generator starts (in the calling endpoint).
        All post-start errors are caught and emitted as SSE error events.
    """
    resolved_conversation_id = str(conversation_id) if conversation_id else str(uuid4())

    # ------------------------------------------------------------------
    # Step 1: Resolve agent
    # ------------------------------------------------------------------
    # Pre-load Redis history once here so it can be reused at Step 5, avoiding
    # a second round-trip. Also used to extract the last agent slug for routing hint.
    redis_history = await load_history_from_redis(session_id, redis)

    if agent_slug is not None:
        agent = effective_agents.get(agent_slug)
        if agent is None:
            # Should not reach here normally (validated by endpoint), but guard anyway.
            yield _sse_error(
                "AGENT_NOT_FOUND",
                f"L'agente '{agent_slug}' non è disponibile.",
            )
            return
    else:
        # Extract the last agent the user was talking to as a continuity hint.
        last_agent_slug: str | None = next(
            (entry["agent_slug"] for entry in reversed(redis_history) if "agent_slug" in entry),
            None,
        )
        # Master Agent routing
        agent = await _route_to_agent(message, api_key, effective_agents, last_agent_slug=last_agent_slug)
        if agent is None:
            agent = _random_agent(effective_agents)
            logger.info("Fallback random: agente '%s' selezionato.", agent.slug)

    # ------------------------------------------------------------------
    # Step 2: Emit agent_selected
    # ------------------------------------------------------------------
    yield _sse_agent_selected(agent)

    # ------------------------------------------------------------------
    # Step 3: Build memory from request conversation_history
    # ------------------------------------------------------------------
    memory = _build_memory(conversation_history)

    # ------------------------------------------------------------------
    # Step 4: Stream response tokens
    # ------------------------------------------------------------------
    client = OpenAILikeClient(
        api_key=api_key,
        model=_MODEL,
        system_prompt=agent.persona_description,
        base_url=_OPENROUTER_BASE_URL,
    )

    full_response_parts: list[str] = []
    token_count = 0

    try:
        # H-2: asyncio.timeout enforces a deadline over the entire stream, including
        # per-chunk stalls (asyncio.wait_for cannot wrap async generators directly).
        # max_tokens passed here, not in constructor (H-1: cap response length).
        async with asyncio.timeout(_STREAM_TIMEOUT_SECONDS):
            async for chunk in client.a_stream_invoke(message, memory=memory, max_tokens=_STREAM_MAX_TOKENS):
                if chunk.delta:
                    full_response_parts.append(chunk.delta)
                    token_count += 1
                    yield _sse_token(chunk.delta)
    except asyncio.TimeoutError:
        logger.error(
            "Timeout streaming LLM per agent='%s' session='%s' dopo %ss.",
            agent.slug,
            session_id,
            _STREAM_TIMEOUT_SECONDS,
        )
        yield _sse_error(
            "UPSTREAM_TIMEOUT",
            "La risposta ha impiegato troppo tempo. Riprova.",
        )
        return
    except Exception as exc:
        logger.error(
            "Errore upstream LLM per agent='%s' session='%s': %s",
            agent.slug,
            session_id,
            exc,
            exc_info=True,
        )
        yield _sse_error(
            "UPSTREAM_LLM_ERROR",
            "Si è verificato un errore durante la generazione della risposta. Riprova.",
        )
        return

    # ------------------------------------------------------------------
    # Step 5: Emit done and persist history
    # ------------------------------------------------------------------
    yield _sse_done(resolved_conversation_id, token_count)

    # Persist asynchronously — best-effort; don't let storage errors propagate.
    # redis_history was already loaded at Step 1 — no second Redis round-trip needed.
    full_response = "".join(full_response_parts)
    try:
        await save_history_to_redis(
            session_id=session_id,
            redis=redis,
            history=redis_history,
            new_user_message=message,
            new_assistant_message=full_response,
            agent_slug=agent.slug,
        )
    except Exception as exc:
        logger.warning(
            "Impossibile salvare la cronologia su Redis per session='%s': %s",
            session_id,
            exc,
        )
