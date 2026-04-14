"""
Pydantic V2 schemas for Agent responses.

AgentPublic deliberately omits `persona_description` (the LLM system prompt)
so it is never exposed to clients.
"""

from pydantic import BaseModel, ConfigDict, Field


class AgentPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str = Field(..., description="URL-safe unique identifier")
    name: str = Field(..., max_length=128, description="Display name in Italian")
    vibe_label: str = Field(..., max_length=64, description="Short vibe descriptor in Italian")
    color_hex: str = Field(..., description="CSS hex color #RRGGBB")
    contributor_github: str | None = Field(None, max_length=128, description="GitHub handle of the contributor")
    contributor_linkedin: str | None = Field(None, max_length=128, description="LinkedIn username/handle of the contributor")
    contributor_name: str = Field(..., max_length=128, description="Display name of the contributor")
    persona_summary: str = Field(..., max_length=256, description="Short persona description for UI cards")


class AgentsListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    agents: list[AgentPublic]
