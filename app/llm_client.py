"""Minimal HTTP client used to communicate with an upstream LLM."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .config import settings

logger = logging.getLogger(__name__)


class LLMRequestError(RuntimeError):
    """Raised when the upstream model cannot be contacted."""


class LLMClient:
    """Async client capable of forwarding prompts to a remote LLM."""

    def __init__(self, endpoint: str | None, api_key: str | None, *, timeout: float = 30.0) -> None:
        self._endpoint = endpoint
        self._api_key = api_key
        self._timeout = timeout

    @classmethod
    def from_settings(cls) -> "LLMClient":
        return cls(settings.llm_endpoint, settings.llm_api_key)

    async def complete(self, prompt: str) -> str:
        """Send the prompt to the configured LLM endpoint.

        If no endpoint is configured, a stub response is returned.  This makes
        it possible to run the gateway in offline mode for testing.
        """

        if not self._endpoint:
            logger.debug("No upstream endpoint configured; returning stub response")
            return f"[stubbed LLM] {prompt}"

        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        payload = {"prompt": prompt}

        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(self._endpoint, json=payload, headers=headers)
                response.raise_for_status()
        except httpx.HTTPError as exc:  # pragma: no cover - network dependent
            logger.exception("Failed to contact upstream LLM")
            raise LLMRequestError(str(exc)) from exc

        data = response.json()
        return self._extract_text(data)

    def _extract_text(self, data: Any) -> str:
        """Normalize common response shapes into a string."""

        if isinstance(data, dict):
            if "response" in data:
                return str(data["response"])
            if "choices" in data and isinstance(data["choices"], list) and data["choices"]:
                choice = data["choices"][0]
                if isinstance(choice, dict):
                    for key in ("text", "message", "content"):
                        if key in choice:
                            value = choice[key]
                            if isinstance(value, dict) and "content" in value:
                                return str(value["content"])
                            return str(value)
        return str(data)


client = LLMClient.from_settings()

__all__ = ["LLMClient", "LLMRequestError", "client"]
