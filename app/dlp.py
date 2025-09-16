"""Regex-based data loss prevention helpers."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Callable, Iterable, List, Sequence


@dataclass(slots=True, frozen=True)
class Detection:
    """A single sensitive match found by the DLP engine."""

    label: str
    match: str
    start: int
    end: int

    def to_dict(self) -> dict[str, str | int]:
        return {
            "label": self.label,
            "match": self.match,
            "start": self.start,
            "end": self.end,
        }


@dataclass(slots=True, frozen=True)
class SensitivePattern:
    """Definition of a sensitive data detection rule."""

    label: str
    pattern: re.Pattern[str]
    description: str
    validator: Callable[[str], bool] | None = None


class DLPViolation(Exception):
    """Raised when sensitive data is detected and policy forbids it."""

    def __init__(self, detections: Sequence[Detection]):
        super().__init__("Sensitive content detected")
        self.detections = list(detections)


def _luhn_checksum(candidate: str) -> bool:
    digits = [int(char) for char in re.sub(r"\D", "", candidate)]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    parity = len(digits) % 2
    for index, digit in enumerate(digits):
        if index % 2 == parity:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0


def _build_default_patterns() -> List[SensitivePattern]:
    return [
        SensitivePattern(
            label="credit_card",
            pattern=re.compile(r"\b(?:\d[ -]?){13,19}\b"),
            description="Potential payment card number",
            validator=_luhn_checksum,
        ),
        SensitivePattern(
            label="ssn",
            pattern=re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
            description="U.S. social security number",
        ),
        SensitivePattern(
            label="api_key",
            pattern=re.compile(r"(?i)\b(?:sk|api|key)[-_]?[0-9a-z]{16,}\b"),
            description="Generic API key",
        ),
        SensitivePattern(
            label="aws_access_key",
            pattern=re.compile(r"AKIA[0-9A-Z]{16}"),
            description="AWS access key identifier",
        ),
        SensitivePattern(
            label="private_key",
            pattern=re.compile(r"-----BEGIN (?:RSA|EC|DSA) PRIVATE KEY-----"),
            description="Private key material",
        ),
    ]


class DataLossPrevention:
    """Simple regex-based DLP engine."""

    def __init__(self, patterns: Iterable[SensitivePattern] | None = None, *, mask_char: str = "*") -> None:
        self._patterns = list(patterns) if patterns is not None else _build_default_patterns()
        self._mask_char = mask_char

    def scan(self, text: str) -> List[Detection]:
        matches: List[Detection] = []
        for rule in self._patterns:
            for match in rule.pattern.finditer(text):
                candidate = match.group(0)
                if rule.validator and not rule.validator(candidate):
                    continue
                matches.append(Detection(rule.label, candidate, match.start(), match.end()))
        return matches

    def mask(self, text: str, detections: Sequence[Detection]) -> str:
        if not detections:
            return text
        masked = list(text)
        for detection in sorted(detections, key=lambda item: item.start):
            for index in range(detection.start, detection.end):
                if 0 <= index < len(masked):
                    masked[index] = self._mask_char
        return "".join(masked)

    def enforce(self, text: str, *, policy: str = "block") -> tuple[str, List[Detection]]:
        detections = self.scan(text)
        if detections:
            normalized_policy = policy.lower()
            if normalized_policy == "block":
                raise DLPViolation(detections)
            if normalized_policy == "mask":
                return self.mask(text, detections), detections
        return text, detections


__all__ = [
    "DataLossPrevention",
    "DLPViolation",
    "Detection",
]
