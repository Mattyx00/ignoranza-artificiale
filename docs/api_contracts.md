# API Contracts — Ignoranza Artificiale

**Base URL:** `/api/v1`
**Protocol:** HTTP/1.1 + SSE for streaming endpoint
**Content-Type (default):** `application/json`
**Auth model:** No client auth. No JWT. No BYOK. The OpenRouter API key is managed exclusively server-side via `OPENROUTER_API_KEY` env var.

---

## Global Headers

| Header | Required | Description |
|---|---|---|
| `Content-Type` | Yes (on POST/PUT) | Must be `application/json` |
| `X-Session-ID` | Yes (on chat + shame endpoints) | Anonymous UUID generated client-side, stored in `localStorage`. Used for rate limiting and upvote deduplication. Must be a valid UUIDv4. |

---

## CORS Policy

FastAPI's `CORSMiddleware` is configured with allowed origins read from the `CORS_ORIGINS` environment variable.

| Setting | Value |
|---|---|
| `allow_origins` | Populated from `settings.CORS_ORIGINS` (comma-separated list of allowed origins) |
| `allow_credentials` | `True` |
| `allow_methods` | `["GET", "POST"]` |
| `allow_headers` | `["Content-Type", "X-Session-ID"]` |

**Rules:**
- `allow_origins=["*"]` is NEVER permitted in production — the wildcard disables credentials and exposes the API to arbitrary cross-origin requests.
- Development default: `CORS_ORIGINS=http://localhost:3000`.
- Production: set `CORS_ORIGINS` to the public frontend domain (e.g. `https://ignoranza-artificiale.com`).

The `CORS_ORIGINS` env var is defined as `list[AnyHttpUrl]` in `core/config.py` using Pydantic V2's comma-separated list parsing (`env_prefix` field with `__` separator is not used — the value is a plain comma-separated string that Pydantic parses into a list).

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
| `FORBIDDEN` | `403` | `conversation_id` exists but belongs to a different session |
| `INTERNAL_ERROR` | `500` | Unhandled server-side error |
| `UPSTREAM_LLM_ERROR` | `502` | OpenRouter API returned an error |
| `NO_API_KEY` | `500` | `OPENROUTER_API_KEY` env var not configured on the server — infrastructure misconfiguration, not a client error |
| `SESSION_ID_MISSING` | `400` | `X-Session-ID` header is missing or invalid |
| `INVALID_TRANSCRIPT` | `422` | Submitted transcript fails structure validation |
| `CONVERSATION_NOT_FOUND` | `422` | No active conversation found for this session/conversation_id pair |

---

## Rate Limiting Rules

Rate limits are enforced on two independent layers. Both must be satisfied for a request to proceed.

### Layer 1 — Session-based (per-identity)

Redis sliding window counters keyed on `ratelimit:{session_id}:{endpoint_key}`. Single threshold — no BYOK/fallback distinction since all traffic uses the server-side key.

| Endpoint | Limit |
|---|---|
| `POST /api/v1/chat/stream` | 10 req / 60 s |
| `POST /api/v1/shame` | 3 req / 60 s |
| `POST /api/v1/shame/{slug}/upvote` | 10 req / 60 s |
| `GET /api/v1/shame` | 60 req / 60 s |
| `GET /api/v1/shame/{slug}` | 60 req / 60 s |
| `GET /api/v1/agents` | 60 req / 60 s |

### Layer 2 — IP-based (hard ceiling)

A secondary rate limiting layer is applied on top of the session layer, keyed on the client IP address resolved from `request.client.host`. Redis key schema: `ratelimit:{ip}:{endpoint_key}` with a sliding TTL of 60 s.

| Endpoint | Hard Ceiling |
|---|---|
| `POST /api/v1/chat/stream` | 30 req / 60 s |
| All other endpoints | 60 req / 60 s |

The IP layer is an absolute hard ceiling. The session-based layer is the tighter per-identity limit sitting below it. A request is rejected as soon as either layer's threshold is exceeded.

