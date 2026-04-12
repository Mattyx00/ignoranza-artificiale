# API Contracts — Ignoranza Artificiale

**Base URL:** `/api/v1`
**Protocol:** HTTP/1.1 + SSE for streaming endpoint
**Content-Type (default):** `application/json`
**Auth model:** BYOK via `X-OpenRouter-Key` header. No session-based auth. No JWT.

---

## Global Headers

| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes (on POST/PUT) | Must be `application/json` |
| `X-OpenRouter-Key` | Conditional | User's personal OpenRouter API key. If omitted, the server falls back to its own `OPENROUTER_API_KEY` env var and applies stricter rate limiting. |
| `X-Session-ID` | Yes (on chat + shame endpoints) | Anonymous UUID generated client-side, stored in `localStorage`. Used for rate limiting and upvote deduplication. Must be a valid UUIDv4. |

---

## Global Error Response Schema

All error responses follow this envelope:

```json
{
  "detail": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Hai fatto troppe richieste. Riprova tra 60 secondi.",
    "retry_after_seconds": 60
  }
}
```

| Field | Type | Description |
|---|---|---|
| `detail.code` | `string` | Machine-readable error code (see codes below) |
| `detail.message` | `string` | Human-readable message in Italian |
| `detail.retry_after_seconds` | `integer \| null` | Only present on `429` responses |

### Error Codes

| Code | HTTP Status | Description |
|---|---|---|
| `VALIDATION_ERROR` | `422` | Request body failed Pydantic validation |
| `RATE_LIMIT_EXCEEDED` | `429` | Too many requests (see rate limiting section) |
| `AGENT_NOT_FOUND` | `404` | The requested agent slug does not exist |
| `ENTRY_NOT_FOUND` | `404` | The requested Hall of Shame entry does not exist |
| `ALREADY_UPVOTED` | `409` | This session has already upvoted this entry |
| `INTERNAL_ERROR` | `500` | Unhandled server-side error |
| `UPSTREAM_LLM_ERROR` | `502` | OpenRouter API returned an error |
| `NO_API_KEY` | `403` | No `X-OpenRouter-Key` provided and no server-side fallback configured |
| `SESSION_ID_MISSING` | `400` | `X-Session-ID` header is missing or invalid |
| `INVALID_TRANSCRIPT` | `422` | Submitted transcript fails structure validation |

---

## Rate Limiting Rules

Rate limits are enforced via Redis sliding window counters keyed on `{session_id}:{endpoint}`.

| Endpoint | With `X-OpenRouter-Key` (BYOK) | Without Key (Server Fallback) |
|---|---|---|
| `POST /api/v1/chat/stream` | 30 req / 60 s | 3 req / 60 s |
| `POST /api/v1/shame` | 5 req / 60 s | 2 req / 60 s |
| `POST /api/v1/shame/{slug}/upvote` | 20 req / 60 s | 10 req / 60 s |
| `GET /api/v1/shame` | 60 req / 60 s | 60 req / 60 s |
| `GET /api/v1/shame/{slug}` | 60 req / 60 s | 60 req / 60 s |
| `GET /api/v1/agents` | 60 req / 60 s | 60 req / 60 s |

When a limit is exceeded, the server returns `429` with a `Retry-After` header and `retry_after_seconds` in the body.

---

## Endpoints

---

### `GET /api/v1/agents`

**Purpose:** Returns the list of all active AI agents with their full metadata (name, persona summary, vibe, color, contributor handle). Used to populate the agent roster sidebar in the UI.

#### Request

No body. No path params.

**Headers:**

| Header | Required |
|---|---|
| `X-Session-ID` | Yes |

**Query Parameters:** None.

#### Response `200 OK`

```json
{
  "agents": [
    {
      "slug": "il-burocrate",
      "name": "Il Burocrate",
      "vibe_label": "Incompetente Procedurale",
      "color_hex": "#4A90D9",
      "contributor_github": "matteo-sacco",
      "persona_summary": "Risponde solo citando procedure inesistenti e moduli da compilare in triplice copia."
    },
    {
      "slug": "il-complottista",
      "name": "Il Complottista",
      "vibe_label": "Paranoico",
      "color_hex": "#8B0000",
      "contributor_github": "another-dev",
      "persona_summary": "Vede connessioni oscure in ogni messaggio dell'utente."
    }
  ]
}
```

