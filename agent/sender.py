import time
import logging
from typing import List, Dict, Any, Optional
import requests
from requests.exceptions import RequestException, SSLError

from agent.config import config

logger = logging.getLogger("cloudmonitor-agent")

class MetricsSender:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            "User-Agent": f"CloudMonitor-DockerAgent/{config.AGENT_VERSION}",
            "Content-Type": "application/json",
            "X-Agent-Key": config.AGENT_KEY,
        })

        # Configure SSL / TLS certificate verification
        if config.CA_CERT_PATH:
            self.session.verify = config.CA_CERT_PATH
        elif not config.VERIFY_SSL:
            self.session.verify = False
            import urllib3
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    def send_heartbeat(self, docker_version: Optional[str] = None) -> bool:
        """Sends periodic agent heartbeat to confirm host connectivity with exponential backoff."""
        url = f"{config.SERVER_URL}/api/v1/agents/heartbeat"
        payload = {
            "hostname": config.HOSTNAME,
            "os_info": config.OS_INFO,
            "docker_version": docker_version or "unknown",
            "agent_version": config.AGENT_VERSION,
        }

        max_retries = 3
        backoff = 1.0

        for attempt in range(1, max_retries + 1):
            try:
                res = self.session.post(url, json=payload, timeout=8.0)
                if res.status_code == 200:
                    logger.info(f"Heartbeat delivered successfully to {config.SERVER_URL}")
                    return True
                elif res.status_code in (401, 403):
                    logger.error(
                        f"Agent authentication failed ({res.status_code}): {res.text}. "
                        "Please verify or rotate credentials in the CloudMonitor dashboard."
                    )
                    return False
                else:
                    logger.warning(f"Heartbeat received non-200 response ({res.status_code}): {res.text}")
            except SSLError as e:
                logger.error(
                    f"SSL/TLS certificate verification failed connecting to {config.SERVER_URL}: {e}. "
                    "Ensure the server has a valid SSL certificate or configure CLOUDMONITOR_CA_CERT."
                )
                return False
            except RequestException as e:
                if attempt < max_retries:
                    logger.warning(f"Connection attempt {attempt} to {config.SERVER_URL} failed ({e}). Retrying in {backoff:.1f}s...")
                    time.sleep(backoff)
                    backoff *= 2.0
                else:
                    logger.warning(f"Could not reach CloudMonitor backend at {config.SERVER_URL} after {max_retries} attempts: {e}")
                    return False

        return False

    def send_metrics(self, containers: List[Dict[str, Any]]) -> bool:
        """Submits batch of container telemetry to backend ingestion endpoint with exponential backoff."""
        url = f"{config.SERVER_URL}/api/v1/metrics/ingest"
        payload = {
            "containers": containers
        }

        max_retries = 3
        backoff = 1.0

        for attempt in range(1, max_retries + 1):
            try:
                res = self.session.post(url, json=payload, timeout=10.0)
                if res.status_code == 200:
                    logger.info(f"Ingested metrics for {len(containers)} containers successfully.")
                    return True
                elif res.status_code in (401, 403):
                    logger.error(f"Agent authentication rejected during ingestion ({res.status_code}): {res.text}")
                    return False
                else:
                    logger.warning(f"Metrics ingestion received HTTP {res.status_code}: {res.text}")
            except SSLError as e:
                logger.error(
                    f"SSL/TLS certificate verification failed connecting to {config.SERVER_URL}: {e}. "
                    "Ensure the server has a valid SSL certificate or configure CLOUDMONITOR_CA_CERT."
                )
                return False
            except RequestException as e:
                if attempt < max_retries:
                    logger.warning(f"Metrics post attempt {attempt} failed ({e}). Retrying in {backoff:.1f}s...")
                    time.sleep(backoff)
                    backoff *= 2.0
                else:
                    logger.warning(f"Failed to post container metrics to {config.SERVER_URL} after {max_retries} attempts: {e}")
                    return False

        return False
