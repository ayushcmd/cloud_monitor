import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional, Tuple
import docker
from docker.errors import DockerException

from agent.config import config

logger = logging.getLogger("cloudmonitor-agent")

def calculate_cpu_percent(stats: Dict[str, Any], precpu_stats: Dict[str, Any]) -> float:
    """
    Computes container CPU percentage accurately from Docker stats delta.
    Formula: (cpu_delta / system_delta) * number_cpus * 100.0
    """
    try:
        cpu_usage = stats.get("cpu_stats", {}).get("cpu_usage", {})
        precpu_usage = precpu_stats.get("cpu_stats", {}).get("cpu_usage", {})

        cpu_delta = float(cpu_usage.get("total_usage", 0) - precpu_usage.get("total_usage", 0))
        system_delta = float(stats.get("cpu_stats", {}).get("system_cpu_usage", 0) - precpu_stats.get("cpu_stats", {}).get("system_cpu_usage", 0))

        online_cpus = stats.get("cpu_stats", {}).get("online_cpus")
        if not online_cpus:
            percpu = cpu_usage.get("percpu_usage")
            online_cpus = len(percpu) if percpu else 1

        if system_delta > 0.0 and cpu_delta > 0.0:
            cpu_percent = (cpu_delta / system_delta) * float(online_cpus) * 100.0
            return round(cpu_percent, 2)
    except Exception as e:
        logger.debug(f"Error calculating CPU percent: {e}")

    return 0.0

def calculate_memory_usage(stats: Dict[str, Any]) -> Tuple[int, int]:
    """
    Computes effective container memory usage (RSS/working set) and limit in bytes.
    Excludes cached filesystem pages in accordance with cgroup v1/v2 accounting.
    """
    try:
        mem_stats = stats.get("memory_stats", {})
        raw_usage = mem_stats.get("usage", 0)
        limit = mem_stats.get("limit", 0)

        stats_detail = mem_stats.get("stats", {})
        # cgroup v1 uses 'cache', cgroup v2 uses 'inactive_file'
        cache = stats_detail.get("inactive_file", stats_detail.get("cache", 0))
        effective_usage = max(0, raw_usage - cache)

        return effective_usage, limit
    except Exception as e:
        logger.debug(f"Error calculating memory: {e}")
        return 0, 0

class DockerMetricsCollector:
    def __init__(self):
        self.client: Optional[docker.DockerClient] = None

    def get_client(self) -> docker.DockerClient:
        if self.client is None:
            try:
                # Try standard environment / socket
                self.client = docker.from_env()
                self.client.ping()
            except DockerException:
                # Fallback to configured DOCKER_HOST
                self.client = docker.DockerClient(base_url=config.DOCKER_HOST)
                self.client.ping()
        return self.client

    def ping(self) -> bool:
        try:
            client = self.get_client()
            return client.ping()
        except Exception:
            self.client = None
            return False

    def get_docker_version(self) -> str:
        try:
            client = self.get_client()
            ver_info = client.version()
            return ver_info.get("Version", "unknown")
        except Exception:
            return "unknown"

    def collect(self) -> List[Dict[str, Any]]:
        """
        Collects essential operational metrics for all local containers.
        STRICT PRIVACY: Never collects environment variables, secrets, command lines, or application files.
        """
        client = self.get_client()
        containers = client.containers.list(all=True)
        results = []
        now = datetime.now(timezone.utc).isoformat()

        for container in containers:
            try:
                attrs = container.attrs
                state_info = attrs.get("State", {})
                state = state_info.get("Status", container.status)

                health_dict = state_info.get("Health")
                health_status = health_dict.get("Status") if health_dict else None
                restart_count = attrs.get("RestartCount", 0)

                # Stream stats once (stream=False)
                cpu_percent = 0.0
                memory_bytes = 0
                memory_limit = 0

                if state == "running":
                    try:
                        raw_stats = container.stats(stream=False)
                        precpu_stats = raw_stats.get("precpu_stats", {})
                        cpu_percent = calculate_cpu_percent(raw_stats, precpu_stats)
                        memory_bytes, memory_limit = calculate_memory_usage(raw_stats)
                    except Exception as stats_err:
                        logger.debug(f"Could not read stats for {container.name}: {stats_err}")

                # Image name resolution
                image_name = "unknown"
                if container.image and container.image.tags:
                    image_name = container.image.tags[0]
                elif container.image:
                    image_name = container.image.short_id

                results.append({
                    "container_id": container.short_id,
                    "name": container.name.lstrip("/"),
                    "image": image_name,
                    "state": state,
                    "health_status": health_status,
                    "cpu_percent": cpu_percent,
                    "memory_bytes": memory_bytes,
                    "memory_limit": memory_limit,
                    "restart_count": restart_count,
                    "recorded_at": now,
                })
            except Exception as item_err:
                logger.warning(f"Error inspecting container {container.id[:12]}: {item_err}")
                continue

        return results