**Response Schema:**

| Field | Type | Description |
|---|---|---|
| `agents` | `AgentPublic[]` | Array of active agent objects |

**`AgentPublic` object:**

| Field | Type | Description |
|---|---|---|
| `slug` | `string` | URL-safe unique identifier |
| `name` | `string` | Display name in Italian |
| `vibe_label` | `string` | Short vibe descriptor in Italian |
| `color_hex` | `string` | CSS hex color `#RRGGBB` |
| `contributor_github` | `string` | GitHub handle of the contributor |
| `persona_summary` | `string` | Short excerpt of persona (max 200 chars). NOT the full system prompt. |

**Note:** The full `persona_description` (system prompt) is never exposed to the client.

#### Implementation Notes

- The response is served from the in-memory agent registry (`core/agent_registry.AGENTS`), populated at startup via `core/agent_registry.load_agents_from_yaml()`. No DB query is performed.
- Redis cache key `agents:all` (TTL 5 min) remains valid as an optional optimisation layer, but the authoritative source is always the in-memory registry. If the cache is cold, the registry is read directly and the result may optionally be written back to Redis.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |
| `500` | `INTERNAL_ERROR` | Registry failed to load at startup |

---

### `POST /api/v1/chat/stream`

**Purpose:** Initiates a streaming chat session via Server-Sent Events (SSE). The backend routes the user message to the most appropriate agent (or a specified one), constructs the LLM prompt, calls OpenRouter, and streams tokens back to the client.

This endpoint is ephemeral: no DB write occurs here. Conversation history is stored in Redis, keyed by `X-Session-ID`, and expires after 30 minutes of inactivity.

#### Request

**Headers:**

| Header | Required | Notes |
|---|---|---|
| `X-OpenRouter-Key` | Conditional | If absent, server uses its own key with stricter rate limits |
| `X-Session-ID` | Yes | Must be a valid UUIDv4 |
| `Content-Type` | Yes | `application/json` |

**Request Body:**

```json
{
  "message": "Ho bisogno di un certificato di esistenza in vita.",
  "agent_slug": "il-burocrate",
  "conversation_history": [
    {
      "role": "user",
      "content": "Ciao!"
    },
    {
      "role": "assistant",
      "content": "Buongiorno. Ha il numero di protocollo?"
    }
  ]
}
```

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `message` | `string` | Yes | 1–4000 chars | The user's current message |
| `agent_slug` | `string \| null` | No | Must be a valid active agent slug if provided; validated against the in-memory registry | Force routing to a specific agent. If `null`, the Master Agent selects the most appropriate one. |
| `conversation_history` | `MessageItem[]` | No | Max 40 items | Previous messages to provide context. Client manages this state. |

**`MessageItem` object:**

| Field | Type | Required | Constraints |
|---|---|---|---|
| `role` | `"user" \| "assistant"` | Yes | Enum |
| `content` | `string` | Yes | 1–4000 chars |

#### Response `200 OK` — SSE Stream

**Content-Type:** `text/event-stream`

The response is an SSE stream. Each event is a JSON object on a `data:` line.

**Event types:**

**`agent_selected`** — Emitted once at the start when routing is complete.

```
data: {"event": "agent_selected", "agent": {"slug": "il-burocrate", "name": "Il Burocrate", "color_hex": "#4A90D9", "vibe_label": "Incompetente Procedurale"}}
```

**`token`** — Emitted for each streamed token from the LLM.

```
data: {"event": "token", "delta": "Ha"}

data: {"event": "token", "delta": " compilato"}

data: {"event": "token", "delta": " il modulo?"}
```

**`done`** — Emitted once when streaming is complete. Contains the full assembled message and a `session_id` confirmation.

```
data: {"event": "done", "full_message": "Ha compilato il modulo IA/7-bis in triplice copia?", "session_id": "550e8400-e29b-41d4-a716-446655440000"}
```

**`error`** — Emitted if a recoverable error occurs mid-stream.

```
data: {"event": "error", "code": "UPSTREAM_LLM_ERROR", "message": "Il servizio di IA è momentaneamente indisponibile."}
```

