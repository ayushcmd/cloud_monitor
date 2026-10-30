import os
import platform
import logging
from typing import Optional

logger = logging.getLogger("cloudmonitor-agent")

class AgentConfig:
    def __init__(self):
        raw_server = os.getenv("CLOUDMONITOR_SERVER", "http://localhost:8000").strip().rstrip("/")
        if raw_server and not (raw_server.startswith("http://") or raw_server.startswith("https://")):
            raw_server = f"https://{raw_server}"

        self.SERVER_URL: str = raw_server
        self.AGENT_KEY: str = os.getenv("CLOUDMONITOR_AGENT_KEY", "").strip()

        # TLS / HTTPS Configuration
        self.VERIFY_SSL: bool = os.getenv("CLOUDMONITOR_VERIFY_SSL", "true").lower() in ("true", "1", "yes")
        self.CA_CERT_PATH: Optional[str] = os.getenv("CLOUDMONITOR_CA_CERT", "").strip() or None

        # Intervals (in seconds)
        self.POLL_INTERVAL: int = int(os.getenv("AGENT_POLL_INTERVAL", "15"))
        self.HEARTBEAT_INTERVAL: int = int(os.getenv("AGENT_HEARTBEAT_INTERVAL", "30"))

        # Docker Socket URL / Host
        # SECURITY NOTE: Always use local IPC unix:///var/run/docker.sock with read-only (:ro) mount.
        # NEVER expose or connect to unauthenticated Docker daemon over TCP port 2375.
        self.DOCKER_HOST: str = os.getenv("DOCKER_HOST", "unix:///var/run/docker.sock").strip()

        # Host Identity Metadata (for heartbeat)
        self.AGENT_VERSION: str = os.getenv("AGENT_VERSION", "1.1.0")
        self.HOSTNAME: str = os.getenv("AGENT_HOSTNAME", platform.node())
        self.OS_INFO: str = f"{platform.system()} {platform.release()}"

    def validate(self):
        """Validates configuration parameters and enforces security constraints."""
        # Enforce rejection of unauthenticated Docker TCP 2375
        if self.DOCKER_HOST.startswith("tcp://") and ":2375" in self.DOCKER_HOST:
            raise ValueError(
                "CRITICAL SECURITY ERROR: Unauthenticated Docker TCP port 2375 is strictly forbidden. "
                "Exposing Docker over unauthenticated TCP permits arbitrary root command execution on the host. "
                "Use local Unix socket IPC (unix:///var/run/docker.sock) mounted read-only (:ro), or mutual TLS (port 2376)."
            )

        # Warn if using plain HTTP over non-loopback addresses
        is_loopback = any(h in self.SERVER_URL for h in ("localhost", "127.0.0.1", "::1", "host.docker.internal"))
        if self.SERVER_URL.startswith("http://") and not is_loopback:
            logger.warning(
                "SECURITY WARNING: Agent is configured with unencrypted HTTP (%s) for a remote host. "
                "Telemetrics and authentication tokens should only traverse encrypted HTTPS connections in production.",
                self.SERVER_URL
            )

config = AgentConfig()
config.validate()
