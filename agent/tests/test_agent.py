import pytest
from unittest.mock import MagicMock, patch
from agent.collector import calculate_cpu_percent, calculate_memory_usage, DockerMetricsCollector
from agent.sender import MetricsSender

def test_calculate_cpu_percent():
    stats = {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 200000000},
            "system_cpu_usage": 1000000000,
            "online_cpus": 2
        }
    }
    precpu_stats = {
        "cpu_stats": {
            "cpu_usage": {"total_usage": 100000000},
            "system_cpu_usage": 500000000,
        }
    }
    # cpu_delta = 100,000,000, system_delta = 500,000,000 -> ratio = 0.2 * 2 cpus * 100 = 40.0%
    cpu = calculate_cpu_percent(stats, precpu_stats)
    assert cpu == 40.0

def test_calculate_memory_usage():
    stats = {
        "memory_stats": {
            "usage": 250000000,
            "limit": 1073741824,
            "stats": {
                "inactive_file": 50000000
            }
        }
    }
    usage, limit = calculate_memory_usage(stats)
    assert usage == 200000000
    assert limit == 1073741824

def test_collector_filters_sensitive_attributes():
    """Verify collector strictly ignores env vars and sensitive attributes."""
    mock_container = MagicMock()
    mock_container.short_id = "test_short_id"
    mock_container.name = "web_app"
    mock_container.status = "running"
    mock_container.image.tags = ["myapp:v1"]
    mock_container.attrs = {
        "State": {"Status": "running", "Health": {"Status": "healthy"}},
        "RestartCount": 2,
        # SENSITIVE DATA THAT MUST NEVER BE INCLUDED IN TELEMETRY:
        "Config": {
            "Env": ["AWS_SECRET_KEY=supersecret", "DB_PASS=mypassword"],
            "Cmd": ["run", "--password=mypassword"]
        }
    }
    mock_container.stats.return_value = {
        "cpu_stats": {"cpu_usage": {"total_usage": 100}, "system_cpu_usage": 1000, "online_cpus": 1},
        "precpu_stats": {"cpu_stats": {"cpu_usage": {"total_usage": 50}, "system_cpu_usage": 500}},
        "memory_stats": {"usage": 1000000, "limit": 2000000, "stats": {}}
    }

    mock_client = MagicMock()
    mock_client.containers.list.return_value = [mock_container]

    collector = DockerMetricsCollector()
    collector.client = mock_client

    results = collector.collect()
    assert len(results) == 1
    item = results[0]

    assert item["container_id"] == "test_short_id"
    assert item["name"] == "web_app"
    assert item["state"] == "running"
    assert item["health_status"] == "healthy"
    assert item["restart_count"] == 2

    # PRIVACY CHECKS: Ensure no env vars or secrets are in the result dict
    assert "Config" not in item
    assert "Env" not in item
    assert "Cmd" not in item
    assert "env" not in item
    assert "secret" not in str(item).lower()

@patch("requests.Session.post")
def test_sender_includes_agent_key_header(mock_post):
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_post.return_value = mock_response

    sender = MetricsSender()
    sender.send_heartbeat()

    assert mock_post.called
    # Verify X-Agent-Key header is transmitted
    assert "X-Agent-Key" in sender.session.headers

def test_config_rejects_unauthenticated_tcp_2375():
    """Requirement 3: Never allow unauthenticated Docker TCP 2375."""
    from agent.config import AgentConfig
    import pytest

    with patch.dict("os.environ", {"DOCKER_HOST": "tcp://192.168.1.100:2375"}):
        cfg = AgentConfig()
        cfg.DOCKER_HOST = "tcp://192.168.1.100:2375"
        with pytest.raises(ValueError, match="Unauthenticated Docker TCP port 2375 is strictly forbidden"):
            cfg.validate()

def test_config_normalizes_bare_url_to_https():
    """Requirement 2: Fix Docker agent API endpoint config for AWS HTTPS."""
    from agent.config import AgentConfig

    with patch.dict("os.environ", {"CLOUDMONITOR_SERVER": "api.cloudmonitor.mydomain.com"}):
        cfg = AgentConfig()
        assert cfg.SERVER_URL == "https://api.cloudmonitor.mydomain.com"

@patch("requests.Session.post")
def test_sender_handles_ssl_error_gracefully(mock_post):
    """Requirement 2 & TLS safety: Handle TLS / SSL error without crashing."""
    from requests.exceptions import SSLError
    mock_post.side_effect = SSLError("certificate verify failed: self-signed certificate")

    sender = MetricsSender()
    success = sender.send_heartbeat()
    assert success is False
