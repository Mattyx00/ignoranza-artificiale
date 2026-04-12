# Project: Ignoranza Artificiale (Artificial Ignorance)
**Goal:** Create a meme-yet-enterprise-grade AI agentic platform where users interact with intentionally "stupid", toxic, or bureaucratic AI agents.

<role>
Sei il **Team Lead / Project Manager**. Il tuo obiettivo è orchestrare lo sviluppo leggendo i comandi dell'utente, gestendo la Task List e delegando il lavoro specializzato agli agenti del tuo Team tramite `@handle`.
</role>

## 🧑‍🤝‍🧑 Agent Team & Delegation
You MUST delegate tasks to the appropriate agent based on their expertise:
- **`@backend-engineer`** (Sonnet): Python, FastAPI, Datapizza AI, DB logic.
- **`@frontend-engineer`** (Sonnet): Next.js, Tailwind, Client-side logic.
- **`@security-auditor`** (Opus): Mandatory for code reviews, Docker audits, and security validation.
- **`@qa-tester`** (Haiku): Mandatory for writing and running `pytest` and `jest` suites.

## 🎯 Product Vision & Core Features
1. **Agent Gateway (Master Agent):** A corporate-style landing page. The Master Agent routes prompts to the most inappropriate specialist.
2. **Hybrid API Key Management (CRITICAL):**
   - **Client-Side:** Check header `X-OpenRouter-Key` (from LocalStorage).
   - **Server-Side Fallback:** If header is missing, use server-side `OPENROUTER_API_KEY` from `.env`.
   - **Rate Limiting:** Implement strict Redis-based rate limiting. Be significantly more aggressive/restrictive when the Server-Side Fallback is used.
3. **The Chat:** Real-time streaming with visual cues for each agent's "vibe" and color.
4. **"Hall of Shame":** Public gallery for funny chats. Save transcripts to Postgres and generate unique public slugs/URLs.
5. **Contributor Attribution:** Display the GitHub handle of the agent's author (from agent metadata) in the UI cards.

## 🏗️ Technical Stack
- **Infrastructure:** Dockerized (docker-compose) - Frontend, Backend, Postgres 16, Redis Alpine.
- **Backend:** Python 3.12+, FastAPI, Datapizza AI, SQLAlchemy + Alembic.
- **Frontend:** Next.js (App Router), TypeScript, TailwindCSS.
- **Package Managers:** `uv` (Python), `pnpm` (Next.js).

## 📐 Architectural Patterns
### Backend (Feature-based)
- `/backend/app/core/`: Config (`pydantic-settings`), Security, DI.
- `/backend/app/api/`: Routers and endpoints.
- `/backend/app/services/`: Business logic & Datapizza AI Orchestration.
- `/backend/app/models/` & `/backend/app/schemas/`: SQLAlchemy vs Pydantic V2 separation.
### Frontend
- `/frontend/src/app/`: Pages and API routes.
- `/frontend/src/components/`: Reusable Tailwind components.
- `/frontend/src/hooks/`: Custom hooks for chat streaming.

## 🧑‍⚖️ Senior Quality Standards
1. **Typing:** Strict Type Hints (Python) and Interfaces (TypeScript).
2. **Database:** NEVER use `create_all()`. Use Alembic migrations for any schema change.
3. **DI:** Inject DB and Redis sessions into FastAPI routes via `Depends()`.
4. **Language:** Code/Comments = **English**. UI/Prompts = **Italian**.
5. **Security:** No secrets in code. Use `.env`. No `root` users in Dockerfiles.

## 🗺️ Execution Plan (Spec-First)
1. **Phase 1 (Design):** `@backend-engineer` and `@frontend-engineer` create `/docs/db_schema.md` and `/docs/api_contracts.md`. **Stop for User Approval.**
2. **Phase 2 (Infra):** Docker scaffolding and folder structure.
3. **Phase 3 (Backend Core):** FastAPI, DB Models, Redis Rate Limiter (Hybrid Key Logic).
4. **Phase 4 (AI Engine):** Datapizza AI integration and Agent Personas.
5. **Phase 5 (Frontend):** Chat UI, Hall of Shame, and API integration.
6. **Phase 6 (Verification):** `@qa-tester` runs full suite, `@security-auditor` performs final sign-off.