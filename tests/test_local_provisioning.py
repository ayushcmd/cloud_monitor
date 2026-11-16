from unittest.mock import MagicMock, patch
from test_container_history import client, create_authenticated_user, enroll
from app.database import SessionLocal
from app.models.agent import Agent

def test_local_provisioning_requires_auth():
    res = client.post("/api/v1/agents/dev/provision-local", json={})
    assert res.status_code == 401

def test_local_provisioning_production_forbidden():
    _, token = create_authenticated_user("prod_forbidden")
    prod_env = {
        "APP_ENV": "production",
        "JWT_SECRET_KEY": "a" * 64,
        "DATABASE_URL": "postgresql://prod_user:strong_password@prod_host:5432/prod_db"
    }
    with patch.dict("os.environ", prod_env):
        res = client.post(
            "/api/v1/agents/dev/provision-local",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        assert res.status_code == 403
        assert "strictly restricted to trusted local development" in res.json()["detail"]

    # Regression assertion: provisioning remains forbidden in APP_ENV=test
    with patch.dict("os.environ", {"APP_ENV": "test"}):
        res_test = client.post(
            "/api/v1/agents/dev/provision-local",
            headers={"Authorization": f"Bearer {token}"},
            json={}
        )
        assert res_test.status_code == 403
        assert "strictly restricted to trusted local development" in res_test.json()["detail"]

def test_local_provisioning_reuses_existing_agent(enable_dev_provisioning):
    _, token = create_authenticated_user("reuse_agent")
    auth = {"Authorization": f"Bearer {token}"}

    # Enroll initial agent
    agent = enroll(token, "Local Docker Host")
    agent_id = agent["id"]

    mock_docker_client = MagicMock()
    mock_container = MagicMock()
    mock_container.status = "running"
    mock_docker_client.containers.get.return_value = mock_container

    with patch("app.services.docker_provisioner.get_docker_client", return_value=mock_docker_client), \
         patch("app.services.docker_provisioner.start_or_restart_local_agent", return_value=(False, "Container started")):

        res = client.post(
            "/api/v1/agents/dev/provision-local",
            headers=auth,
            json={"reuse_existing": True}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["reused"] is True
        assert data["agent_id"] == agent_id

    # Verify no duplicate agent was created in the database for this user
    with SessionLocal() as db:
        user_agents = db.query(Agent).filter(Agent.name == "Local Docker Host").all()
        # Find agents belonging to this enrolled user
        owned = [a for a in user_agents if a.id == agent_id]
        assert len(owned) == 1

def test_local_provisioning_creates_when_no_agent_exists(enable_dev_provisioning):
    _, token = create_authenticated_user("fresh_provision")
    auth = {"Authorization": f"Bearer {token}"}

    mock_docker_client = MagicMock()
    mock_docker_client.containers.get.side_effect = Exception("Not found")

    with patch("app.services.docker_provisioner.get_docker_client", return_value=mock_docker_client), \
         patch("app.services.docker_provisioner.start_or_restart_local_agent", return_value=(False, "Container started")):

        res = client.post(
            "/api/v1/agents/dev/provision-local",
            headers=auth,
            json={"name": "New Local Host", "reuse_existing": True}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["reused"] is False
        assert data["name"] == "New Local Host"
        assert data["status"] == "pending"
        assert data["stage"] == "waiting_for_agent"
