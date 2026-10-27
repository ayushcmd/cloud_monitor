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

def test_wizard_create_host_with_os_selection():
    """Requirement 1 & 2: Creating a host from authenticated account with OS selection."""
    _, token = create_authenticated_user("wizard_create")

    # Enroll Windows host
    res_win = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Dev Workstation", "os_type": "windows"}
    )
    assert res_win.status_code == 201
    data_win = res_win.json()
    assert data_win["name"] == "Dev Workstation"
    assert data_win["os_type"] == "windows"
    assert data_win["status"] == "pending"
    assert data_win["agent_key"].startswith("cma_")
    assert len(data_win["agent_key"]) > 30

    # Enroll Linux host
    res_linux = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Prod Web Node", "os_type": "linux"}
    )
    assert res_linux.status_code == 201
    assert res_linux.json()["os_type"] == "linux"

def test_wizard_connection_status_progression():
    """Requirement 10: Wizard connection status endpoint returns progressive stages."""
    _, token = create_authenticated_user("wizard_progression")

    # 1. Initially after enrollment: stage is 'waiting_for_agent'
    enroll_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Staging Node", "os_type": "macos"}
    )
    agent_id = enroll_res.json()["id"]
    agent_key = enroll_res.json()["agent_key"]

    status_1 = client.get(
        f"/api/v1/agents/{agent_id}/connection-status",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_1.status_code == 200
    data_1 = status_1.json()
    assert data_1["stage"] == "waiting_for_agent"
    assert data_1["status"] == "pending"
    assert data_1["container_count"] == 0

    # 2. After agent delivers heartbeat: stage transitions to 'heartbeat_received'
    hb_res = client.post(
        "/api/v1/agents/heartbeat",
        headers={"X-Agent-Key": agent_key},
        json={
            "hostname": "macbook-pro",
            "os_info": "macOS 15.1 Darwin",
            "docker_version": "27.2.0",
            "agent_version": "1.1.0"
        }
    )
    assert hb_res.status_code == 200

    status_2 = client.get(
        f"/api/v1/agents/{agent_id}/connection-status",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_2.status_code == 200
    data_2 = status_2.json()
    assert data_2["stage"] == "heartbeat_received"
    assert data_2["status"] == "online"
    assert data_2["hostname"] == "macbook-pro"
    assert data_2["agent_version"] == "1.1.0"

    # 3. After agent ingests container metrics: stage transitions to 'connected'
    ingest_res = client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": agent_key},
        json={
            "containers": [
                {
                    "container_id": "c_web_01",
                    "name": "frontend_web",
                    "image": "nginx:alpine",
                    "state": "running",
                    "health_status": "healthy",
                    "cpu_percent": 4.5,
                    "memory_bytes": 52428800,
                    "memory_limit": 268435456,
                    "restart_count": 0
                },
                {
                    "container_id": "c_db_01",
                    "name": "database_node",
                    "image": "postgres:16",
                    "state": "exited",
                    "health_status": None,
                    "cpu_percent": 0.0,
                    "memory_bytes": 0,
                    "memory_limit": 536870912,
                    "restart_count": 2
                }
            ]
        }
    )
    assert ingest_res.status_code == 200

    status_3 = client.get(
        f"/api/v1/agents/{agent_id}/connection-status",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_3.status_code == 200
    data_3 = status_3.json()
    assert data_3["stage"] == "connected"
    assert data_3["status"] == "online"
    assert data_3["container_count"] == 2
    assert data_3["running_count"] == 1
    assert data_3["stopped_count"] == 1
    assert data_3["total_cpu_percent"] == 4.5
    assert data_3["total_memory_bytes"] == 52428800

def test_credential_rotation_invalidates_old_and_authorizes_new():
    """Requirement 9: Credential rotation generates new hash, invalidates old credential."""
    _, token = create_authenticated_user("rotate_user")
    enroll_res = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Rotatable Worker"}
    )
    agent_id = enroll_res.json()["id"]
    old_key = enroll_res.json()["agent_key"]

    # Old key works for heartbeat
    hb_old = client.post("/api/v1/agents/heartbeat", headers={"X-Agent-Key": old_key}, json={})
    assert hb_old.status_code == 200

    # Rotate credentials
    rotate_res = client.post(
        f"/api/v1/agents/{agent_id}/rotate-key",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert rotate_res.status_code == 200
    rotate_data = rotate_res.json()
    new_key = rotate_data["agent_key"]
    assert new_key != old_key
    assert new_key.startswith("cma_")
    assert rotate_data["status"] == "pending"

    # Old key is rejected immediately (401)
    hb_old_after = client.post("/api/v1/agents/heartbeat", headers={"X-Agent-Key": old_key}, json={})
    assert hb_old_after.status_code == 401

    # New key succeeds
    hb_new = client.post("/api/v1/agents/heartbeat", headers={"X-Agent-Key": new_key}, json={})
    assert hb_new.status_code == 200

def test_host_disconnection_revocation_and_purge():
    """Requirement 9: Disconnect host via revocation and purge deletion."""
    _, token = create_authenticated_user("disconnect_user")

    # 1. Revocation test
    enroll_1 = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Revocable Host"}
    )
    agent_id_1 = enroll_1.json()["id"]
    key_1 = enroll_1.json()["agent_key"]

    del_revoke = client.delete(
        f"/api/v1/agents/{agent_id_1}?purge=false",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert del_revoke.status_code == 200
    assert del_revoke.json()["status"] == "revoked"

    # Subsequent requests rejected with 403
    hb_revoked = client.post("/api/v1/agents/heartbeat", headers={"X-Agent-Key": key_1}, json={})
    assert hb_revoked.status_code == 403

    # Status check confirms revoked stage
    status_revoked = client.get(
        f"/api/v1/agents/{agent_id_1}/connection-status",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_revoked.json()["stage"] == "revoked"

    # 2. Purge test
    enroll_2 = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Purgeable Host"}
    )
    agent_id_2 = enroll_2.json()["id"]

    del_purge = client.delete(
        f"/api/v1/agents/{agent_id_2}?purge=true",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert del_purge.status_code == 200
    assert del_purge.json()["status"] == "purged"

    # Host record is gone
    status_purged = client.get(
        f"/api/v1/agents/{agent_id_2}/connection-status",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert status_purged.status_code == 404

def test_tenant_isolation_host_management():
    """Requirement 5: Strict tenant isolation for host actions."""
    _, token_a = create_authenticated_user("tenant_alpha")
    _, token_b = create_authenticated_user("tenant_beta")

    # User A creates host
    res_a = client.post(
        "/api/v1/agents/enroll",
        headers={"Authorization": f"Bearer {token_a}"},
        json={"name": "Tenant A Exclusive Host"}
    )
    agent_a_id = res_a.json()["id"]

    # User B cannot view connection status of Host A
    res_b_status = client.get(
        f"/api/v1/agents/{agent_a_id}/connection-status",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_b_status.status_code == 404

    # User B cannot rotate credentials of Host A
    res_b_rotate = client.post(
        f"/api/v1/agents/{agent_a_id}/rotate-key",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_b_rotate.status_code == 404

    # User B cannot disconnect Host A
    res_b_del = client.delete(
        f"/api/v1/agents/{agent_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert res_b_del.status_code == 404

def test_idempotent_metrics_ingestion_and_filtering():
    """Requirement 8: Idempotent upserts of container metrics and per-host filtering."""
    _, token = create_authenticated_user("idempotent_user")

    res_h1 = client.post("/api/v1/agents/enroll", headers={"Authorization": f"Bearer {token}"}, json={"name": "Host 1"})
    agent_1_id = res_h1.json()["id"]
    key_1 = res_h1.json()["agent_key"]

    res_h2 = client.post("/api/v1/agents/enroll", headers={"Authorization": f"Bearer {token}"}, json={"name": "Host 2"})
    agent_2_id = res_h2.json()["id"]
    key_2 = res_h2.json()["agent_key"]

    # Host 1 ingests container
    client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": key_1},
        json={
            "containers": [
                {
                    "container_id": "c_h1",
                    "name": "service_h1",
                    "state": "running",
                    "cpu_percent": 10.0,
                    "memory_bytes": 100,
                    "memory_limit": 200,
                    "restart_count": 0
                }
            ]
        }
    )

    # Host 2 ingests container
    client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": key_2},
        json={
            "containers": [
                {
                    "container_id": "c_h2",
                    "name": "service_h2",
                    "state": "running",
                    "cpu_percent": 20.0,
                    "memory_bytes": 200,
                    "memory_limit": 400,
                    "restart_count": 0
                }
            ]
        }
    )

    # Ingesting same container again updates it without creating duplicates (idempotency)
    client.post(
        "/api/v1/metrics/ingest",
        headers={"X-Agent-Key": key_1},
        json={
            "containers": [
                {
                    "container_id": "c_h1",
                    "name": "service_h1",
                    "state": "running",
                    "cpu_percent": 15.5,
                    "memory_bytes": 150,
                    "memory_limit": 200,
                    "restart_count": 0
                }
            ]
        }
    )

    # 1. Query all containers
    all_res = client.get("/api/v1/metrics/containers", headers={"Authorization": f"Bearer {token}"})
    assert all_res.status_code == 200
    containers = all_res.json()
    assert len(containers) == 2
    h1_entry = next(c for c in containers if c["container_id"] == "c_h1")
    assert h1_entry["cpu_percent"] == 15.5

    # 2. Query filtered by host 1
    h1_filtered = client.get(f"/api/v1/metrics/containers?agent_id={agent_1_id}", headers={"Authorization": f"Bearer {token}"})
    assert len(h1_filtered.json()) == 1
    assert h1_filtered.json()[0]["name"] == "service_h1"

    # 3. Query filtered by host 2
    h2_filtered = client.get(f"/api/v1/metrics/containers?agent_id={agent_2_id}", headers={"Authorization": f"Bearer {token}"})
    assert len(h2_filtered.json()) == 1
    assert h2_filtered.json()[0]["name"] == "service_h2"
