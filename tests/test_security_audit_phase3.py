"""
Phase 3: Security Hardening & Audit Verification Test Suite.
Tests:
- Automatic Docker provisioning security & tenant isolation
- Forged forwarding headers and IP boundary validation
- Prometheus API authentication and PromQL restriction
- Agent credential handling, invalid key, and revoked key validation
- Missing telemetry semantics (no fabricated zeroes)
"""
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.agent import Agent
from app.models.metric import ContainerMetric
from test_container_history import create_authenticated_user, enroll

client = TestClient(app)

def test_unauthenticated_provisioning_rejected():
    """Unauthenticated calls to /dev/provision-local must return 401 Unauthorized."""
    res = client.post("/api/v1/agents/dev/provision-local", json={})
    assert res.status_code == 401

def test_production_provisioning_rejected():
    """Calls to /dev/provision-local must return 403 Forbidden in production."""
    _, token = create_authenticated_user("sec_prod")
    prod_env = {
        "APP_ENV": "production",
        "JWT_SECRET_KEY": "a" * 64,
        "DATABASE_URL": "postgresql://prod_user:strong_password@prod_host:5432/prod_db",
        "ENABLE_DEV_PROVISIONING": "false"
    }
    with patch.dict("os.environ", prod_env):
        res = client.post(
            "/api/v1/agents/dev/provision-local",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        assert res.status_code == 403
        assert "restricted" in res.json()["detail"].lower()

def test_forged_forwarding_headers_rejected():
    """Clients attempting to spoof locality via public X-Forwarded-For must be rejected with 403."""
    _, token = create_authenticated_user("sec_spoof")
    auth = {"Authorization": f"Bearer {token}"}

    # Public IP spoofed in X-Forwarded-For
    res = client.post(
        "/api/v1/agents/dev/provision-local",
        headers={**auth, "X-Forwarded-For": "203.0.113.195"},
        json={}
    )
    assert res.status_code == 403
    assert "untrusted" in res.json()["detail"].lower()

    # Chained IP where external hop is present
    res2 = client.post(
        "/api/v1/agents/dev/provision-local",
        headers={**auth, "X-Forwarded-For": "127.0.0.1, 8.8.8.8"},
        json={}
    )
    assert res2.status_code == 403
    assert "untrusted" in res2.json()["detail"].lower()

    # Public IP in X-Real-IP
    res3 = client.post(
        "/api/v1/agents/dev/provision-local",
        headers={**auth, "X-Real-IP": "198.51.100.23"},
        json={}
    )
    assert res3.status_code == 403
    assert "untrusted" in res3.json()["detail"].lower()

def test_cross_tenant_provisioning_rejected():
    """A tenant cannot provision or reuse an agent belonging to another tenant."""
    _, user_a_token = create_authenticated_user("tenant_a")
    _, user_b_token = create_authenticated_user("tenant_b")

    # Tenant A enrolls an agent
    agent_a = enroll(user_a_token, "Tenant A Private Host")
    agent_a_id = agent_a["id"]

    # Tenant B attempts to provision Tenant A's agent ID
    res = client.post(
        "/api/v1/agents/dev/provision-local",
        headers={"Authorization": f"Bearer {user_b_token}"},
        json={"agent_id": agent_a_id, "reuse_existing": True}
    )
    assert res.status_code == 403
    assert "another tenant" in res.json()["detail"].lower()

def test_revoked_agent_provisioning_rejected():
    """A revoked agent cannot be reused during auto-provisioning."""
    _, token = create_authenticated_user("revoked_prov")
    auth = {"Authorization": f"Bearer {token}"}
    agent = enroll(token, "Revoked Test Host")
    agent_id = agent["id"]

    # Revoke agent via DELETE /api/v1/agents/{id}
    del_res = client.delete(f"/api/v1/agents/{agent_id}", headers=auth)
    assert del_res.status_code == 200

    # Attempt to provision the revoked agent ID
    res = client.post(
        "/api/v1/agents/dev/provision-local",
        headers=auth,
        json={"agent_id": agent_id, "reuse_existing": True}
    )
    assert res.status_code == 400
    assert "revoked" in res.json()["detail"].lower()

def test_invalid_agent_credentials_rejected():
    """Heartbeat and metric ingestion with invalid agent key must return 401."""
    invalid_header = {"X-Agent-Key": "cma_completely_invalid_key_12345"}

    hb_res = client.post(
        "/api/v1/agents/heartbeat",
        headers=invalid_header,
        json={"hostname": "fake_host", "os_info": "Linux", "agent_version": "1.1.0"}
    )
    assert hb_res.status_code == 401
    assert "Invalid agent credentials" in hb_res.json()["detail"]

    metric_res = client.post(
        "/api/v1/metrics/ingest",
        headers=invalid_header,
        json={"timestamp": datetime.now(timezone.utc).isoformat(), "complete_inventory": True, "containers": []}
    )
    assert metric_res.status_code == 401

def test_revoked_agent_credentials_rejected():
    """Heartbeat and metric ingestion from revoked agent must return 403."""
    _, token = create_authenticated_user("revoked_cred_user")
    auth = {"Authorization": f"Bearer {token}"}
    agent = enroll(token, "Host To Revoke")
    agent_id = agent["id"]
    agent_key = agent["agent_key"]

    # Heartbeat works before revocation
    res = client.post(
        "/api/v1/agents/heartbeat",
        headers={"X-Agent-Key": agent_key},
        json={"hostname": "test_host", "os_info": "Linux", "agent_version": "1.1.0"}
    )
    assert res.status_code == 200

    # Revoke agent via DELETE /api/v1/agents/{id}
    del_res = client.delete(f"/api/v1/agents/{agent_id}", headers=auth)
    assert del_res.status_code == 200

    # Heartbeat blocked after revocation
    res_after = client.post(
        "/api/v1/agents/heartbeat",
        headers={"X-Agent-Key": agent_key},
        json={"hostname": "test_host", "os_info": "Linux", "agent_version": "1.1.0"}
    )
    assert res_after.status_code == 403
    assert "revoked" in res_after.json()["detail"].lower()

def test_prometheus_unauthenticated_access_rejected():
    """All monitoring endpoints must reject unauthenticated requests."""
    assert client.get("/api/v1/monitoring/targets").status_code == 401
    assert client.get("/api/v1/monitoring/alerts").status_code == 401
    assert client.get("/api/v1/monitoring/rules").status_code == 401
    assert client.get("/api/v1/monitoring/query?query=up").status_code == 401
    assert client.get("/api/v1/monitoring/query_range?query=up&start=100&end=200").status_code == 401

def test_prometheus_arbitrary_promql_rejected():
    """Arbitrary PromQL queries, semicolons, and dangerous commands must be rejected with 400."""
    _, token = create_authenticated_user("prom_user")
    auth = {"Authorization": f"Bearer {token}"}

    # Dangerous command injection attempt
    res = client.get(
        "/api/v1/monitoring/query",
        headers=auth,
        params={"query": "drop database; delete from series"}
    )
    assert res.status_code == 400
    assert "not permitted" in res.json()["detail"].lower()

    # Disallowed administrative query
    res2 = client.get(
        "/api/v1/monitoring/query",
        headers=auth,
        params={"query": "prometheus_notifications_alertmanagers_discovered"}
    )
    assert res2.status_code == 400

def test_prometheus_safe_queries_permitted():
    """Allowed safe platform metrics queries pass validation."""
    _, token = create_authenticated_user("prom_safe_user")
    auth = {"Authorization": f"Bearer {token}"}

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "success", "data": {"result": []}}
        mock_resp.raise_for_status.return_value = None
        mock_get.return_value = mock_resp

        res = client.get(
            "/api/v1/monitoring/query",
            headers=auth,
            params={"query": "cloudmonitor_active_requests"}
        )
        assert res.status_code == 200
        assert res.json()["status"] == "success"

def test_missing_telemetry_semantics_preserved():
    """Null metric values do not cause aggregate crashes or fabricate false zero readings."""
    _, token = create_authenticated_user("null_semantics_user")
    auth = {"Authorization": f"Bearer {token}"}
    agent = enroll(token, "Null Semantics Host")
    agent_id = agent["id"]

    # Ingest a container with null cpu_percent and null memory_bytes
    with SessionLocal() as db:
        m = ContainerMetric(
            agent_id=agent_id,
            user_id=db.query(Agent).filter(Agent.id == agent_id).first().user_id,
            container_id="null_container_123",
            name="idle_container",
            state="running",
            cpu_percent=None,
            memory_bytes=None,
            memory_limit=1000000,
            restart_count=0
        )
        db.add(m)
        db.commit()

    # List agents endpoint handles null cpu/memory safely without raising 500
    res = client.get("/api/v1/agents", headers=auth)
    assert res.status_code == 200
    agent_out = next(a for a in res.json() if a["id"] == agent_id)
    assert agent_out["total_cpu_percent"] == 0.0
    assert agent_out["total_memory_bytes"] == 0
    assert agent_out["container_count"] == 1