**Trusted proxy requirement:** The deployment must pass the real client IP via `X-Forwarded-For`. The reverse proxy (Nginx) must be configured as a trusted proxy so that `request.client.host` reflects the actual client address, not the container-internal IP. Without this configuration the IP layer collapses all traffic onto a single address and the ceiling becomes useless.

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
      "contributor_name": "Matteo Sacco",
      "persona_summary": "Risponde solo citando procedure inesistenti e moduli da compilare in triplice copia."
    },
    {
      "slug": "il-complottista",
      "name": "Il Complottista",
      "vibe_label": "Paranoico",
      "color_hex": "#8B0000",
      "contributor_github": "xX_matteo_99_Xx",
      "contributor_name": "Matteo Sacco",
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
| `contributor_github` | `string` | GitHub handle of the contributor, e.g. `matteo-sacco`. The frontend builds the profile URL as `` `https://github.com/${contributor_github}` ``. |
| `contributor_name` | `string` | Display name of the contributor, e.g. `Matteo Sacco`. May differ from the GitHub handle. |
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

**Event types (authoritative naming — backend is the source of truth):**

**`agent_selected`** — Emitted once when routing is complete (before the first token).

```
data: {"event": "agent_selected", "agent": {"slug": "il-burocrate", "name": "Il Burocrate", "color_hex": "#4A90D9", "vibe_label": "Incompetente Procedurale"}}
```

**`token`** — Emitted for each streamed chunk from the LLM. The text delta is in the `delta` field.

```
data: {"event": "token", "delta": "Ha"}

data: {"event": "token", "delta": " compilato"}

data: {"event": "token", "delta": " il modulo?"}
```

> **Frontend contract:** The frontend MUST read `event.delta` for text chunks. The field is named `delta`, NOT `content` and NOT `chunk`. The event name is `token`, NOT `chunk`.

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
| `500` | `NO_API_KEY` | `OPENROUTER_API_KEY` env var missing — server misconfiguration |
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
  "conversation_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
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
| `conversation_id` | `string (UUIDv4)` | Yes | Must be a valid UUIDv4 | Generated client-side in memory when the chat starts. Drives upsert logic server-side: same ID = update existing entry, new ID = insert. Lost on page refresh by design — the user cannot re-save a previous chat after refreshing. |
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

#### Response `200 OK` (upsert — entry updated) / `201 Created` (new entry)

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "slug": "il-burocrate-vs-la-mia-pazienza-a3f9",
  "title": "Il Burocrate vs la mia pazienza",
  "public_url": "/hall-of-shame/il-burocrate-vs-la-mia-pazienza-a3f9",
  "created_at": "2026-04-12T10:01:00Z"
}
```

- `201 Created` — first save for this `conversation_id`.
- `200 OK` — `conversation_id` already exists and the entry was updated in place. The `slug` and `public_url` are unchanged.

| Field | Type | Description |
|---|---|---|
| `id` | `string (UUID)` | Internal record ID |
| `slug` | `string` | The generated public slug |
| `title` | `string` | Persisted title |
| `public_url` | `string` | Frontend path for sharing |
| `created_at` | `string (ISO 8601)` | Original submission timestamp (not updated on subsequent saves) |

#### Slug Generation Rules

The slug is generated server-side as: `{slugified-title}-{4-char-random-hex}`.
Example: `"Il Burocrate vs la mia pazienza"` → `il-burocrate-vs-la-mia-pazienza-a3f9`.
Uniqueness is enforced by the DB `UNIQUE` constraint. If a collision occurs (extremely rare), regenerate.

#### Implementation Notes

- Each slug in `agent_slugs` and each `agent_slug` inside `transcript` items with `role: "agent"` is validated against the in-memory registry (`core/agent_registry.AGENTS`) at submission time. An unrecognised slug triggers a `422 INVALID_TRANSCRIPT` response.
- **Transcript cross-reference validation (H2):** before accepting any submission, the backend must verify that the `conversation_id` corresponds to an active Redis history key `chat:history:{session_id}`. If the key does not exist (session expired or the conversation never happened), the submission is rejected immediately with `422 CONVERSATION_NOT_FOUND`. This prevents fabricated or replayed transcripts from being submitted after a session has expired.
- **Agent name integrity check:** for every message with `role: "agent"`, the `agent_name` field must match exactly the `name` field of the agent identified by `agent_slug` in the in-memory registry. A mismatch between `agent_slug` and `agent_name` (e.g. a tampered display name) triggers `422 INVALID_TRANSCRIPT`. Validation is performed against `core/agent_registry.AGENTS`, not the DB.
- **Upsert logic:** before inserting, the backend queries `hall_of_shame_entries` by `conversation_id`. If a row is found AND its `submitter_session_id` matches the current `X-Session-ID`, the existing entry is updated (`transcript`, `title`, `agent_slugs`, `updated_at`) and the original `slug` is returned. If a row is found but the `submitter_session_id` does not match, the request is rejected with `403 FORBIDDEN` — a third party cannot overwrite someone else's entry even if they know the `conversation_id`. If no row is found, a new entry is inserted.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `403` | `FORBIDDEN` | `conversation_id` already exists but `submitter_session_id` does not match |
| `422` | `VALIDATION_ERROR` | Body fails validation |
| `422` | `INVALID_TRANSCRIPT` | Transcript structure invalid (e.g., no agent messages, unknown agent slug, or agent_name/agent_slug mismatch) |
| `422` | `CONVERSATION_NOT_FOUND` | No Redis history found for this conversation_id + session_id pair |
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
| `is_featured` | `boolean` | Editorial pin — featured cards get `col-span-2` treatment in the frontend gallery grid |
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
| `slug` | `string` | The entry's public slug. Must match pattern `^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$`. |

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

#### Implementation Notes

- The `slug` path parameter is validated with `Path(..., pattern=r'^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$')` in FastAPI. Slugs not conforming to this pattern return `422 VALIDATION_ERROR` without touching the database.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `404` | `ENTRY_NOT_FOUND` | No entry with this slug (or entry is hidden) |
| `422` | `VALIDATION_ERROR` | Slug does not match the required pattern |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |

---

### `POST /api/v1/shame/{slug}/upvote`

**Purpose:** Increments the upvote counter for a Hall of Shame entry. Each `X-Session-ID` can upvote a given entry only once. The check is performed in Redis first (fast path) and enforced by a DB unique constraint (safe path).

#### Request

**Path Parameters:**

| Param | Type | Description |
|---|---|---|
| `slug` | `string` | The entry's public slug. Must match pattern `^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$`. |

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

1. Validate `X-Session-ID` header is a valid UUIDv4. Validate `slug` path parameter against pattern `^[a-z0-9]+(-[a-z0-9]+)*-[0-9a-f]{4}$` — return `422 VALIDATION_ERROR` immediately if non-conforming (no DB hit).
2. Check Redis key `upvote:{entry_id}:{session_id}` — if present, return `409 ALREADY_UPVOTED`.
3. Resolve slug to `entry_id` from DB (or Redis cache if available).
4. Insert a row into `shame_upvotes` (DB unique constraint acts as a safety net). If the INSERT raises an `IntegrityError` (UNIQUE constraint violation due to a race condition), the backend must catch the exception, execute a rollback, and return `409 ALREADY_UPVOTED` without incrementing `upvote_count`.
5. Execute `UPDATE hall_of_shame_entries SET upvote_count = upvote_count + 1 WHERE id = :entry_id`.
6. Set Redis key `upvote:{entry_id}:{session_id}` with TTL of 90 days.
7. Return updated `upvote_count`.

#### Error Responses

| Status | Code | Condition |
|---|---|---|
| `400` | `SESSION_ID_MISSING` | `X-Session-ID` header missing/invalid |
| `404` | `ENTRY_NOT_FOUND` | No entry with this slug |
| `409` | `ALREADY_UPVOTED` | This session has already upvoted (Redis fast path or DB IntegrityError race condition) |
| `422` | `VALIDATION_ERROR` | Slug does not match the required pattern |
| `429` | `RATE_LIMIT_EXCEEDED` | Rate limit hit |
| `500` | `INTERNAL_ERROR` | DB write failed |

---

## Redis Key Conventions

| Key Pattern | TTL | Purpose |
|---|---|---|
| `ratelimit:{session_id}:{endpoint_key}` | Sliding 60 s | Session-based rate limiting counters |
| `ratelimit:{ip}:{endpoint_key}` | Sliding 60 s | IP-based rate limiting (hard ceiling layer) |
| `chat:history:{session_id}` | 30 min (reset on activity) | Ephemeral conversation history |
| `upvote:{entry_id}:{session_id}` | 90 days | Prevent duplicate upvotes |
| `agents:all` | 5 min | Cache of active agents list |

---

## Pydantic V2 Schema Summary

The following Pydantic schemas map directly to the request/response contracts above. They are defined in `/backend/app/schemas/`.

| Schema Name | Used In | Direction |
|---|---|---|
| `AgentPublic` | `GET /agents` | Response — includes `contributor_github` (handle) and `contributor_name` (display name) |
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

1. **OpenRouter key:** Resolved in a FastAPI dependency `get_openrouter_key() -> str` in `core/dependencies.py`. Reads `settings.OPENROUTER_API_KEY` from the environment. If not set, raises `NO_API_KEY` (`500` — infrastructure misconfiguration). No `X-OpenRouter-Key` header is accepted from clients.

2. **Session ID validation:** Implemented as a FastAPI dependency `get_session_id(x_session_id: str = Header(...)) -> UUID` that validates the header is a well-formed UUIDv4.

3. **Rate Limiter:** Implemented in `core/rate_limiter.py` as a reusable `Depends()` factory. The implementation uses an **atomic Lua script** executed via `redis.evalsha()` to avoid the classic `INCR + EXPIRE` race condition (if the process crashes between the two commands on a new key, the key remains with no TTL and the rate limit becomes permanent for that session). The Lua script atomically increments the counter and sets the TTL only if the key is new. `slowapi` is explicitly NOT used — the custom Lua approach keeps the dual-threshold BYOK/server-fallback logic under direct control without adding an extra dependency.

4. **SSE Streaming:** Use `fastapi.responses.StreamingResponse` with `media_type="text/event-stream"`. Each yielded chunk is formatted as `data: {json}\n\n`. The response **must** include the header `X-Accel-Buffering: no` — without it, Nginx buffers SSE responses in the Docker production environment and tokens arrive in bursts instead of streaming token-by-token (silent bug in dev, broken UX in prod). The async generator that yields tokens must **not** hold an open `AsyncSession`; all DB operations must complete before the generator begins yielding.

5. **Repository Pattern:** DB access for `hall_of_shame_entries` and `shame_upvotes` goes through repository classes in `app/repositories/`, injected via `Depends()`. No raw SQL in routers. Canonical paths: `app/repositories/shame_repository.py`, `app/repositories/upvote_repository.py`, `app/repositories/base_repository.py`.

6. **Agent Registry (no DB repository):** Agents are loaded exclusively from YAML files located at `/backend/agents/{slug}.yaml`. On application startup, `core/agent_registry.load_agents_from_yaml()` reads all files and populates the module-level dict `core/agent_registry.AGENTS: dict[str, AgentConfig]`. The loader must fail fast if it detects duplicate slugs or a mismatch between a file's base name and the `slug` field declared inside the YAML. There is no `AgentRepository`; the FastAPI dependency `get_agent(slug: str) -> AgentConfig` reads directly from `core/agent_registry.AGENTS` and raises `AGENT_NOT_FOUND` (404) if the slug is absent.

7. **`get_db()` transaction contract:** The `get_db()` dependency in `core/dependencies.py` yields an `AsyncSession`. `commit()` is called inside the `try` block after the route handler completes successfully. If any exception is raised, `rollback()` is called in the `except` block. Route handlers and repository methods must NOT call `commit()` directly — use `flush()` when the generated PK is needed before the transaction ends (e.g. in the upvote endpoint: `INSERT shame_upvotes` then `UPDATE upvote_count` must be atomic within a single session).

8. **Settings (Pydantic V2):** `core/config.py` defines `Settings(BaseSettings)` using Pydantic V2 syntax: `model_config = SettingsConfigDict(env_file='.env', env_file_encoding='utf-8')`. A module-level singleton `settings = Settings()` is instantiated once at import time. Do NOT use the legacy `class Config` inner class pattern (Pydantic V1 style) — it still compiles but is not V2-idiomatic and will cause confusion.

9. **Pydantic V2 in repositories:** All repository methods that convert a Pydantic schema to a dict must use `.model_dump()` (not the deprecated `.dict()`). For partial updates: `.model_dump(exclude_unset=True)`. Applies to `BaseRepository.create()` and `BaseRepository.update()`.

10. **Testing database:** Tests run against a real PostgreSQL 16 instance (`db_test` Docker Compose service, database `test_ignoranza_artificiale`). SQLite in-memory is NOT used — the schema uses PostgreSQL-specific types (`JSONB`, native arrays, `gen_random_uuid()`). Schema is applied via `alembic upgrade head` in a session-scoped pytest fixture. Tables are truncated (not dropped/recreated) between tests for speed. The `get_db()` dependency override in conftest yields a real `AsyncSession` connected to the test database. `Base.metadata.create_all()` is FORBIDDEN in tests as well.

11. **Security Headers (M2):** The FastAPI application must include a middleware (implemented in `core/middleware.py`) that appends the following headers to every response. This is a Phase 3 requirement.

    | Header | Value |
    |---|---|
    | `X-Content-Type-Options` | `nosniff` |
    | `X-Frame-Options` | `DENY` |
    | `Referrer-Policy` | `strict-origin-when-cross-origin` |
    | `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (HTTPS/production only) |

    The `Strict-Transport-Security` header must NOT be emitted in local development (HTTP). Controlled via `settings.HTTPS_ENABLED: bool`.

12. **Request Body Size Limit (H4):** Request bodies larger than 1 MB must be rejected before reaching route handlers. Two enforcement layers are required:
    - **Nginx (reverse proxy):** `client_max_body_size 1m;` in the `location` block that proxies to the backend service.
    - **FastAPI middleware:** a custom middleware in `core/middleware.py` reads `Content-Length` and, if it exceeds 1 048 576 bytes (1 MiB), returns `413 Request Entity Too Large` immediately without parsing the body. This ensures the limit is enforced even when Nginx is bypassed (e.g. direct container access during development).

13. **Environment Variables (backend `core/config.py`):** In addition to the variables listed in the Docker/infra documentation, `Settings` must declare the following security-related fields:
    - `CORS_ORIGINS: list[AnyHttpUrl]` — comma-separated list of allowed CORS origins. Development default: `http://localhost:3000`.
    - `HTTPS_ENABLED: bool` — controls emission of `Strict-Transport-Security` header. Default: `False` in development, `True` in production.
