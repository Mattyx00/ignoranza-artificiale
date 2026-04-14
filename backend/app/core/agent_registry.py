"""
Agent registry — loads agent personas from YAML files at application startup.

All YAML files under /backend/agents/ are loaded once into AGENTS (module-level dict).
The loader fails fast on: duplicate slugs, filename-slug mismatches, and Pydantic
ValidationErrors caused by missing/invalid fields.
"""

import logging
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, field_validator

logger = logging.getLogger(__name__)

# The agents directory, resolved relative to this file's location:
# backend/app/core/agent_registry.py → backend/agents/
_AGENTS_DIR = Path(__file__).parent.parent.parent / "agents"


class AgentConfig(BaseModel):
    """Internal configuration model for an agent persona. NOT exposed to clients."""

    model_config = ConfigDict(frozen=True)

    slug: str = Field(..., description="URL-safe identifier matching the YAML filename stem")
    name: str = Field(..., max_length=128, description="Display name in Italian")
    vibe_label: str = Field(..., max_length=64, description="Short vibe label in Italian")
    color_hex: str = Field(..., description="Hex color code for UI theming")
    contributor_github: str | None = Field(None, max_length=128, description="GitHub handle of the agent's author")
    contributor_linkedin: str | None = Field(None, max_length=128, description="LinkedIn username/handle of the agent's author")
    contributor_name: str = Field(..., max_length=128, description="Display name of the agent's author")
    persona_summary: str = Field(..., max_length=256, description="One-line description shown in UI cards")
    persona_description: str = Field(..., description="Full LLM system prompt. Must be in Italian.")

    @field_validator("slug")
    @classmethod
    def slug_must_be_valid(cls, v: str) -> str:
        import re

        if not re.fullmatch(r"^[a-z0-9]+(-[a-z0-9]+)*$", v):
            raise ValueError(
                f"Lo slug '{v}' non è valido. Usa solo lettere minuscole, cifre e trattini."
            )
        return v

    @field_validator("color_hex")
    @classmethod
    def color_hex_must_be_valid(cls, v: str) -> str:
        import re

        if not re.fullmatch(r"^#[0-9A-Fa-f]{6}$", v):
            raise ValueError(
                f"Il colore '{v}' non è un hex valido. Usa il formato #RRGGBB."
            )
        return v


# Module-level registry dict populated by load_agents_from_yaml() at startup.
AGENTS: dict[str, AgentConfig] = {}


def load_agents_from_yaml() -> None:
    """
    Load all .yaml files from the agents directory into the AGENTS registry.

    Raises:
        ValueError: On duplicate slugs or filename-slug mismatches.
        pydantic.ValidationError: On invalid/missing fields in a YAML file.
        FileNotFoundError: If the agents directory does not exist.
    """
    global AGENTS

    if not _AGENTS_DIR.exists():
        raise FileNotFoundError(
            f"La directory degli agenti non esiste: {_AGENTS_DIR}"
        )

    yaml_files = sorted(_AGENTS_DIR.glob("*.yaml"))

    if not yaml_files:
        logger.warning("Nessun file .yaml trovato in %s — nessun agente caricato.", _AGENTS_DIR)
        AGENTS = {}
        return

    loaded: dict[str, AgentConfig] = {}
    # Track filename for each slug to produce clear duplicate-slug error messages.
    slug_to_filename: dict[str, str] = {}

    for yaml_path in yaml_files:
        filename_stem = yaml_path.stem
        logger.debug("Caricamento agente da: %s", yaml_path.name)

        with yaml_path.open("r", encoding="utf-8") as fh:
            raw_data = yaml.safe_load(fh)

        if not isinstance(raw_data, dict):
            raise ValueError(
                f"Il file '{yaml_path.name}' non contiene un dizionario YAML valido."
            )

        # Validate via Pydantic — raises ValidationError on bad data (fail-fast).
        agent = AgentConfig.model_validate(raw_data)

        # Rule 1: filename stem must equal the declared slug.
        if filename_stem != agent.slug:
            raise ValueError(
                f"Filename stem '{filename_stem}' does not match slug '{agent.slug}' "
                f"declared inside '{yaml_path.name}'. Rename the file or fix the slug."
            )

        # Rule 2: duplicate slug detection (fail-fast).
        if agent.slug in slug_to_filename:
            raise ValueError(
                f"Duplicate agent slug '{agent.slug}' found in both "
                f"'{slug_to_filename[agent.slug]}' and '{yaml_path.name}'. "
                f"Each slug must be unique across all agent files."
            )

        loaded[agent.slug] = agent
        slug_to_filename[agent.slug] = yaml_path.name
        logger.info("Agente caricato: '%s' (%s)", agent.slug, agent.name)

    # Update the existing module-level dict IN PLACE so that all `from
    # app.core.agent_registry import AGENTS` aliases across the codebase
    # (bound at import time to this exact dict object) see the populated data.
    # Reassigning `AGENTS = loaded` would rebind only the local module name and
    # leave every pre-existing alias pointing at the original empty dict.
    AGENTS.clear()
    AGENTS.update(loaded)
    logger.info("Registry agenti inizializzato con %d agente/i.", len(AGENTS))
