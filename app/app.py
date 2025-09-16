"""FastAPI application exposing a DLP-protected LLM gateway."""

from __future__ import annotations

import logging
from typing import List

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from .config import Settings, settings
from .dlp import DLPViolation, DataLossPrevention, Detection
from .llm_client import LLMClient, LLMRequestError, client as llm_client

logger = logging.getLogger(__name__)
logging.basicConfig(level=settings.log_level)

app = FastAPI(
    title="LLM Gateway with Regex DLP",
    version="1.0.0",
    description=(
        "Proxy requests to an upstream language model while enforcing "
        "regex-based data loss prevention policies."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


def get_settings() -> Settings:
    return settings


def get_dlp_engine() -> DataLossPrevention:
    return DataLossPrevention()


def get_llm_client() -> LLMClient:
    return llm_client


class DetectionModel(BaseModel):
    label: str
    match: str
    start: int
    end: int

    @classmethod
    def from_detection(cls, detection: Detection) -> "DetectionModel":
        return cls(**detection.to_dict())


class PromptRequest(BaseModel):
    prompt: str = Field(..., description="Prompt to forward to the LLM")
    mask: bool = Field(False, description="Mask sensitive matches instead of blocking")


class PromptResponse(BaseModel):
    response: str
    sanitized_prompt: str
    policy: str
    detections: List[DetectionModel] | None


@app.get("/healthz", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/v1/prompt", response_model=PromptResponse, tags=["llm"])
async def forward_prompt(
    payload: PromptRequest,
    dlp_engine: DataLossPrevention = Depends(get_dlp_engine),
    app_settings: Settings = Depends(get_settings),
    llm: LLMClient = Depends(get_llm_client),
) -> PromptResponse:
    policy = "mask" if payload.mask and app_settings.allow_masking_override else app_settings.dlp_policy
    logger.debug("Applying policy '%s' to prompt", policy)

    try:
        sanitized_prompt, detections = dlp_engine.enforce(payload.prompt, policy=policy)
    except DLPViolation as exc:
        logger.warning("Blocked prompt due to DLP violation: %s", exc.detections)
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Prompt rejected by DLP policy",
                "detections": [det.to_dict() for det in exc.detections],
            },
        )

    try:
        llm_response = await llm.complete(sanitized_prompt)
    except LLMRequestError as exc:
        logger.error("Upstream LLM request failed: %s", exc)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    detection_models = [DetectionModel.from_detection(item) for item in detections] if detections else None
    return PromptResponse(
        response=llm_response,
        sanitized_prompt=sanitized_prompt,
        policy=policy,
        detections=detection_models,
    )


__all__ = ["app"]