#### Error Responses (pre-stream, standard JSON)

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `403` | `NO_API_KEY` | No BYOK key and no server-side fallback configured |
| `404` | `AGENT_NOT_FOUND` | `agent_slug` provided but does not exist or is inactive |
| `422` | `VALIDATION_ERROR` | Request body fails validation |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit exceeded |
| `502` | `UPSTREAM_LLM_ERROR` | OpenRouter returned an error before streaming began |

---

### `POST /api/v1/shame`

**Purpose:** Submits a completed conversation to the Hall of Shame gallery. Validates the transcript, generates a unique public slug, persists to PostgreSQL, and returns the entry's public URL.

#### Request

**Headers:**

| Header | Required |
|---|---|
| `X-Session-ID` | Yes |
| `Content-Type` | Yes — `application/json` |

**Request Body:**

```json
{
  "title": "Il Burocrate vs la mia pazienza",
  "transcript": [
    {
      "role": "user",
      "content": "Ho bisogno di un certificato.",
      "timestamp": "2026-04-12T10:00:00Z"
    },
    {
      "role": "agent",
      "agent_slug": "il-burocrate",
      "agent_name": "Il Burocrate",
      "content": "Ha il modulo IA/7-bis compilato in triplice copia?",
      "timestamp": "2026-04-12T10:00:05Z"
    }
  ],
  "agent_slugs": ["il-burocrate"]
}
```

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `title` | `string` | Yes | 3–256 chars | Title for the gallery card |
| `transcript` | `TranscriptMessage[]` | Yes | 2–200 items | The full conversation. Must have at least one `user` and one `agent` message. |
| `agent_slugs` | `string[]` | Yes | 1–10 items, each max 64 chars | List of agent slugs that participated |

**`TranscriptMessage` object:**

| Field | Type | Required | Condition |
|---|---|---|---|
| `role` | `"user" \| "agent"` | Yes | Always |
| `content` | `string` | Yes | 1–4000 chars |
| `timestamp` | `string (ISO 8601)` | Yes | Always |
| `agent_slug` | `string` | Conditional | Required when `role` is `"agent"` |
| `agent_name` | `string` | Conditional | Required when `role` is `"agent"` |

