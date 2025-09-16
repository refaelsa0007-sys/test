"""Application configuration helpers."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _to_bool(value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _to_policy(value: str | None, *, default: str) -> str:
    if not value:
        return default
    lowered = value.lower()
    if lowered not in {"block", "mask"}:
        return default
    return lowered


@dataclass(slots=True)
class Settings:
    """Runtime configuration derived from environment variables."""

    llm_endpoint: str | None
    llm_api_key: str | None
    dlp_policy: str
    allow_masking_override: bool
    log_level: str

    @classmethod
    def load(cls) -> "Settings":
        return cls(
            llm_endpoint=os.getenv("LLM_API_ENDPOINT"),
            llm_api_key=os.getenv("LLM_API_KEY"),
            dlp_policy=_to_policy(os.getenv("DLP_POLICY"), default="block"),
            allow_masking_override=_to_bool(os.getenv("DLP_ALLOW_MASKING"), default=True),
            log_level=os.getenv("LOG_LEVEL", "INFO"),
        )


settings = Settings.load()
