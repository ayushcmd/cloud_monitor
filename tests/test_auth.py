import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.auth.security import create_access_token

client = TestClient(app)

def test_user_registration_success():
    email = "testuser_phase1@example.com"
    payload = {
        "email": email,
        "password": "SecurePassword123!"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code in (201, 409)
    if response.status_code == 201:
        data = response.json()
        assert data["email"] == email
        assert "id" in data
        assert "created_at" in data
        assert "password" not in data
        assert "password_hash" not in data

def test_user_registration_duplicate_email():
    email = "duplicate_phase1@example.com"
    payload = {
        "email": email,
        "password": "Password12345!"
    }
    # First registration
    res1 = client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code in (201, 409)

    # Second registration with same email must fail with 409
    res2 = client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 409
    assert "already registered" in res2.json()["detail"].lower()

def test_user_registration_short_password():
    payload = {
        "email": "shortpass@example.com",
        "password": "short"  # < 8 characters
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422

def test_user_registration_invalid_email():
    payload = {
        "email": "not-an-email",
        "password": "ValidPassword123!"
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 422

def test_user_login_success_and_token():
    email = "login_success@example.com"
    password = "CorrectPassword123!"

    # Register user first
    reg_res = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code in (201, 409)

    # Login
    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200
    token_data = login_res.json()
    assert "access_token" in token_data
    assert token_data["token_type"] == "bearer"
    assert len(token_data["access_token"]) > 20

def test_user_login_wrong_password():
    email = "wrong_pwd@example.com"
    client.post("/api/v1/auth/register", json={"email": email, "password": "OriginalPassword123!"})

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": "IncorrectPassword123!"})
    assert login_res.status_code == 401
    assert "invalid email or password" in login_res.json()["detail"].lower()

def test_user_login_nonexistent_user():
    login_res = client.post("/api/v1/auth/login", json={"email": "nonexistent_999999@example.com", "password": "SomePassword123!"})
    assert login_res.status_code == 401
    assert "invalid email or password" in login_res.json()["detail"].lower()

def test_protected_me_endpoint_success():
    email = "me_test@example.com"
    password = "MyPassword123!"
    client.post("/api/v1/auth/register", json={"email": email, "password": password})

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    token = login_res.json()["access_token"]

    # Call /me with Bearer token
    me_res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    user_data = me_res.json()
    assert user_data["email"] == email
    assert "id" in user_data
    assert "password_hash" not in user_data

def test_protected_me_endpoint_missing_token():
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert "missing" in response.json()["detail"].lower() or "not authenticated" in response.json()["detail"].lower()

def test_protected_me_endpoint_invalid_token():
    response = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid.token.payload"})
    assert response.status_code == 401

def test_protected_me_endpoint_expired_token():
    expired_token = create_access_token(
        data={"sub": "expired_user@example.com", "user_id": 999},
        expires_delta=timedelta(seconds=-10)
    )
    response = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
    assert response.status_code == 401
    assert "expired" in response.json()["detail"].lower()

def test_health_and_metrics_endpoints_intact():
    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] in ("healthy", "ok")

    res_api_health = client.get("/api/health")
    assert res_api_health.status_code == 200

    res_metrics = client.get("/metrics")
    assert res_metrics.status_code == 200
    assert b"cloudmonitor_requests_total" in res_metrics.content or b"process_virtual_memory_bytes" in res_metrics.content
