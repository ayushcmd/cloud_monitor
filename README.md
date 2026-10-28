# CloudMonitor

A self-hosted observability platform for monitoring Docker hosts and containers.

CloudMonitor combines a React dashboard, a FastAPI backend, PostgreSQL persistence, a lightweight Docker monitoring agent, and a Prometheus-based monitoring stack. It was built as the Cloud Computing mini project for the BSc Computer Science and Data Analytics program (5th semester) at IIT Patna, and demonstrates cloud-hosted application deployment, container telemetry collection, metrics-based monitoring, and operational visibility.

<details>
  <summary><strong> View CloudMonitor Team Project Presentation (PPT)</strong></summary>

  <br>

  <p>
    Explore the CloudMonitor Cloud Computing Mini Project presentation,
    covering the project overview, architecture, technology stack,
    monitoring and observability, AWS deployment, and team contributions.
  </p>

  <p>
    <a href="docs/CloudMonitor_Cloud_Computing_Mini_Project_.pptx">
      📥 View / Download Project PPT
    </a>
  </p>

</details>


> **Academic project:** This repository documents a student mini project. It is not a managed or enterprise-certified monitoring service. The local development stack and the current AWS deployment have different service coverage. See [Known limitations](#known-limitations) for the full list.



[![Python](https://img.shields.io/badge/Python-3.12-blue?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-API-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://react.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://www.docker.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?logo=prometheus)](https://prometheus.io/)
[![License](https://img.shields.io/badge/License-MIT-yellow)](LICENSE)

## Table of contents

- [Overview](#overview)
- [Live demo](#live-demo)
- [Screenshots](#screenshots)
- [Problem and solution](#problem-and-solution)
- [Features](#features)
- [Architecture](#architecture)
- [Technology stack](#technology-stack)
- [Repository structure](#repository-structure)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Connecting a Docker host](#connecting-a-docker-host)
- [API reference](#api-reference)
- [Monitoring stack](#monitoring-stack)
- [Testing](#testing)
- [AWS deployment](#aws-deployment)
- [CI and CD](#ci-and-cd)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Team](#team)
- [Documentation](#documentation)
- [License](#license)

## Overview

| Item | Detail |
|---|---|
| Purpose | Monitor Docker hosts and the containers running on them from one dashboard |
| Frontend | React 18 and Vite, served by Nginx |
| Backend | Python and FastAPI with JWT authentication |
| Database | PostgreSQL 16 with SQLAlchemy models and Alembic migrations |
| Agent | Python process that reads the Docker daemon and reports to the API |
| Monitoring | Prometheus, Node Exporter, Alertmanager, with Grafana and cAdvisor in the local stack |
| Deployment | Docker Compose locally, AWS EC2 for the hosted demo |
| Source and issues | [github.com/ayushcmd/cloud_monitor](https://github.com/ayushcmd/cloud_monitor) |

## Live demo

**Web application:** [http://3.25.150.231](http://3.25.150.231)

The demo is served over **HTTP, not HTTPS**. Treat it as a demonstration endpoint only:

- Use a throwaway account. Do not reuse passwords or submit sensitive information.
- Do not connect an agent with a real credential or send sensitive telemetry over plain HTTP.
- The instance is shared infrastructure and its availability can change.
- Do not send fault-injection requests to it. The simulation endpoints are intended for development and test environments and return 403 elsewhere.

To try it: open the URL, register a throwaway account, explore the dashboard, and use the **Connect Docker Environment** flow if you want to see agent enrollment. The full procedure is in [Connecting a Docker host](#connecting-a-docker-host).

## Screenshots

The images are stored in `docs/`, so these relative paths also work when the README is viewed on GitHub.

### Dashboard overview

![CloudMonitor dashboard overview](docs/dashboard.png)

### Metrics and monitoring

![CloudMonitor metrics view](docs/metrics.png)

### AWS EC2 Instance Running 

![CloudMonitor metrics view](docs/ec2_overview.png)

## Problem and solution

### Problem statement

Developers and small teams running Dockerized applications need a practical way to know whether their containers are running, how much CPU and memory they use, and whether a host or application is becoming unhealthy. Checking each machine by hand, or relying only on logs, makes it hard to see fleet-wide status and to relate application behavior to metrics.

### Proposed solution

CloudMonitor provides a web dashboard and a small agent. The agent reads operational information from a host's Docker daemon and sends heartbeats and container metrics to the CloudMonitor API. The API stores user, agent, and metric records in PostgreSQL. Prometheus scrapes selected application and host metrics, and alert rules show how operational conditions can be evaluated. Grafana dashboards are provisioned in the local development stack.

The project focuses on a compact, understandable monitoring workflow. It does not try to replace a full enterprise observability platform.

### Why it is useful

- **One place to inspect:** review enrolled hosts and reported Docker containers in the dashboard.
- **Operational telemetry:** record container status and resource metrics, and expose application metrics to Prometheus.
- **Host visibility:** use Node Exporter to expose machine-level metrics such as CPU and memory.
- **Health and fault demonstrations:** use development-only simulation endpoints to exercise latency, error-rate, and health-state monitoring.
- **Cloud computing practice:** combine a cloud VM, container deployment, service networking, persistent storage, monitoring components, and a web application.

### Potential users

Software development teams, DevOps and SRE practice, small SaaS teams, web agencies, student labs, internal test environments, and organizations running a small Docker estate.

## Features

| Component | Description |
|---|---|
| Web frontend | React 18 and Vite dashboard with sign-in and a Docker connection wizard, served by Nginx in Docker |
| Backend API | FastAPI routes for authentication, agent enrollment, heartbeats, metrics ingestion, status, and health |
| Persistence | PostgreSQL 16, SQLAlchemy models, and Alembic migrations |
| Docker monitoring agent | Python process that reads Docker container metadata and resource statistics and sends authenticated telemetry |
| Metrics and alert rules | Application instrumentation, Prometheus, Node Exporter, and Prometheus alert rules |
| Local observability tools | Grafana and cAdvisor in the local Compose configuration |
| AWS deployment files | Production Compose file, optional Caddy TLS profile, EC2 bootstrap script, and GitHub Actions workflows |

## Architecture

### Logical view

```mermaid
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
```

The diagram is logical. The services actually enabled and the ports exposed depend on the Compose file in use.

### Agent enrollment and telemetry flow

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant B as Backend API
    participant D as PostgreSQL
    participant A as Docker agent
    U->>F: Register or sign in
    F->>B: POST /api/v1/auth/login
    B-->>F: JWT bearer token
    U->>F: Connect Docker Environment
    F->>B: POST /api/v1/agents/enroll
    B->>D: Store agent record
    B-->>F: Agent key
    U->>A: Configure agent with the key
    loop While the agent is running
        A->>B: POST /api/v1/agents/heartbeat (X-Agent-Key)
        A->>B: POST /api/v1/metrics/ingest (X-Agent-Key)
        B->>D: Store telemetry
    end
    F->>B: GET /api/v1/metrics/containers
    B-->>F: Container metrics for the signed-in user
```

### Local and production service coverage

| Service | Local Compose | Production Compose |
|---|---|---|
| PostgreSQL | Yes | Yes |
| Backend (FastAPI) | Yes | Yes |
| Frontend (Nginx) | Yes, behind the `frontend` profile | Yes |
| Prometheus | Yes | Yes |
| Node Exporter | Yes | Yes |
| Alertmanager | Yes | Yes |
| Grafana | Yes | No |
| cAdvisor | Yes | No |
| Caddy (TLS) | No | Optional profile, not confirmed active on the demo URL |

## Technology stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React 18, JavaScript, Vite, Lucide React | Dashboard and user interactions |
| Web serving and proxy | Nginx | Serve the static UI and proxy selected API and Prometheus paths |
| Backend | Python, FastAPI, Uvicorn | REST API and health routes |
| Authentication | Password hashing, JWT bearer tokens (HS256) | User sign-in and protected API access |
| Data layer | PostgreSQL 16, SQLAlchemy, Alembic | Persistent users, agents, and telemetry records |
| Agent | Python, Docker SDK, Requests | Collect Docker metrics and send authenticated heartbeats and telemetry |
| Metrics | Prometheus client and Prometheus server | Instrument the API and scrape configured targets |
| Host monitoring | Node Exporter | Expose host operating-system metrics |
| Container metrics support | cAdvisor | Included in local Compose; scrape integration is not assumed |
| Dashboards | Grafana | Provisioned local datasource and dashboard |
| Alerting | Prometheus rules and Alertmanager | Evaluate, group, and route alerts; external receivers are not configured in the current receiver file |
| Packaging | Docker and Docker Compose | Build and run services consistently |
| Cloud deployment | AWS EC2, security groups, instance storage, GitHub Actions | Host the deployment and run the CI and SSH-based CD workflows |
| Optional TLS | Caddy and Let's Encrypt configuration | Defined in the production Compose TLS profile |

## Repository structure

```text
cloud_monitor/
  .github/workflows/
    ci.yml                       CI workflow
    cd.yml                       SSH-based CD workflow for EC2
  agent/                         Docker monitoring agent
    collector.py                 Reads container metadata and statistics from Docker
    config.py                    Agent configuration
    main.py                      Agent entry point
    sender.py                    Sends heartbeats and metrics to the API
    tests/test_agent.py          Agent unit tests
    Dockerfile
    requirements.txt
    README.md
  backend/                       FastAPI application
    alembic/versions/            001 users, 002 agents and metrics, 003 os_type and agent_version
    app/
      auth/security.py           Password hashing and JWT handling
      models/                    user.py, agent.py, metric.py
      routers/                   auth.py, agents.py, metrics.py
      schemas/                   user.py, agent.py, metric.py
      config.py                  Application settings
      database.py                Database session and engine
      health.py                  Health routes
      main.py                    Application entry point
      metrics.py                 Prometheus instrumentation
    alembic.ini
    Dockerfile
    requirements.txt
    README.md
  frontend/                      React and Vite dashboard
    src/
      components/                AuthScreen.jsx, ConnectDockerModal.jsx
      App.jsx
      api.js
      index.css
      main.jsx
    Dockerfile
    nginx.conf
    package.json
    vite.config.js
  monitoring/
    alertmanager/alertmanager.yml
    alerts/rules.yml             Prometheus alert rules
    grafana/                     Provisioned dashboard and datasource
    prometheus/prometheus.yml    Scrape configuration
  scripts/ec2-user-data.sh       EC2 bootstrap script
  tests/                         Backend and integration tests
  docs/                          Detailed documentation and screenshots
  Caddyfile                      Optional TLS reverse proxy configuration
  docker-compose.yml             Local development stack
  docker-compose.prod.yml        Production stack for EC2
  .env.example                   Local environment template
  .env.production.example        Production environment template
  LICENSE
```

## Quick start

### Prerequisites

- Git
- Docker Engine with Docker Compose v2, or Docker Desktop
- A few GB of free memory for the full local stack
- Docker access on the machine if you want to test agent telemetry

### 1. Clone the repository

```bash
git clone https://github.com/ayushcmd/cloud_monitor.git
cd cloud_monitor
```

### 2. Create the environment file

Linux and macOS:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

The example file is intended for local development. Replace the placeholder passwords and the JWT secret before starting, and never commit a real `.env` file. See [Configuration](#configuration) for every variable.

### 3. Start the stack

```bash
docker compose --profile frontend up -d --build
docker compose ps
```

The frontend is behind a Compose profile in the local configuration, so the profile is enabled explicitly above.

### 4. Verify

```bash
curl http://localhost:8000/health
```

Then open the services below.

| Service | Local URL | Notes |
|---|---|---|
| Web frontend | http://localhost:5173 | React UI |
| Backend API | http://localhost:8000 | Published on loopback by local Compose |
| FastAPI Swagger UI | http://localhost:8000/docs | Interactive API documentation |
| FastAPI ReDoc | http://localhost:8000/redoc | Alternative API documentation |
| Prometheus | http://localhost:9090 | Local-only port |
| Grafana | http://localhost:3000 | Credentials come from `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD` in `.env` |
| Alertmanager | http://localhost:9093 | Local Compose |
| Node Exporter | http://localhost:9100/metrics | Host metrics endpoint on loopback |
| cAdvisor | http://localhost:8080 | Local Compose |
| PostgreSQL | localhost:5433 | Local-only port mapping; do not expose publicly |

### Useful commands

```bash
docker compose ps
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f prometheus
docker compose logs -f alertmanager
docker compose down
```

`docker compose down` stops and removes the containers and network but keeps the data volumes. Do not add the volume-deletion flag unless you intentionally want to delete local data. For production, follow [AWS deployment](#aws-deployment) instead of these local commands.

### Run the backend without Docker (optional)

Use Python 3.12 if possible. From the repository root, create and activate a virtual environment.

Linux and macOS:

```bash
python -m venv .venv
source .venv/bin/activate
```

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Install the dependencies and start the API.

Linux and macOS:

```bash
pip install -r backend/requirements.txt
PYTHONPATH=backend uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Windows PowerShell:

```powershell
pip install -r backend/requirements.txt
$env:PYTHONPATH = "backend"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

The standalone backend needs a valid database configuration for database-backed routes. In `.env.example`, `DATABASE_URL` points at the Compose service name `postgres` on port 5432, which only resolves inside the Compose network. For a standalone backend talking to the Compose database, use `localhost` and port 5433 instead. The full Compose setup is the simpler starting point.

## Configuration

All local configuration comes from `.env`, created from `.env.example`. A separate `.env.production.example` is provided for the EC2 deployment; see [AWS_DEPLOYMENT_AND_OPERATIONS.md](docs/AWS_DEPLOYMENT_AND_OPERATIONS.md).

| Variable | Example value | Description |
|---|---|---|
| `APP_NAME` | `CloudMonitor-API` | Application name reported by the API |
| `APP_ENV` | `development` | Environment name. Simulation endpoints are available only in development and test environments |
| `API_PORT` | `8000` | Backend API port |
| `FRONTEND_PORT` | `5173` | Frontend port |
| `CORS_ORIGINS` | `http://localhost:5173,...` | Comma-separated list of allowed origins. Do not use a wildcard together with credentials |
| `POSTGRES_PORT` | `5433` | Host port mapped to PostgreSQL |
| `POSTGRES_USER` | `cloudmonitor` | Database user |
| `POSTGRES_PASSWORD` | `replace_with_secure_db_password` | Database password. Replace it |
| `POSTGRES_DB` | `cloudmonitor` | Database name |
| `DATABASE_URL` | `postgresql://cloudmonitor:...@postgres:5432/cloudmonitor` | Connection string used by the backend. The credentials must match the three `POSTGRES_*` values above |
| `JWT_SECRET_KEY` | `replace_with_a_secure_random_jwt_secret_at_least_32_characters` | Secret used to sign JWTs. Must be a secure random string of at least 32 characters in production |
| `JWT_ALGORITHM` | `HS256` | JWT signing algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `60` | Access token lifetime in minutes |
| `PROMETHEUS_PORT` | `9090` | Prometheus port |
| `PROMETHEUS_RETENTION` | `15d` | Prometheus data retention period |
| `GRAFANA_PORT` | `3000` | Grafana port |
| `GRAFANA_ADMIN_USER` | `admin` | Grafana admin user |
| `GRAFANA_ADMIN_PASSWORD` | `replace_with_secure_password` | Grafana admin password. Set a secure custom value and never commit it |
| `ALERTMANAGER_PORT` | `9093` | Alertmanager port |
| `NODE_EXPORTER_PORT` | `9100` | Node Exporter port |
| `CADVISOR_PORT` | `8080` | cAdvisor port |

To generate a suitable JWT secret:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

## Connecting a Docker host

1. Open the dashboard (local: http://localhost:5173, demo: see [Live demo](#live-demo)) and register or sign in.
2. Choose **Connect Docker Environment**. The wizard enrolls a host and generates an agent key.
3. Run the agent on the Docker host you want to monitor, following [agent/README.md](agent/README.md). The agent authenticates with the key through the `X-Agent-Key` header.
4. The dashboard shows connection progress while the first heartbeat arrives, then lists the host and its containers.

The agent lives in `agent/` and includes a Dockerfile. It reads container metadata and CPU and memory statistics from the Docker daemon, then sends a heartbeat and a metrics batch to the API.

Agent keys can be rotated or revoked from the API (`rotate-key` and `DELETE` on the agent). Never send a real agent key over the plain HTTP demo.

## API reference

Use the local Swagger UI at http://localhost:8000/docs to inspect request schemas and responses. The paths below are defined in the backend source. Whether a path is reachable from outside depends on the reverse-proxy configuration.

| Method | Endpoint | Description | Access |
|---|---|---|---|
| GET | `/` | API service information | Public |
| GET | `/health` | Health status and component summary | Public |
| GET | `/api/health` | Health route under `/api` | Public |
| GET | `/api/v1/status` | High-level operational status | Public |
| GET | `/metrics` | Prometheus application and runtime metrics | Internal, scraped by Prometheus |
| POST | `/api/v1/auth/register` | Create an account | Public |
| POST | `/api/v1/auth/login` | Authenticate and issue a JWT | Public |
| GET | `/api/v1/auth/me` | Current user profile | JWT bearer token |
| POST | `/api/v1/agents/enroll` | Enroll a host and issue an agent key | JWT bearer token |
| GET | `/api/v1/agents` | List the user's enrolled agents | JWT bearer token |
| GET | `/api/v1/agents/{agent_id}/connection-status` | Inspect connection progress | JWT bearer token |
| POST | `/api/v1/agents/{agent_id}/rotate-key` | Rotate an agent key | JWT bearer token |
| DELETE | `/api/v1/agents/{agent_id}` | Revoke or disconnect an agent; supports a purge query option | JWT bearer token |
| POST | `/api/v1/agents/heartbeat` | Send an agent heartbeat | `X-Agent-Key` header |
| POST | `/api/v1/metrics/ingest` | Submit a container metrics batch | `X-Agent-Key` header |
| GET | `/api/v1/metrics/containers` | List the user's container metrics | JWT bearer token |
| POST | `/api/v1/simulate/error` | Simulate an HTTP 500 for monitoring tests | Development and test only |
| GET | `/api/v1/simulate/latency?delay=1.5` | Simulate a delay of up to 10 seconds | Development and test only |
| POST | `/api/v1/simulate/health-toggle?status=false` | Change the demonstration health gauge | Development and test only |

The frontend Nginx configuration proxies selected paths only. Routes such as `/docs` and `/metrics` are not proxied at the public root, so use the direct local backend URL to inspect every route.

## Monitoring stack

| Component | Role | Notes |
|---|---|---|
| Prometheus | Scrapes numeric metrics from configured targets and evaluates rule expressions | Configuration in `monitoring/prometheus/prometheus.yml` |
| Alert rules | Define the conditions that raise alerts | `monitoring/alerts/rules.yml` |
| Alertmanager | Groups and routes alerts from Prometheus | Receiver webhook lists are empty, so external notifications must not be assumed to work |
| Node Exporter | Exposes host operating-system metrics | Different from the Docker agent |
| CloudMonitor agent | Reads Docker container metadata and CPU and memory statistics and sends them to the API | Data goes to PostgreSQL, not to Prometheus |
| Grafana | Visualizes metrics from a configured datasource | Local Compose only; dashboard and datasource are provisioned from `monitoring/grafana/` |
| cAdvisor | Container metrics exporter | Local Compose only; the current Prometheus configuration does not scrape it |

The two telemetry paths are separate. Container records from the agent are stored in PostgreSQL and shown in the dashboard. Application metrics, host metrics, and alert evaluation go through Prometheus.

For the end-to-end explanation see [PROJECT_BUILD_AND_ARCHITECTURE.md](docs/PROJECT_BUILD_AND_ARCHITECTURE.md).

## Testing

The repository contains tests for the backend, the agent, and the monitoring workflow.

| File | Area |
|---|---|
| `tests/test_auth.py` | Authentication |
| `tests/test_agent_and_metrics.py` | Agent enrollment and metrics ingestion |
| `tests/test_docker_connection_wizard.py` | Docker connection wizard flow |
| `tests/test_security_hardening.py` | Security hardening checks |
| `agent/tests/test_agent.py` | Docker monitoring agent |

To run them locally from the repository root, install the backend and agent dependencies and run pytest:

```bash
pip install -r backend/requirements.txt -r agent/requirements.txt pytest
PYTHONPATH=backend pytest tests agent/tests
```

On Windows PowerShell:

```powershell
pip install -r backend/requirements.txt -r agent/requirements.txt pytest
$env:PYTHONPATH = "backend"
pytest tests agent/tests
```

The CI workflow in `.github/workflows/ci.yml` is the reference for how the checks are run automatically.

## AWS deployment

The hosted demo runs on a single AWS EC2 instance using Docker Compose.

| Item | Detail |
|---|---|
| Compute | AWS EC2 host with instance storage |
| Network | EC2 security groups control inbound access |
| Stack | `docker-compose.prod.yml`: PostgreSQL, backend, frontend, Prometheus, Node Exporter, Alertmanager |
| Bootstrap | `scripts/ec2-user-data.sh` |
| Environment | `.env.production.example` is the production template |
| TLS | Optional Caddy profile defined in the production Compose file, configured through `Caddyfile` |
| Public entry | Nginx frontend; monitoring ports are intended to stay private |

The current production Compose file does not include Grafana or cAdvisor. The demo URL is HTTP until HTTPS is verified and enabled.

Detailed procedures, networking, environment configuration, recovery, and troubleshooting are in:

- [AWS_DEPLOYMENT_AND_OPERATIONS.md](docs/AWS_DEPLOYMENT_AND_OPERATIONS.md)
- [DEPLOYMENT_AWS.md](docs/DEPLOYMENT_AWS.md)
- [DEPLOY_TO_EC2.md](docs/DEPLOY_TO_EC2.md)

## CI and CD

| Workflow | File | Scope |
|---|---|---|
| CI | `.github/workflows/ci.yml` | Python and agent tests, frontend build, Compose validation |
| CD | `.github/workflows/cd.yml` | SSH-based deployment to EC2 with health and telemetry checks |

Automated production deployment is a **known limitation, not a confirmed healthy end-to-end pipeline**. During recent debugging, runner-to-EC2 SSH connectivity failed because GitHub-hosted runner IP addresses change and the EC2 security-group allowlist did not permit the active runner. The planned migration to AWS Systems Manager is tracked in [issue #9](https://github.com/ayushcmd/cloud_monitor/issues/9). Setup details are in [CICD_SETUP_GUIDE.md](docs/CICD_SETUP_GUIDE.md).

## Security notes

- User passwords are hashed, and protected routes require a JWT bearer token signed with `JWT_SECRET_KEY`.
- Agents authenticate with a per-agent key sent in the `X-Agent-Key` header. Keys can be rotated and agents can be revoked.
- CORS origins are an explicit allowlist. A wildcard must not be combined with credentials.
- The backend image is built to run as a non-root user.
- Simulation endpoints are restricted to development and test environments and return 403 elsewhere.
- Database and monitoring ports are bound locally in the local stack and should not be exposed publicly.
- Replace every placeholder secret in `.env` before use, and never commit a real `.env` file.
- The demo URL uses HTTP. Do not send production credentials or sensitive telemetry to it.
- `tests/test_security_hardening.py` covers the security hardening checks.

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| The frontend does not start locally | The frontend is behind a Compose profile | Run `docker compose --profile frontend up -d --build` |
| Port 5433 is already in use | Another PostgreSQL or a previous stack is bound to it | Change `POSTGRES_PORT` in `.env`, or stop the other process |
| Browser requests fail with a CORS error | The page origin is not in `CORS_ORIGINS` | Add the exact origin to `CORS_ORIGINS` and restart the backend |
| Standalone backend cannot reach the database | `DATABASE_URL` uses the Compose host name `postgres` | Use `localhost` and port 5433 in `DATABASE_URL` |
| Login or database errors after changing credentials | `DATABASE_URL` no longer matches the `POSTGRES_*` values | Make the user, password, and database name identical in both places |
| `/docs` or `/metrics` return 404 on the public demo URL | Nginx proxies only selected paths | Use the direct backend URL locally at http://localhost:8000 |
| Agent shows as not connected | Wrong or rotated agent key, or the API is unreachable from the host | Re-enroll or rotate the key, confirm the API URL, and check the agent logs |
| Prometheus shows no cAdvisor data | cAdvisor is not a configured scrape target | Expected; see [Known limitations](#known-limitations) |
| Alerts fire but nobody is notified | Alertmanager receivers are not configured | Expected; add a receiver in `monitoring/alertmanager/alertmanager.yml` |
| PowerShell refuses to activate the virtual environment | Script execution policy | Run `Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned` in that session and try again |
| Simulation endpoints return 403 | `APP_ENV` is not a development or test value | Expected outside development; set `APP_ENV` for local testing only |

## Known limitations

| Area | Current state |
|---|---|
| Project status | Academic mini project, not a managed or enterprise-certified service |
| Transport security | The demo URL is HTTP. The Caddy TLS profile is defined but not confirmed active |
| Production service coverage | Grafana and cAdvisor are in local Compose only, not in the production Compose file |
| cAdvisor | Present in local Compose; the current Prometheus configuration does not scrape it |
| Alert notifications | Alertmanager groups and routes alerts, but the current receiver file has empty webhook lists |
| Automated deployment | The SSH-based CD workflow failed in recent debugging because runner IPs change; migration to Systems Manager is tracked in [issue #9](https://github.com/ayushcmd/cloud_monitor/issues/9) |
| Simulation endpoints | Development and test only; must not be used against the hosted demo |
| Hosted demo | Shared infrastructure, availability can change |

## Team

BSc Computer Science and Data Analytics students, IIT Patna, 5th semester.

| Member | Area | Built (implemented) | AWS deployment role (target) | Optional |
|---|---|---|---|---|
| Sarnendu Das | Custom backend | FastAPI backend and Prometheus metrics; health, status, and simulation endpoints; backend Dockerfile with a non-root user | Backend container on EC2; backend image through ECR; port 8000 security group setup | Scripted ECR image push |
| Ayush Raj | Monitoring and observability | Prometheus configuration and six alert rules; Alertmanager routing and Grafana provisioning; GitHub Actions CI pipeline | Monitoring ports kept private; Grafana via admin IP or SSH tunnel; EC2 bootstrap with Docker Compose | CloudWatch integration |
| Parveen Kumar | Custom frontend | React and Vite dashboard; testing suite with a 10-check pipeline test; failure injection and SRE verification | Frontend container on EC2; public access on ports 80 and 443 through Nginx; post-deploy checks with the test suite | CloudFront in front of the frontend |

The AWS deployment roles are the target scope for each member, and the optional items are extensions that are not part of the current deployment. See [AWS deployment](#aws-deployment) and [Known limitations](#known-limitations) for what is live today.

## Documentation

| Document | Contents |
|---|---|
| [Project Build and Architecture](docs/PROJECT_BUILD_AND_ARCHITECTURE.md) | Problem, design, components, data flows, APIs, monitoring, and limitations |
| [AWS Deployment and Operations](docs/AWS_DEPLOYMENT_AND_OPERATIONS.md) | EC2 architecture, Compose, networking, environment configuration, monitoring, CI/CD, recovery, and troubleshooting |
| [AWS deployment source guide](docs/DEPLOYMENT_AWS.md) | AWS deployment source guide |
| [Deploy to EC2](docs/DEPLOY_TO_EC2.md) | EC2 deployment guide |
| [CI/CD setup guide](docs/CICD_SETUP_GUIDE.md) | GitHub Actions setup |
| [Backend API README](backend/README.md) | Backend details |
| [Docker Agent README](agent/README.md) | Agent installation and configuration |

## License

CloudMonitor is licensed under the MIT License. See [LICENSE](LICENSE).