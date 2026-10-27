import sys
import time
import signal
import logging
from agent.config import config
from agent.collector import DockerMetricsCollector
from agent.sender import MetricsSender

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)
logger = logging.getLogger("cloudmonitor-agent")

running = True

def handle_shutdown(signum, frame):
    global running
    logger.info("Shutdown signal received. Stopping Docker monitoring agent...")
    running = False

def run_agent():
    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    logger.info("==================================================")
    logger.info(f"  CloudMonitor Lightweight Docker Agent v{config.AGENT_VERSION}      ")
    logger.info("==================================================")
    logger.info(f"Target Server:   {config.SERVER_URL}")
    logger.info(f"Poll Interval:   {config.POLL_INTERVAL}s")
    logger.info(f"Heartbeat:       {config.HEARTBEAT_INTERVAL}s")
    logger.info(f"Docker Socket:   {config.DOCKER_HOST}")
    logger.info(f"Host System:     {config.HOSTNAME} ({config.OS_INFO})")

    if not config.AGENT_KEY:
        logger.error("FATAL: CLOUDMONITOR_AGENT_KEY environment variable is not set!")
        logger.error("Please enroll an agent in your CloudMonitor dashboard and pass the generated key.")
        sys.exit(1)

    logger.info("Agent key detected. Initializing Docker connection...")

    collector = DockerMetricsCollector()
    sender = MetricsSender()

    # Wait for Docker connectivity with retry
    docker_ready = False
    retry_count = 0
    while running and not docker_ready:
        if collector.ping():
            docker_ready = True
            logger.info("Successfully connected to Docker engine daemon.")
        else:
            retry_count += 1
            logger.warning(f"Waiting for Docker daemon at {config.DOCKER_HOST}... (attempt {retry_count})")
            time.sleep(min(retry_count * 2, 10))

    if not running:
        return

    docker_version = collector.get_docker_version()
    logger.info(f"Docker Engine Version: {docker_version}")

    # Immediate initial heartbeat
    sender.send_heartbeat(docker_version)
    last_heartbeat_time = time.time()

    # Main telemetry loop
    while running:
        loop_start = time.time()

        try:
            # 1. Periodic Heartbeat
            if loop_start - last_heartbeat_time >= config.HEARTBEAT_INTERVAL:
                sender.send_heartbeat(docker_version)
                last_heartbeat_time = loop_start

            # 2. Collect & Transmit Metrics
            containers_data = collector.collect()
            if containers_data:
                logger.debug(f"Collected telemetry for {len(containers_data)} containers.")
                sender.send_metrics(containers_data)
            else:
                logger.info("No active or stopped containers found on this Docker host.")
        except Exception as err:
            logger.error(f"Error during agent telemetry collection loop: {err}")

        # Sleep remaining time until next poll interval
        elapsed = time.time() - loop_start
        sleep_duration = max(1.0, config.POLL_INTERVAL - elapsed)

        # Check running state periodically during sleep
        sleep_end = time.time() + sleep_duration
        while running and time.time() < sleep_end:
            time.sleep(0.5)

    logger.info("CloudMonitor Docker Agent exited cleanly.")

if __name__ == "__main__":
    run_agent()