#### Response `201 Created`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "il-burocrate-vs-la-mia-pazienza-a3f9",
  "title": "Il Burocrate vs la mia pazienza",
  "public_url": "/hall-of-shame/il-burocrate-vs-la-mia-pazienza-a3f9",
  "created_at": "2026-04-12T10:01:00Z"
}
```

| Field | Type | Description |
|---|---|---|
| `id` | `string (UUID)` | Internal record ID |
| `slug` | `string` | The generated public slug |
| `title` | `string` | Persisted title |
| `public_url` | `string` | Frontend path for sharing |
| `created_at` | `string (ISO 8601)` | Submission timestamp |

#### Slug Generation Rules

The slug is generated server-side as: `{slugified-title}-{4-char-random-hex}`.
Example: `"Il Burocrate vs la mia pazienza"` → `il-burocrate-vs-la-mia-pazienza-a3f9`.
Uniqueness is enforced by the DB `UNIQUE` constraint. If a collision occurs (extremely rare), regenerate.

#### Implementation Notes

- Each slug in `agent_slugs` and each `agent_slug` inside `transcript` items with `role: "agent"` is validated against the in-memory registry (`core/agent_registry.AGENTS`) at submission time. An unrecognised slug triggers a `422 INVALID_TRANSCRIPT` response.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `422` | `VALIDATION_ERROR` | Body fails validation |
| `422` | `INVALID_TRANSCRIPT` | Transcript structure invalid (e.g., no agent messages, or unknown agent slug) |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |
| `500` | `INTERNAL_ERROR` | DB write failed |

---

### `GET /api/v1/shame`

**Purpose:** Returns a paginated list of Hall of Shame entries for the gallery. Supports sorting by newest or most upvoted.

#### Request

**Headers:**

| Header | Required |
|---|---|
| `X-Session-ID` | Yes |

**Query Parameters:**

| Param | Type | Required | Default | Constraints | Description |
|---|---|---|---|---|---|
| `page` | `integer` | No | `1` | `>= 1` | Page number (1-indexed) |
| `page_size` | `integer` | No | `20` | `1–50` | Items per page |
| `sort` | `string` | No | `"newest"` | `"newest" \| "top"` | Sort order |
| `agent_slug` | `string` | No | — | Valid agent slug | Filter by agent |

#### Response `200 OK`

```json
{
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "slug": "il-burocrate-vs-la-mia-pazienza-a3f9",
      "title": "Il Burocrate vs la mia pazienza",
      "agent_slugs": ["il-burocrate"],
      "upvote_count": 42,
      "preview": "Ha compilato il modulo IA/7-bis in triplice copia?",
      "created_at": "2026-04-12T10:01:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_entries": 157,
    "total_pages": 8
  }
}
```

**`ShameEntryCard` object (list item):**

| Field | Type | Description |
|---|---|---|
| `id` | `string (UUID)` | Internal ID |
| `slug` | `string` | Public slug |
| `title` | `string` | Gallery card title |
| `agent_slugs` | `string[]` | Agents involved |
| `upvote_count` | `integer` | Current upvote count |
| `preview` | `string` | First agent message content, truncated to 200 chars |
| `created_at` | `string (ISO 8601)` | Submission timestamp |

**Note:** The full `transcript` is NOT returned in list view. Only in the detail endpoint.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `422` | `VALIDATION_ERROR` | Invalid query params |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |

---

### `GET /api/v1/shame/{slug}`

**Purpose:** Returns the full detail of a single Hall of Shame entry, including the complete transcript. Used by the shareable public page.

#### Request

**Path Parameters:**

| Param | Type | Description |
|---|---|---|
| `slug` | `string` | The entry's public slug |

**Headers:**

| Header | Required |
|---|---|
| `X-Session-ID` | Yes |

#### Response `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "il-burocrate-vs-la-mia-pazienza-a3f9",
  "title": "Il Burocrate vs la mia pazienza",
  "agent_slugs": ["il-burocrate"],
  "upvote_count": 42,
  "is_featured": false,
  "transcript": [
    {
      "role": "user",
      "content": "Ho bisogno di un certificato.",
      "timestamp": "2026-04-12T10:00:00Z"
    },
    {
      "role": "agent",
      "agent_slug": "il-burocrate",
      "agent_name": "Il Burocrate",
      "content": "Ha il modulo IA/7-bis compilato in triplice copia?",
      "timestamp": "2026-04-12T10:00:05Z"
    }
  ],
  "created_at": "2026-04-12T10:01:00Z"
}
```

**`ShameEntryDetail` object:**

| Field | Type | Description |
|---|---|---|
| `id` | `string (UUID)` | Internal ID |
| `slug` | `string` | Public slug |
| `title` | `string` | Title |
| `agent_slugs` | `string[]` | Agents involved |
| `upvote_count` | `integer` | Current upvote count |
| `is_featured` | `boolean` | Editorial featured flag |
| `transcript` | `TranscriptMessage[]` | Full ordered conversation |
| `created_at` | `string (ISO 8601)` | Submission timestamp |

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `404` | `ENTRY_NOT_FOUND` | No entry with this slug (or entry is hidden) |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |

---

### `POST /api/v1/shame/{slug}/upvote`

**Purpose:** Increments the upvote counter for a Hall of Shame entry. Each `X-Session-ID` can upvote a given entry only once. The check is performed in Redis first (fast path) and enforced by a DB unique constraint (safe path).

#### Request

**Path Parameters:**

| Param | Type | Description |
|---|---|---|
| `slug` | `string` | The entry's public slug |

**Headers:**

| Header | Required |
|---|---|
| `X-Session-ID` | Yes |

No request body.

#### Response `200 OK`

```json
{
  "slug": "il-burocrate-vs-la-mia-pazienza-a3f9",
  "upvote_count": 43
}
```

| Field | Type | Description |
|---|---|---|
| `slug` | `string` | The entry slug |
| `upvote_count` | `integer` | New upvote count after increment |

#### Upvote Logic (server-side)

1. Validate `X-Session-ID` header is a valid UUIDv4.
2. Check Redis key `upvote:{entry_id}:{session_id}` — if present, return `409 ALREADY_UPVOTED`.
3. Resolve slug to `entry_id` from DB (or Redis cache if available).
4. Insert a row into `shame_upvotes` (DB unique constraint acts as a safety net).
5. Execute `UPDATE hall_of_shame_entries SET upvote_count = upvote_count + 1 WHERE id = :entry_id`.
6. Set Redis key `upvote:{entry_id}:{session_id}` with TTL of 90 days.
7. Return updated `upvote_count`.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `404` | `ENTRY_NOT_FOUND` | No entry with this slug |
| `409` | `ALREADY_UPVOTED` | This session has already upvoted |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |
| `500` | `INTERNAL_ERROR` | DB write failed |

---

## Redis Key Conventions

| Key Pattern | TTL | Purpose |
|---|---|---|
| `ratelimit:{session_id}:{endpoint_key}` | Sliding 60 s | Rate limiting counters |
| `chat:history:{session_id}` | 30 min (reset on activity) | Ephemeral conversation history |
| `upvote:{entry_id}:{session_id}` | 90 days | Prevent duplicate upvotes |
| `agents:all` | 5 min | Cache of active agents list |

---

## Pydantic V2 Schema Summary

The following Pydantic schemas map directly to the request/response contracts above. They are defined in `/backend/app/schemas/`.

| Schema Name | Used In | Direction |
|---|---|---|
| `AgentPublic` | `GET /agents` | Response |
| `AgentsListResponse` | `GET /agents` | Response |
| `ChatRequest` | `POST /chat/stream` | Request |
| `MessageItem` | `ChatRequest` | Nested |
| `SSEEvent` | `POST /chat/stream` | SSE Response |
| `ShameSubmitRequest` | `POST /shame` | Request |
| `TranscriptMessage` | `ShameSubmitRequest`, DB | Nested / JSONB |
| `ShameSubmitResponse` | `POST /shame` | Response |
| `ShameEntryCard` | `GET /shame` | Response |
| `ShameListResponse` | `GET /shame` | Response |
| `PaginationMeta` | `GET /shame` | Nested in Response |
| `ShameEntryDetail` | `GET /shame/{slug}` | Response |
| `UpvoteResponse` | `POST /shame/{slug}/upvote` | Response |
| `ErrorDetail` | All error responses | Response |

---

## Implementation Notes for Phase 3

1. **BYOK Key extraction:** Implemented in a FastAPI dependency `get_openrouter_key(request: Request) -> str` in `core/dependencies.py`. It reads `X-OpenRouter-Key` first, falls back to `settings.OPENROUTER_API_KEY`, and raises `NO_API_KEY` if neither is set. It also sets a flag on the request state (`request.state.is_byok = True/False`) that the rate limiter reads to choose the appropriate threshold.

2. **Session ID validation:** Implemented as a FastAPI dependency `get_session_id(x_session_id: str = Header(...)) -> UUID` that validates the header is a well-formed UUIDv4.

3. **Rate Limiter:** Implemented as a FastAPI middleware or a reusable `Depends()` factory in `core/rate_limiter.py` using Redis `INCR` + `EXPIRE` (or a Lua script for atomicity).

4. **SSE Streaming:** Use `fastapi.responses.StreamingResponse` with `media_type="text/event-stream"`. Each yielded chunk is formatted as `data: {json}\n\n`.

5. **Repository Pattern:** DB access for `hall_of_shame_entries` and `shame_upvotes` goes through repository classes in `db/repositories/`, injected via `Depends()`. No raw SQL in routers.

6. **Agent Registry (no DB repository):** Agents are loaded exclusively from YAML files located at `/backend/agents/{slug}.yaml`. On application startup, `core/agent_registry.load_agents_from_yaml()` reads all files and populates the module-level dict `core/agent_registry.AGENTS: dict[str, AgentConfig]`. The loader must fail fast if it detects duplicate slugs or a mismatch between a file's base name and the `slug` field declared inside the YAML. There is no `AgentRepository`; the FastAPI dependency `get_agent(slug: str) -> AgentConfig` reads directly from `core/agent_registry.AGENTS` and raises `AGENT_NOT_FOUND` (404) if the slug is absent.
