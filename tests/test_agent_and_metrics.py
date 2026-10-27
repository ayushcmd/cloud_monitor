import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def create_authenticated_user(email_prefix: str) -> tuple[dict, str]:
    """Helper to register and login a user, returning user data and JWT token."""
    email = f"{email_prefix}_{int(datetime.now(timezone.utc).timestamp() * 1000)}@test.internal"
    password = "StrongPassword123!"
    reg_res = client.post("/api/v1/auth/register", json={"email": email, "password": password})
    assert reg_res.status_code == 201
    user_data = reg_res.json()

    login_res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    return user_data, token

def test_agent_enrollment_requires_auth():
    """Unauthenticated calls to /api/v1/agents/enroll must return 401."""
    res = client.post("/api/v1/agents/enroll", json={"name": "Host Agent"})
    assert res.status_code == 401

def test_agent_enrollment_success():
    """Authenticated user can enroll an agent and receives a high-entropy agent key."""
    _, token = create_authenticated_user("enroll_test")
    res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Local Docker Host"}
    )
    assert res.status_code == 201
    data = res.json()
    assert "id" in data
    assert data["name"] == "Local Docker Host"
    assert "agent_key" in data
    assert data["agent_key"].startswith("cma_")
    assert len(data["agent_key"]) > 30
    assert data["status"] == "pending"

def test_agent_heartbeat_success():
    """Agent can authenticate via X-Agent-Key header and submit heartbeats."""
    _, token = create_authenticated_user("hb_test")
    enroll_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Production Node 1"}
    )
    agent_key = enroll_res.json()["agent_key"]

    hb_payload = {
        "hostname": "worker-node-01",
        "docker_version": "27.2.0",
        "os_info": "Linux 6.8.0-generic"
    }
    hb_res = client.post(
        "/api/v1/agents/heartbeat",
        headers={"X-Agent-Key": agent_key},
        json=hb_payload
    )
    assert hb_res.status_code == 200
    assert hb_res.json()["status"] == "ok"

    # Verify agent status updated to online
    list_res = client.get("/api/v1/agents", headers={"Authorization": f"Bearer {token}"})
    assert list_res.status_code == 200
    agents = list_res.json()
    agent_info = next(a for a in agents if a["id"] == enroll_res.json()["id"])
    assert agent_info["status"] == "online"
    assert agent_info["hostname"] == "worker-node-01"
    assert agent_info["last_heartbeat"] is not None

def test_agent_invalid_or_missing_credentials():
    """Missing or invalid agent credentials must be rejected with 401."""
    # 1. Missing credentials
    res_missing = client.post("/api/v1/agents/heartbeat", json={})
    assert res_missing.status_code == 401

    # 2. Invalid credentials
    res_invalid = client.post(
        "/api/v1/agents/heartbeat",
        headers={"X-Agent-Key": "cma_completely_invalid_key_12345"},
        json={}
    )
    assert res_invalid.status_code == 401

def test_agent_revocation():
    """User can revoke agent, and revoked agent requests are rejected with 403."""
    _, token = create_authenticated_user("revoke_test")
    enroll_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Temporary Worker"}
    )
    agent_id = enroll_res.json()["id"]
    agent_key = enroll_res.json()["agent_key"]

    # Initial heartbeat works
    hb1 = client.post("/api/v1/agents/heartbeat", headers={"X-Agent-Key": agent_key}, json={})
    assert hb1.status_code == 200

    # Revoke agent
    del_res = client.delete(f"/api/v1/agents/{agent_id}", headers={"Authorization": f"Bearer {token}"})
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "revoked"

    # Subsequent heartbeat must be rejected with 403
    hb2 = client.post("/api/v1/agents/heartbeat", headers={"X-Agent-Key": agent_key}, json={})
    assert hb2.status_code == 403
    assert "revoked" in hb2.json()["detail"].lower()

