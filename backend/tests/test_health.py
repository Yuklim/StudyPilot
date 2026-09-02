"""Tests for the intentionally minimal operational health endpoint."""

from fastapi.testclient import TestClient

from studypilot.main import app

client = TestClient(app)


def test_health_returns_exact_minimal_response() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "StudyPilot"}


def test_health_does_not_disclose_sensitive_runtime_details() -> None:
    response_text = client.get("/health").text.lower()

    assert response_text == '{"status":"ok","service":"studypilot"}'
    for sensitive_fragment in (
        "version",
        "environment",
        "database",
        "path",
        "host",
        "timestamp",
        "token",
        "secret",
    ):
        assert sensitive_fragment not in response_text
