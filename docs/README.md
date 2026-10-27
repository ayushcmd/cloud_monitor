# CloudMonitor — Cloud Computing Mini Project

**IIT Patna · BSc CSDA · 5th Semester · Cloud Computing**

CloudMonitor is a self-hosted observability platform for monitoring Docker hosts and containers. It combines a React dashboard, a FastAPI backend, PostgreSQL persistence, a lightweight Docker monitoring agent, and a Prometheus-based monitoring stack. It is an academic mini project demonstrating cloud-hosted application deployment, container telemetry collection, metrics-based monitoring, and operational visibility.

> **Academic project notice:** This repository documents a student mini project, not a managed or enterprise-certified monitoring service. The local development stack and current AWS deployment have different service coverage. See the [Project Build & Architecture](PROJECT_BUILD_AND_ARCHITECTURE.md) and [AWS Deployment & Operations](AWS_DEPLOYMENT_AND_OPERATIONS.md) guides for implementation details and limitations.

[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?logo=prometheus)](https://prometheus.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](../LICENSE)

---

## Live demo

**Web application:** [http://3.25.150.231](http://3.25.150.231)

This is the current demo URL for the project. It uses **HTTP, not HTTPS**. Treat it as a demonstration endpoint only: do not reuse passwords, submit sensitive information, or connect a production monitoring agent with a real credential over plain HTTP. Use a throwaway account for classroom demonstration until HTTPS is verified and enabled. Availability can change.

Source code and issue tracking: [github.com/ayushcmd/cloud_monitor](https://github.com/ayushcmd/cloud_monitor).

## Project idea and problem statement

### Problem statement

Developers and small teams running Dockerized applications need a practical way to understand whether their containers are running, how much CPU and memory they use, and whether a host or application is becoming unhealthy. Checking every machine manually or relying only on logs makes it difficult to see fleet-wide status and relate application behavior to metrics.

### Proposed solution

CloudMonitor provides a web dashboard and a small agent that reads operational information from a host’s Docker daemon and sends heartbeats and container metrics to the CloudMonitor API. The API stores user, agent, and metric records in PostgreSQL. Prometheus scrapes selected application and host metrics, while alert rules demonstrate how operational conditions can be evaluated. Grafana dashboards are provisioned in the local development stack.

The project focuses on a compact, understandable monitoring workflow rather than replacing a full enterprise observability platform.

### Why it is useful

- **One place to inspect:** review enrolled hosts and reported Docker containers in the dashboard.
- **Operational telemetry:** record container status and resource metrics, and expose application metrics to Prometheus.
- **Host visibility:** use Node Exporter to expose machine-level metrics such as CPU and memory.
- **Health and fault demonstrations:** use development-only simulation endpoints to exercise latency, error-rate, and health-state monitoring.
- **Cloud computing practice:** combine a cloud VM, container deployment, service networking, persistent storage, monitoring components, and a web application.

### Potential users and industries

Potential settings include software-development teams, DevOps/SRE practice, small SaaS teams, web agencies, student labs, internal test environments, and organizations running a small Docker estate. The project demonstrates concepts used in IT operations, education, cloud-hosted software, and application support. It is not currently presented as a substitute for managed enterprise monitoring.

## Features and components

- **Web frontend:** React 18 and Vite, served by Nginx in Docker.
- **Backend API:** Python and FastAPI; authentication, agent enrollment, heartbeats, metrics ingestion, status, and health routes.
- **Persistence:** PostgreSQL 16, SQLAlchemy models, and Alembic migration files.
- **Docker monitoring agent:** a Python process that reads Docker container metadata/resource statistics and sends telemetry.
- **Metrics and alert rules:** Prometheus, Node Exporter, application instrumentation, and Prometheus alert rules.
- **Local observability tools:** Grafana and cAdvisor are included in the local Compose configuration. The current Prometheus configuration does not define a cAdvisor scrape target.
- **AWS deployment files:** production Compose configuration, an optional Caddy TLS profile, deployment notes, and GitHub Actions workflows.

## Architecture overview

~~~mermaid
flowchart LR
    U[User browser] -->|HTTP demo / web UI| N[Nginx frontend]
    N -->|/api/* and health routes| B[FastAPI backend]
    B --> DB[(PostgreSQL)]
    A[Docker monitoring agent on monitored host] -->|Heartbeat + container metrics| B
    P[Prometheus] -->|Scrape /metrics| B
    P -->|Scrape host metrics| NE[Node Exporter]
    P --> AR[Prometheus alert rules]
    AR --> AM[Alertmanager]
    L[Local development stack] -. includes .-> G[Grafana]
    L -. includes .-> C[cAdvisor]
    AWS[AWS EC2 host] --- N
    AWS --- B
    AWS --- DB
    AWS --- P
~~~

The diagram is logical. The exact enabled services and exposed ports depend on the Compose file. The current production Compose file includes PostgreSQL, backend, frontend, Prometheus, Node Exporter, and Alertmanager. Grafana and cAdvisor are present in local Compose, not as services in the current production Compose file. Caddy is defined behind an optional TLS profile and should not be assumed active on the HTTP demo URL.

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18, JavaScript, Vite, Lucide React | Dashboard and user interactions |
| Web serving/proxy | Nginx | Serve the static UI and proxy selected API/Prometheus paths |
| Backend | Python, FastAPI, Uvicorn | REST API and health routes |
| Authentication | Password hashing, JWT bearer tokens | User sign-in and protected API access |
| Data layer | PostgreSQL 16, SQLAlchemy, Alembic | Persistent users, agents, and telemetry records |
| Agent | Python, Docker SDK, Requests | Collect Docker metrics and send authenticated heartbeats/telemetry |
| Metrics | Prometheus client and Prometheus server | Instrument the API and scrape configured targets |
| Host monitoring | Node Exporter | Expose host OS metrics |
| Container metrics support | cAdvisor | Included in local Compose; scrape integration is not assumed |
| Dashboards | Grafana | Provisioned local datasource and dashboard |
| Alerting | Prometheus rules and Alertmanager | Evaluate/group/route alerts; external receivers are not configured in the current receiver file |
| Packaging | Docker and Docker Compose | Build and run services consistently |
| Cloud deployment | AWS EC2, security groups, instance storage, GitHub Actions | Host the deployment and run CI / SSH-based CD workflow |
| Optional TLS | Caddy and Let's Encrypt configuration | Defined in the production Compose TLS profile; not confirmed active on the demo URL |

## Try the hosted demo

1. Open [http://3.25.150.231](http://3.25.150.231).
2. Use a throwaway test account for demonstration purposes.
3. Explore the dashboard and Docker connection workflow.
4. To connect a host, use the **Connect Docker Environment** flow to generate an agent key, then follow [agent/README.md](../agent/README.md).
5. Do not use this HTTP demo with production credentials or sensitive telemetry. HTTPS must be verified before sending real agent keys over the public internet.

The hosted instance is shared infrastructure. Do not send fault-injection requests to production: simulation endpoints are intended for development/test environments and should return 403 outside those environments.

## Run CloudMonitor locally

### Prerequisites

- Git
- Docker Engine with Docker Compose v2, or Docker Desktop
- A few GB of available memory for the full local stack
- A supported environment with Docker access if you want to test agent telemetry

### 1. Clone the correct repository

~~~bash
git clone https://github.com/ayushcmd/cloud_monitor.git
cd cloud_monitor
~~~

### 2. Create a local environment file

Linux/macOS:

~~~bash
cp .env.example .env
~~~

Windows PowerShell:

~~~powershell
Copy-Item .env.example .env
~~~

The example file is intended for local development. Review it before running; do not copy development defaults into a public production environment or commit a real .env file.

### 3. Start the local stack

~~~bash
docker compose --profile frontend up -d --build
docker compose ps
~~~

The frontend is behind a Compose profile in the local configuration, so the profile is explicitly enabled above.

### 4. Open local services

| Service | Local URL | Notes |
|---|---|---|
| Web frontend | http://localhost:5173 | React UI |
| Backend API | http://localhost:8000 | Published on loopback by local Compose |
| FastAPI Swagger UI | http://localhost:8000/docs | Interactive API documentation |
| FastAPI ReDoc | http://localhost:8000/redoc | Alternative API documentation |
| Prometheus | http://localhost:9090 | Local-only port |
| Grafana | http://localhost:3000 | Local Compose; credentials come from environment configuration |
| Alertmanager | http://localhost:9093 | Local Compose |
| Node Exporter | http://localhost:9100/metrics | Host metrics endpoint on loopback |
| cAdvisor | http://localhost:8080 | Local Compose |
| PostgreSQL | localhost:5433 | Local-only port mapping; do not expose publicly |

### 5. Useful commands

~~~bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f prometheus
docker compose logs -f alertmanager
docker compose down
~~~

The final command stops/removes the local Compose resources but does not include the volume-deletion flag. Do not run destructive volume commands unless you intentionally want to delete local data. For production, follow [AWS_DEPLOYMENT_AND_OPERATIONS.md](AWS_DEPLOYMENT_AND_OPERATIONS.md) rather than these local commands.

### 6. Run the backend without Docker (optional)

Use Python 3.12 if possible. From the repository root:

~~~bash
python -m venv .venv
~~~

Activate it:

Linux/macOS:
~~~bash
source .venv/bin/activate
~~~

Windows PowerShell:
~~~powershell
.\.venv\Scripts\Activate.ps1
~~~

Install dependencies and start the API:

~~~bash
pip install -r backend/requirements.txt
PYTHONPATH=backend uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
~~~

The standalone backend needs a valid database configuration for database-backed routes. The full Compose setup is the simpler starting point.

## API endpoint overview

Use the local Swagger UI at http://localhost:8000/docs to inspect request schemas and responses. These paths are defined in the backend source; whether they are externally reachable depends on the reverse-proxy configuration.

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | / | API service info | Public API |
| GET | /health | Health status and component summary | Public API |
| GET | /api/health | Health route under /api | Public API |
| GET | /api/v1/status | High-level operational status | Public API |
| GET | /metrics | Prometheus application/runtime metrics | Internal backend scrape endpoint |
| POST | /api/v1/auth/register | Create account | Public |
| POST | /api/v1/auth/login | Authenticate and issue JWT | Public |
| GET | /api/v1/auth/me | Current user profile | JWT bearer token |
| POST | /api/v1/agents/enroll | Enroll a host and issue an agent key | JWT bearer token |
| GET | /api/v1/agents | List the user's enrolled agents | JWT bearer token |
| GET | /api/v1/agents/{agent_id}/connection-status | Inspect connection progress | JWT bearer token |
| POST | /api/v1/agents/{agent_id}/rotate-key | Rotate an agent key | JWT bearer token |
| DELETE | /api/v1/agents/{agent_id} | Revoke/disconnect an agent; supports a purge query option | JWT bearer token |
| POST | /api/v1/agents/heartbeat | Send agent heartbeat | X-Agent-Key header |
| POST | /api/v1/metrics/ingest | Submit a container metrics batch | X-Agent-Key header |
| GET | /api/v1/metrics/containers | List the user's container metrics | JWT bearer token |
| POST | /api/v1/simulate/error | Simulate HTTP 500 for monitoring tests | Development/test only |
| GET | /api/v1/simulate/latency?delay=1.5 | Simulate delay up to 10 seconds | Development/test only |
| POST | /api/v1/simulate/health-toggle?status=false | Change the demonstration health gauge | Development/test only |

The frontend Nginx configuration proxies selected paths. It does not proxy every backend route, such as /docs or /metrics, at the public root. Direct local backend URLs are the reliable way to inspect all routes.

## Monitoring concepts

- **Prometheus** periodically scrapes numeric metrics from configured targets and evaluates rule expressions.
- **Node Exporter** exposes host operating-system metrics; it is different from the Docker agent.
- **The CloudMonitor agent** reads Docker container metadata and CPU/memory statistics, then sends records to the API.
- **cAdvisor** is available in local Compose, but the current Prometheus scrape configuration does not include it as a target.
- **Grafana** visualizes metrics from a configured datasource. It is included in local Compose, not the current production Compose stack.
- **Alertmanager** groups/routes Prometheus alerts. The current receiver configuration has empty webhook lists, so external notifications must not be assumed to work.

See [PROJECT_BUILD_AND_ARCHITECTURE.md](PROJECT_BUILD_AND_ARCHITECTURE.md) for the end-to-end explanation.

## CI/CD status

The repository includes a CI workflow for Python/agent tests, frontend build, and Compose validation. It also defines an SSH-based GitHub Actions CD workflow for EC2 with health/telemetry checks.

During recent debugging, runner-to-EC2 SSH connectivity failed because GitHub-hosted runner IPs change and the EC2 security-group allowlist did not permit the active runner. Therefore, automated production deployment is a **known limitation, not a confirmed healthy end-to-end pipeline**. The future Systems Manager migration is tracked in [issue #9](https://github.com/ayushcmd/cloud_monitor/issues/9). Details are in [AWS_DEPLOYMENT_AND_OPERATIONS.md](AWS_DEPLOYMENT_AND_OPERATIONS.md).

## Team

**BSc CSDA students · IIT Patna · 5th Semester**

- Sarnendu Das
- Parveen Kumar
- Ayush Raj

This is a collaborative Cloud Computing mini project. Individual contributions are not assigned here because roles have not been confirmed.

## Documentation

- [Project Build & Architecture](PROJECT_BUILD_AND_ARCHITECTURE.md) — problem, design, components, data flows, APIs, monitoring and limitations.
- [AWS Deployment & Operations](AWS_DEPLOYMENT_AND_OPERATIONS.md) — EC2 architecture, Compose, networking, environment configuration, monitoring, CI/CD, recovery and troubleshooting.
- [Backend API README](../backend/README.md)
- [Docker Agent README](../agent/README.md)
- [AWS deployment source guide](DEPLOYMENT_AWS.md)
- [CI/CD setup guide](CICD_SETUP_GUIDE.md)

## License

CloudMonitor is licensed under the MIT License. See [LICENSE](../LICENSE).
