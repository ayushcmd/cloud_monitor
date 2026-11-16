"""
Development-only Docker agent auto-provisioning service.
Strictly restricted to trusted local development environments.
"""
import os
import logging
import threading
from typing import Optional, Tuple
import docker
from docker.errors import DockerException, ImageNotFound, NotFound

logger = logging.getLogger("cloudmonitor-backend")
_provision_lock = threading.Lock()

def get_docker_client() -> docker.DockerClient:
    """Connects to the Docker daemon via standard environment socket / pipe."""
    try:
        return docker.from_env()
    except DockerException as e:
        logger.error(f"Failed to connect to Docker daemon: {e}")
        raise RuntimeError(
            "Docker daemon is not running or accessible. "
            "Please ensure Docker Desktop / Docker Engine is started and using Linux containers."
        ) from e

def build_agent_image_if_needed(client: docker.DockerClient, repo_root: str) -> None:
    """Verifies that the cloudmonitor-agent:latest image exists, building it if missing."""
    try:
        client.images.get("cloudmonitor-agent:latest")
        logger.info("Found existing cloudmonitor-agent:latest image.")
    except ImageNotFound:
        # Search candidate agent directories
        candidates = [
            os.path.join(repo_root, "agent"),
            "/repo/agent",
            os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "agent")),
            "agent",
            "./agent",
        ]
        agent_dir = next((d for d in candidates if os.path.isdir(d) and os.path.exists(os.path.join(d, "Dockerfile"))), None)
        if not agent_dir:
            raise RuntimeError(
                f"Agent source directory with Dockerfile not found in {candidates}. "
                "Ensure repository is mounted or agent folder exists."
            )
        logger.info(f"Building cloudmonitor-agent:latest from {agent_dir}...")
        client.images.build(path=agent_dir, tag="cloudmonitor-agent:latest", rm=True)

def write_agent_env_file(
    repo_root: str,
    server_url: str,
    agent_key: str,
    poll_interval: int = 5,
    heartbeat_interval: int = 10
) -> Optional[str]:
    """Writes the agent environment file outside version control (ignored by .gitignore)."""
    candidates = [
        os.path.join(repo_root, "cloudmonitor-agent.env"),
        "/repo/cloudmonitor-agent.env",
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "cloudmonitor-agent.env")),
        "cloudmonitor-agent.env",
    ]
    target_path = None
    for p in candidates:
        try:
            d = os.path.dirname(p)
            if not d or os.path.isdir(d):
                target_path = p
                break
        except Exception:
            continue

    if not target_path:
        target_path = "cloudmonitor-agent.env"

    content = (
        f"CLOUDMONITOR_SERVER={server_url}\n"
        f"CLOUDMONITOR_AGENT_KEY={agent_key}\n"
        f"AGENT_POLL_INTERVAL={poll_interval}\n"
        f"AGENT_HEARTBEAT_INTERVAL={heartbeat_interval}\n"
    )
    try:
        with open(target_path, "w", encoding="utf-8") as f:
            f.write(content)
        try:
            os.chmod(target_path, 0o600)
        except Exception:
            pass
        return target_path
    except Exception as err:
        logger.warning(f"Could not write {target_path}: {err}. Will rely on container environment variables.")
        return None

def start_or_restart_local_agent(
    agent_id: int,
    agent_key: str,
    server_url: str = "http://backend:8000",
    network_name: str = "cloudmonitor-network"
) -> Tuple[bool, str]:
    """
    Ensures a local Docker agent container for agent_id is running on network_name.
    Returns (reused_running, message).
    """
    with _provision_lock:
        client = get_docker_client()
        container_name = f"cloudmonitor-agent-{agent_id}"

        # Determine repository root
        repo_root = "/repo" if os.path.isdir("/repo") else os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..")
        )

        # 1. Build image if needed
        build_agent_image_if_needed(client, repo_root)

        # 2. Store credentials outside source control
        write_agent_env_file(repo_root, server_url, agent_key)

        # 3. Check existing container
        try:
            container = client.containers.get(container_name)
            if container.status == "running":
                logger.info(f"Container {container_name} is already running.")
                return True, f"Agent container '{container_name}' is already running and collecting telemetry."
            else:
                logger.info(f"Removing non-running container {container_name} to recreate with current credentials...")
                container.remove(force=True)
        except NotFound:
            pass

        # 4. Check if network exists
        try:
            client.networks.get(network_name)
        except NotFound:
            # Fall back to host/bridge if network not created
            logger.warning(f"Network {network_name} not found, checking bridge...")
            network_name = "bridge"

        # 5. Start new container
        logger.info(f"Starting agent container {container_name} on network {network_name}...")
        client.containers.run(
            "cloudmonitor-agent:latest",
            name=container_name,
            detach=True,
            restart_policy={"Name": "unless-stopped"},
            network=network_name,
            mounts=[
                docker.types.Mount(
                    target="/var/run/docker.sock",
                    source="/var/run/docker.sock",
                    type="bind",
                    read_only=True
                )
            ],
            environment={
                "CLOUDMONITOR_SERVER": server_url,
                "CLOUDMONITOR_AGENT_KEY": agent_key,
                "AGENT_POLL_INTERVAL": "5",
                "AGENT_HEARTBEAT_INTERVAL": "10",
            }
        )
        return False, f"Agent container '{container_name}' started successfully and connected to {network_name}."
