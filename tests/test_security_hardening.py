import os
import pytest
from fastapi.testclient import TestClient

def test_cors_allowed_origin():
    from app.config import settings
    allowed_origin = settings.CORS_ORIGINS[0] if settings.CORS_ORIGINS else "http://localhost:5173"
    from app.main import app
    client = TestClient(app)
    response = client.get("/health", headers={"Origin": allowed_origin})
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == allowed_origin
    assert response.headers.get("access-control-allow-credentials") == "true"

def test_cors_disallowed_origin():
    from app.main import app
    client = TestClient(app)
    response = client.get("/health", headers={"Origin": "http://evil-attacker.com"})
    assert response.status_code == 200
    # Disallowed origin must not be reflected in access-control-allow-origin
    assert response.headers.get("access-control-allow-origin") != "http://evil-attacker.com"
    assert response.headers.get("access-control-allow-origin") != "*"

def test_simulation_endpoints_in_dev():
    from app.config import settings
    settings.ENVIRONMENT = "development"
    from app.main import app
    client = TestClient(app)

    # 1. Error simulation
    res_err = client.post("/api/v1/simulate/error")
    assert res_err.status_code == 500
    assert "Simulated CloudMonitor internal server failure" in res_err.json()["detail"]

    # 2. Latency simulation
    res_lat = client.get("/api/v1/simulate/latency?delay=0.01")
    assert res_lat.status_code == 200
    assert "completed after 0.01 seconds" in res_lat.json()["message"]

    # 3. Health toggle simulation
    res_toggle = client.post("/api/v1/simulate/health-toggle?status=false")
    assert res_toggle.status_code == 200
    assert res_toggle.json()["is_healthy"] is False

    # Restore healthy state
    client.post("/api/v1/simulate/health-toggle?status=true")

def test_simulation_endpoints_blocked_in_production():
    from app.config import settings
    original_env = settings.ENVIRONMENT
    try:
        settings.ENVIRONMENT = "production"
        from app.main import app
        client = TestClient(app)

        # 1. Error simulation blocked
        res_err = client.post("/api/v1/simulate/error")
        assert res_err.status_code == 403
        assert "disabled in non-development environments" in res_err.json()["detail"]

        # 2. Latency simulation blocked
        res_lat = client.get("/api/v1/simulate/latency?delay=0.01")
        assert res_lat.status_code == 403
        assert "disabled in non-development environments" in res_lat.json()["detail"]

        # 3. Health toggle blocked
        res_toggle = client.post("/api/v1/simulate/health-toggle?status=false")
        assert res_toggle.status_code == 403
        assert "disabled in non-development environments" in res_toggle.json()["detail"]

        # Normal endpoints must NOT be blocked
        res_health = client.get("/health")
        assert res_health.status_code == 200

        res_api_health = client.get("/api/health")
        assert res_api_health.status_code == 200

        res_metrics = client.get("/metrics")
        assert res_metrics.status_code == 200
    finally:
        settings.ENVIRONMENT = original_env
