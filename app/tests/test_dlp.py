import pytest

from app.dlp import DLPViolation, DataLossPrevention


def test_credit_card_detection_with_luhn_validation() -> None:
    engine = DataLossPrevention()
    prompt = "Use card 4111 1111 1111 1111 to buy"
    detections = engine.scan(prompt)
    assert any(d.label == "credit_card" for d in detections)


def test_masking_replaces_sensitive_tokens() -> None:
    engine = DataLossPrevention()
    prompt = "API key sk-testsecretkeyvalue"
    masked, detections = engine.enforce(prompt, policy="mask")
    assert masked != prompt
    assert detections
    for detection in detections:
        assert detection.match not in masked


def test_block_policy_raises_violation() -> None:
    engine = DataLossPrevention()
    prompt = "SSN 123-45-6789 should not pass"
    with pytest.raises(DLPViolation):
        engine.enforce(prompt, policy="block")
