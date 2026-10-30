# CloudMonitor Lightweight Docker Monitoring Agent

> A secure, lightweight Python agent that monitors local Docker containers and streams operational telemetry (CPU, Memory RSS, Lifecycle State, Restart Counts, Health Status) to your hosted CloudMonitor dashboard over HTTPS.

---

## 1. Security Architecture & Socket Permissions

### Docker Socket Security Implications
Mounting `/var/run/docker.sock` allows an application to communicate directly with the local Docker daemon. Because the Docker daemon runs with root privileges on the host system:
- **Write access to the Docker socket allows full host takeover**: A container with write access to `docker.sock` can launch arbitrary privileged containers that mount the host's root filesystem `/` and execute arbitrary root commands.
- **Read-only restriction (`:ro`)**: CloudMonitor strictly requires and specifies read-only access (`-v /var/run/docker.sock:/var/run/docker.sock:ro`). In read-only mode, the agent can only invoke non-mutating inspection endpoints (`containers.list`, `stats`, `version`). The agent cannot start, stop, create, delete, or modify any container, network, or volume on your machine.
- **Strict Prohibition of TCP Port 2375**: **Never bind the Docker daemon to an unauthenticated TCP port (e.g. `0.0.0.0:2375`)**. Doing so exposes root execution capabilities across the entire network without any authentication. CloudMonitor's agent explicitly rejects connections configured to unauthenticated port 2375 with a critical validation error.

### Privacy Guarantees
- **Zero Secrets Harvested**: CloudMonitor strictly filters out container environment variables (`env`), command-line invocation strings (`cmd`), filesystem paths, and configuration files. Only operational telemetry (CPU, Memory RSS, status, health) is captured.
- **Outbound Telemetry Only**: The agent initiates all connections outward to the CloudMonitor HTTPS API. It does not open or listen on any host network ports.
- **Authenticated & Isolated**: Telemetry is signed via the user's high-entropy agent key (`X-Agent-Key`) and stored strictly within the user's isolated account in PostgreSQL.

---

## 2. Quickstart with Docker (Recommended)

1. **Obtain your Agent Key** from the CloudMonitor dashboard:
   - Click **Connect Docker Environment**
   - Click **Generate New Agent Key**
   - Copy the generated key (`cma_...`)

2. **Run the Agent Container against your AWS Backend**:
   ```bash
   docker run -d \
     --name cloudmonitor-agent \
     --restart unless-stopped \
     -v /var/run/docker.sock:/var/run/docker.sock:ro \
     -e CLOUDMONITOR_SERVER="https://cloudmonitor.yourdomain.com" \
     -e CLOUDMONITOR_AGENT_KEY="YOUR_GENERATED_AGENT_KEY" \
     cloudmonitor-agent:latest
   ```

   *(For local development, replace `CLOUDMONITOR_SERVER` with `http://host.docker.internal:8000` or `http://localhost:8000`)*

3. **Check Agent Logs**:
   ```bash
   docker logs -f cloudmonitor-agent
   ```

---

## 3. Running Locally (Python 3.10+)

```bash
# 1. Create and activate a virtual environment
python -m venv venv
# On Linux/macOS:
source venv/bin/activate
# On Windows (PowerShell):
.\venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r agent/requirements.txt

# 3. Configure environment variables
export CLOUDMONITOR_SERVER="https://cloudmonitor.yourdomain.com"
export CLOUDMONITOR_AGENT_KEY="YOUR_GENERATED_AGENT_KEY"

# 4. Start agent daemon
python -m agent.main
```

---

## 4. Configuration Reference

| Environment Variable | Default | Description |
| :--- | :--- | :--- |
| `CLOUDMONITOR_SERVER` | `http://localhost:8000` | CloudMonitor backend API base URL. Use `https://...` for production AWS deployments. |
| `CLOUDMONITOR_AGENT_KEY` | *(Required)* | One-time high-entropy enrollment credential (`cma_...`). |
| `CLOUDMONITOR_VERIFY_SSL` | `true` | Validates remote HTTPS TLS certificates. Set to `false` only during development. |
| `CLOUDMONITOR_CA_CERT` | *(None)* | Optional file path to custom CA certificate bundle for private PKI. |
| `AGENT_POLL_INTERVAL` | `15` | Container metrics collection interval in seconds. |
| `AGENT_HEARTBEAT_INTERVAL` | `30` | Agent heartbeat transmission interval in seconds. |
| `DOCKER_HOST` | `unix:///var/run/docker.sock` | Path to Docker daemon socket. Must never be unauthenticated TCP 2375. |
| `AGENT_HOSTNAME` | Host hostname | Custom friendly label for the host machine. |