def test_metrics_ingestion_and_retrieval():
    """Agent can ingest metrics and authenticated user can query their container metrics."""
    user_data, token = create_authenticated_user("metrics_test")
    enroll_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "App Cluster Host"}
    )
    agent_key = enroll_res.json()["agent_key"]

    # Ingest metrics
    metrics_payload = {
        "containers": [
            {
                "container_id": "c1a2b3c4d5e6",
                "name": "web_service_prod",
                "image": "nginx:alpine",
                "state": "running",
                "health_status": "healthy",
                "cpu_percent": 12.5,
                "memory_bytes": 104857600,
                "memory_limit": 536870912,
                "restart_count": 0,
            },
            {
                "container_id": "c7f8e9d0a1b2",
                "name": "redis_cache",
                "image": "redis:7-alpine",
                "state": "running",
                "health_status": None,
                "cpu_percent": 3.2,
                "memory_bytes": 41943040,
                "memory_limit": 268435456,
                "restart_count": 1,
            }
        ]
    }

    ingest_res = client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": agent_key},
        json=metrics_payload
    )
    assert ingest_res.status_code == 200
    assert ingest_res.json()["ingested_count"] == 2

    # Query user containers
    containers_res = client.get(
        "/api/v1/metrics/containers",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert containers_res.status_code == 200
    containers = containers_res.json()
    assert len(containers) == 2
    names = [c["name"] for c in containers]
    assert "web_service_prod" in names
    assert "redis_cache" in names

    web_container = next(c for c in containers if c["name"] == "web_service_prod")
    assert web_container["cpu_percent"] == 12.5
    assert web_container["memory_bytes"] == 104857600
    assert web_container["state"] == "running"
    assert web_container["health_status"] == "healthy"

def test_metrics_ingestion_payload_validation():
    """Invalid metrics payloads are rejected with 422."""
    _, token = create_authenticated_user("validation_test")
    enroll_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Validation Host"}
    )
    agent_key = enroll_res.json()["agent_key"]

    # 1. Missing container_id
    invalid_payload = {
        "containers": [
            {
                "name": "invalid_container",
                "state": "running",
                "cpu_percent": 5.0,
                "memory_bytes": 1000,
                "memory_limit": 2000,
                "restart_count": 0
            }
        ]
    }
    res1 = client.post("/api/v1/metrics/ingest", headers={"X-Agent-Key": agent_key}, json=invalid_payload)
    assert res1.status_code == 422

    # 2. Negative cpu_percent
    invalid_cpu = {
        "containers": [
            {
                "container_id": "test_id",
                "name": "invalid_container",
                "state": "running",
                "cpu_percent": -10.0,
                "memory_bytes": 1000,
                "memory_limit": 2000,
                "restart_count": 0
            }
        ]
    }
    res2 = client.post("/api/v1/metrics/ingest", headers={"X-Agent-Key": agent_key}, json=invalid_cpu)
    assert res2.status_code == 422

def test_tenant_isolation_agents_and_metrics():
    """Verify that User A cannot see or manipulate User B's agents or metrics."""
    # Create User A and User B
    _, token_a = create_authenticated_user("user_a")
    _, token_b = create_authenticated_user("user_b")

    # User A enrolls Agent A
    agent_a_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"name": "User A Host"}
    )
    agent_a_id = agent_a_res.json()["id"]
    agent_a_key = agent_a_res.json()["agent_key"]

    # User B enrolls Agent B
    agent_b_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token_b}"},
        json={"name": "User B Host"}
    )
    agent_b_id = agent_b_res.json()["id"]
    agent_b_key = agent_b_res.json()["agent_key"]

    # Agent A ingests metrics
    client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": agent_a_key},
        json={
            "containers": [
                {
                    "container_id": "user_a_container",
                    "name": "isolated_service_a",
                    "state": "running",
                    "cpu_percent": 15.0,
                    "memory_bytes": 50000,
                    "memory_limit": 100000,
                    "restart_count": 0
                }
            ]
        }
    )

    # Agent B ingests metrics
    client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": agent_b_key},
        json={
            "containers": [
                {
                    "container_id": "user_b_container",
                    "name": "isolated_service_b",
                    "state": "running",
                    "cpu_percent": 25.0,
                    "memory_bytes": 80000,
                    "memory_limit": 100000,
                    "restart_count": 0
                }
            ]
        }
    )

    # 1. User A checks their agents: should see only Agent A
    agents_a = client.get("/api/v1/agents", headers={"Authorization": f"Bearer {token_a}"}).json()
    assert any(a["id"] == agent_a_id for a in agents_a)
    assert not any(a["id"] == agent_b_id for a in agents_a)

    # 2. User B checks their agents: should see only Agent B
    agents_b = client.get("/api/v1/agents", headers={"Authorization": f"Bearer {token_b}"}).json()
    assert any(a["id"] == agent_b_id for a in agents_b)
    assert not any(a["id"] == agent_a_id for a in agents_b)

    # 3. User A attempts to revoke User B's agent: must return 404
    del_res = client.delete(f"/api/v1/agents/{agent_b_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert del_res.status_code == 404

    # 4. User A checks container metrics: should see only isolated_service_a
    metrics_a = client.get("/api/v1/metrics/containers", headers={"Authorization": f"Bearer {token_a}"}).json()
    names_a = [c["name"] for c in metrics_a]
    assert "isolated_service_a" in names_a
    assert "isolated_service_b" not in names_a

    # 5. User B checks container metrics: should see only isolated_service_b
    metrics_b = client.get("/api/v1/metrics/containers", headers={"Authorization": f"Bearer {token_b}"}).json()
    names_b = [c["name"] for c in metrics_b]
    assert "isolated_service_b" in names_b
    assert "isolated_service_a" not in names_b
