# Database Schema — Ignoranza Artificiale

**Engine:** PostgreSQL 16
**ORM:** SQLAlchemy 2.x (mapped classes, not legacy `declarative_base` style)
**Migrations:** Alembic only. `Base.metadata.create_all()` is FORBIDDEN.

---

## Tables Overview

| Table | Purpose |
|---|---|
| `hall_of_shame_entries` | Completed chat transcripts submitted by users for public sharing |
| `shame_upvotes` | Tracks individual upvote events to prevent duplicate upvotes per session |

> **Note:** Agents are NOT stored in PostgreSQL. See the [Agent Registry](#agent-registry) section below.

---

## Agent Registry

Agents are defined as static YAML files and loaded into memory at application startup. There is no `agents` table in PostgreSQL.

### File Location

```
/backend/agents/{slug}.yaml
```

Each file defines exactly one agent persona. The filename (without extension) must exactly match the `slug` field declared inside the file. This correspondence is validated at load time.

### YAML Structure

```yaml
# /backend/agents/il-burocrate.yaml
slug: il-burocrate
name: Il Burocrate
vibe_label: Incompetente Procedurale
color_hex: "#4A90D9"
contributor_github: matteo-sacco
contributor_name: Matteo Sacco
persona_summary: Risponde solo citando procedure inesistenti.
persona_description: |
  Sei Il Burocrate. Rispondi SEMPRE chiedendo moduli,
  numeri di protocollo e firme in triplice copia...
```

### Field Reference

| Field | Type | Required | Constraints | Description |
|---|---|---|---|---|
| `slug` | `string` | YES | Lowercase letters and hyphens only (`^[a-z0-9]+(-[a-z0-9]+)*$`). Must match the filename. | URL-safe identifier, e.g. `il-burocrate` |
| `name` | `string` | YES | Max 128 chars | Display name shown in UI, in Italian, e.g. `Il Burocrate` |
| `vibe_label` | `string` | YES | Max 64 chars | Short label describing the agent's attitude, e.g. `Incompetente Procedurale` |
| `color_hex` | `string` | YES | Must match `^#[0-9A-Fa-f]{6}$` | Hex color code for UI theming, e.g. `#4A90D9` |
| `contributor_github` | `string` | YES | Max 128 chars | GitHub handle of the agent's author, e.g. `matteo-sacco`. The profile URL is derived as `https://github.com/{contributor_github}`. |
| `contributor_name` | `string` | YES | Max 128 chars | Display name of the agent's author, e.g. `Matteo Sacco` |
| `persona_summary` | `string` | YES | Max 256 chars | One-line description shown in UI agent cards |
| `persona_description` | `string` | YES | No length limit. Must be in Italian. | Full LLM system prompt injected at runtime |

### Loading Mechanism — `core/agent_registry.py`

All YAML files under `/backend/agents/` are loaded once at application startup into an in-memory registry with the following type signature:

```python
dict[str, AgentConfig]  # key = slug
```

`AgentConfig` is the Pydantic V2 model defined in `core/agent_registry.py` (not in `schemas/` — it is an internal configuration model, not a request/response schema). It is distinct from `AgentPublic`, which is the response schema in `schemas/agents.py` and omits `persona_description`.

**Validation rules enforced by the loader:**

1. **Filename-slug match:** If the filename stem does not equal the `slug` field inside the file, the loader raises a `ValueError` identifying the offending file and both values.
2. **Duplicate slug detection (fail fast):** If two files declare the same `slug`, the app does NOT start. The loader raises a `ValueError` that explicitly names both conflicting files.
3. **Field validation:** Each YAML file is parsed into a Pydantic V2 `Agent` model. Any missing required field or constraint violation (e.g. invalid `color_hex` format, non-lowercase `slug`) raises a `ValidationError` that prevents startup.

Example fail-fast error for a duplicate slug:

```
ValueError: Duplicate agent slug 'il-burocrate' found in both
  'il-burocrate.yaml' and 'il-burocrate-v2.yaml'.
  Each slug must be unique across all agent files.
```

Example fail-fast error for a filename-slug mismatch:

```
ValueError: Filename stem 'il-burocrate-old' does not match slug 'il-burocrate'
  declared inside 'il-burocrate-old.yaml'. Rename the file or fix the slug.
```

---

## Table: `hall_of_shame_entries`

Stores completed chat transcripts submitted by users. Each row represents one publicly shareable conversation.

### Columns

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY | `gen_random_uuid()` | Surrogate PK |
| `conversation_id` | `UUID` | UNIQUE, NOT NULL | — | Client-generated UUID created in memory when the chat starts. Used to upsert: same ID = update transcript, new ID = insert. Lost on page refresh by design. |
| `slug` | `VARCHAR(128)` | UNIQUE, NOT NULL | — | Human-readable public URL slug, auto-generated, e.g. `il-burocrate-vs-matteo-a3f9` |
| `title` | `VARCHAR(256)` | NOT NULL | — | User-provided or auto-generated title for the gallery card |
| `transcript` | `JSONB` | NOT NULL | — | Full ordered array of chat messages (see structure below) |
| `agent_slugs` | `VARCHAR(64)[]` | NOT NULL | `'{}'` | Postgres array of agent slugs involved in this conversation |
| `submitter_session_id` | `VARCHAR(128)` | NOT NULL | — | Session ID of the user who submitted the conversation. Populated from the `X-Session-ID` header at submission time. NOT NULL — the `get_session_id()` dependency guarantees it is always present before the route handler is invoked. |
| `upvote_count` | `INTEGER` | NOT NULL | `0` | Denormalized counter, updated atomically |
| `is_featured` | `BOOLEAN` | NOT NULL | `FALSE` | Manual editorial flag for pinning entries at the top of the gallery |
| `is_hidden` | `BOOLEAN` | NOT NULL | `FALSE` | Soft-delete / moderation flag |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Submission timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Last update (e.g., after upvote counter sync) |

### `transcript` JSONB Structure

The `transcript` column stores an ordered array of message objects. Each object has the following shape:

```json
[
  {
    "role": "user",
    "content": "Ciao, ho bisogno di un certificato.",
    "timestamp": "2026-04-12T10:00:00Z"
  },
  {
    "role": "agent",
    "agent_slug": "il-burocrate",
    "agent_name": "Il Burocrate",
    "content": "Ha compilato il modulo IA/7-bis in triplice copia?",
    "timestamp": "2026-04-12T10:00:05Z"
  }
]
```

Allowed `role` values: `"user"` | `"agent"`.
When `role` is `"agent"`, the fields `agent_slug` and `agent_name` are required.

### Indexes

| Index Name | Columns | Type | Notes |
|---|---|---|---|
| `ix_shame_conversation_id` | `conversation_id` | UNIQUE B-TREE | Upsert deduplication |
| `ix_shame_slug` | `slug` | UNIQUE B-TREE | Public URL lookup |
| `ix_shame_created_at` | `created_at DESC` | B-TREE | Chronological gallery pagination |
| `ix_shame_upvote_count` | `upvote_count DESC` | B-TREE | "Top" sort in gallery |
| `ix_shame_is_hidden` | `is_hidden` | B-TREE | Filtering hidden entries |
| `ix_shame_agent_slugs` | `agent_slugs` | GIN | Filter gallery by agent |

### Notes

- `upvote_count` is a denormalized counter incremented atomically via `UPDATE ... SET upvote_count = upvote_count + 1`. No recount query needed for display.
- `agent_slugs` stores a snapshot of the agent identifiers at submission time. No FK constraint so the gallery remains intact even if an agent YAML file is later removed.
- The `transcript` JSONB is validated at the application layer (Pydantic) before insert.
- `conversation_id` is the deduplication key for upsert logic. The `UNIQUE` constraint at DB level is the safety net; the application layer performs the upsert check before attempting an insert. An update is only allowed when **both** `conversation_id` and `submitter_session_id` match the existing row — preventing a third party from overwriting someone else's entry even if they know the `conversation_id`.
- `submitter_session_id` is NOT NULL. The `get_session_id()` FastAPI dependency validates and resolves the `X-Session-ID` header before any route handler runs, so a null value can never reach the DB. The initial Alembic migration must define this column with `NOT NULL` (no server default).

---

## Table: `shame_upvotes`

Tracks upvote events to enforce one-upvote-per-session-per-entry. This is a lightweight anti-spam measure, not a strict authentication system.

### Columns

| Column | Type | Constraints | Default | Description |
|---|---|---|---|---|
| `id` | `UUID` | PRIMARY KEY | `gen_random_uuid()` | Surrogate PK |
| `entry_id` | `UUID` | NOT NULL, FK → `hall_of_shame_entries.id` ON DELETE CASCADE | — | The entry being upvoted |
| `voter_session_id` | `VARCHAR(128)` | NOT NULL | — | Anonymous session ID from browser (localStorage or cookie) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL | `NOW()` | Timestamp of the upvote |

### Indexes

| Index Name | Columns | Type | Notes |
|---|---|---|---|
| `ix_upvotes_entry_id` | `entry_id` | B-TREE | FK lookup |
| `uq_upvotes_entry_voter` | `(entry_id, voter_session_id)` | UNIQUE B-TREE | Prevent duplicate upvotes from the same session |

### Relationships

```
shame_upvotes.entry_id  →  hall_of_shame_entries.id  (N:1, CASCADE DELETE)
```

### Notes

- The `UNIQUE` constraint on `(entry_id, voter_session_id)` is the database-level enforcement. The API layer should also check via Redis before hitting the DB to avoid unnecessary write contention.
- `voter_session_id` is a client-generated UUID stored in `localStorage`. It is **not** a user authentication token.

---

## Entity-Relationship Summary

```
Agent Registry (in-memory)
  └── loaded from /backend/agents/*.yaml at startup
  └── referenced by slug in hall_of_shame_entries.agent_slugs[] (denormalized, no FK)

hall_of_shame_entries (1) ─────── (N) shame_upvotes
                                         (via entry_id FK, CASCADE DELETE)
```

---

## Repository Layer

DB access for `hall_of_shame_entries` and `shame_upvotes` goes exclusively through repository classes injected via FastAPI `Depends()`. No raw SQL in routers.

| File | Responsibility |
|---|---|
| `app/repositories/base_repository.py` | Generic `BaseRepository[Model, CreateSchema, UpdateSchema]` with async CRUD. Uses `.model_dump()` (Pydantic V2 — never `.dict()`). |
| `app/repositories/shame_repository.py` | Operations on `hall_of_shame_entries`: paginated list, get by slug, insert, soft-delete. |
| `app/repositories/upvote_repository.py` | Operations on `shame_upvotes`: insert upvote, check existence by `(entry_id, voter_session_id)`. |

Repositories must NOT call `session.commit()` directly — commit/rollback is managed by the `get_db()` dependency. Use `session.flush()` when the generated PK is needed within the same transaction.

---

## Migration Strategy

1. All schema changes go through Alembic revision files under `/backend/alembic/versions/`.
2. The initial migration creates both tables (`hall_of_shame_entries` and `shame_upvotes`) plus all indexes in a single `upgrade()` function.
3. There is no seed migration for agents. Agent personas are managed exclusively via YAML files in `/backend/agents/` and do not touch the database.
4. The `updated_at` columns are managed via a reusable PostgreSQL trigger function defined in the initial migration.

### Trigger Function (defined once in initial migration)

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

Applied as `BEFORE UPDATE` trigger on `hall_of_shame_entries`.
