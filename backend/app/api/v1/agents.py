"""
GET /api/v1/agents — returns the full list of active AI agents.

Data is served from the in-memory AGENTS registry (populated at startup).
No DB query is performed.
"""

import logging

from fastapi import APIRouter

from app.core.agent_registry import AGENTS
from app.schemas.agents import AgentPublic, AgentsListResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"])


@router.get("", response_model=AgentsListResponse)
async def list_agents() -> AgentsListResponse:
    """
    Return all active agents from the in-memory registry.

    Public read endpoint — no session or rate-limit check required.
    Data is served exclusively from the in-memory AGENTS registry; no DB hit.
    """
    agents = [
        AgentPublic(
            slug=agent.slug,
            name=agent.name,
            vibe_label=agent.vibe_label,
            color_hex=agent.color_hex,
            contributor_github=agent.contributor_github,
            contributor_linkedin=agent.contributor_linkedin,
            contributor_name=agent.contributor_name,
            persona_summary=agent.persona_summary,
        )
        for agent in AGENTS.values()
    ]

    logger.debug("Restituzione di %d agenti.", len(agents))
    return AgentsListResponse(agents=agents)
