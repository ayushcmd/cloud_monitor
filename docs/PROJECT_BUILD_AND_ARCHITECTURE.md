# CloudMonitor — Project Build & Architecture

**Academic context:** IIT Patna · BSc CSDA · 5th Semester · Cloud Computing  
**Repository:** https://github.com/ayushcmd/cloud_monitor  
**Current demo:** http://3.25.150.231  
**Document status:** Source-informed guide. A feature being present in source does not prove that the live deployment exposes it or that its end-to-end behavior has been tested.

---

## 1. Executive summary

CloudMonitor is a self-hosted monitoring application for Docker hosts and containers. It combines a browser-based React interface, a Python FastAPI API, PostgreSQL persistence, an outbound Docker monitoring agent, and a Prometheus-based telemetry stack. It is an academic demonstration of how a cloud-hosted application can collect operational data from a separate container host, store host and agent records, expose metrics, and present status to a user.

The end-to-end idea is:

**Enroll a Docker host → run an agent on that host → send authenticated heartbeats and container telemetry → store and query records through the backend → monitor selected service and host metrics with Prometheus → inspect information through the CloudMonitor UI and local Grafana configuration.**

The repository contains a richer local monitoring stack than the production Compose stack. Grafana and cAdvisor are available in the local Compose file; they are not services in the current production Compose file. The current Prometheus scrape configuration defines Prometheus, Node Exporter, the backend, and Alertmanager targets; it does not define cAdvisor as a scrape target. Alertmanager receiver configuration contains empty webhook lists, so external notification delivery is not verified.

## 2. Academic context and motivation

This project is a Cloud Computing mini project for BSc CSDA students at IIT Patna, fifth semester.

### 2.1 Problem statement

Teams operating containerized applications need a convenient way to answer basic operational questions:

- Which Docker hosts have enrolled and are currently reporting?
- Which containers are running, stopped, or reporting an unhealthy state?
- What CPU and memory resources are containers consuming?
- Is the agent still communicating with the backend?
- Is the API healthy, and is it producing request counts, latency measurements, and error metrics?
- Can alert rules be exercised in a controlled development environment?

Inspecting every machine manually does not provide a unified view. Container status alone also does not explain application latency, API failures, or host resource pressure. CloudMonitor combines host-side collection with centralized API storage and metrics monitoring to demonstrate this workflow.

### 2.2 Idea statement

CloudMonitor is a lightweight, self-hosted observability platform that lets users enroll Docker hosts and inspect reported container status and resource telemetry through a web dashboard. The backend handles authentication and telemetry ingestion; PostgreSQL stores application records; Prometheus scrapes selected metrics; and monitoring configurations demonstrate how alerts can be evaluated.

### 2.3 Goals

1. Provide a web interface for account access and connecting Docker environments.
2. Use an agent to collect operational information from a Docker daemon.
3. Authenticate user requests and agent telemetry separately.
4. Persist user, agent, and container telemetry records in PostgreSQL.
5. Expose API health and Prometheus-format application metrics.
6. Configure host and application metric collection, dashboard provisioning, and alert rules.
7. Package services using Docker and Compose, then deploy a working web application on AWS EC2.
8. Demonstrate CI checks, deployment automation, health validation, and operational recovery concepts.

### 2.4 Intended users and industries

Potential settings include student labs, software engineering teams, small development groups, web agencies, small SaaS environments, internal test systems, and teams operating a modest number of Docker hosts. The project illustrates concepts relevant to DevOps, Site Reliability Engineering (SRE), cloud operations, application support, and software delivery.

This is a learning project. Its current live demo uses HTTP and its alert receiver integrations are not configured for external delivery. It should not be represented as a security-certified, multi-region, high-availability, or enterprise-managed service.

## 3. Terminology

| Term | Meaning in this project |
|---|---|
| Monitoring | Repeatedly collecting and checking operational signals such as health, CPU, memory, and request rates |
| Observability | Using metrics and operational state to understand system behavior; this project primarily demonstrates metrics and health data |
| Docker host | A machine running Docker Engine and the containers being monitored |
| Agent | A separate Python program that inspects Docker and sends heartbeats and host/container telemetry to the API |
| Heartbeat | A periodic authenticated message that indicates the agent is communicating |
| Metric | A numeric measurement or time series, such as request duration or CPU utilization |
| Exporter | A process exposing metrics in a format Prometheus can scrape; Node Exporter exposes host OS metrics |
| Scrape | Prometheus periodically requests a configured target's metrics endpoint |
| Dashboard | A visual representation of queried metrics; the local setup provisions Grafana |
| Alert rule | A Prometheus expression with optional duration, labels and annotations that determines when a condition is firing |
| Alertmanager | The service that groups, deduplicates and routes alerts emitted by Prometheus |
| JWT bearer token | A signed token the frontend sends to authenticate user API requests |
| Agent key | A generated secret used by an agent; the raw key is returned on enrollment or rotation while a hash is stored |
| Reverse proxy | Nginx serves the SPA and forwards selected request paths to backend services |

## 4. System architecture

### 4.1 Logical architecture

~~~mermaid
flowchart TB
    Browser[Browser / React UI] -->|HTTP requests| Nginx[Nginx frontend and path proxy]
    Nginx -->|/api/*, /health| API[FastAPI backend]
    Agent[Python Docker agent on monitored host] -->|X-Agent-Key heartbeat and metrics| API
    API --> DB[(PostgreSQL)]
    Prom[Prometheus] -->|GET /metrics| API
    Prom -->|GET /metrics| Node[Node Exporter]
    Prom --> Rules[Prometheus alert rules]
    Rules --> AM[Alertmanager]
    Grafana[Grafana - local Compose] -->|Prometheus datasource| Prom
    cAdvisor[cAdvisor - local Compose] -. not a configured scrape target today .-> Prom
    EC2[AWS EC2 instance] --- Nginx
    EC2 --- API
    EC2 --- DB
    EC2 --- Prom
~~~

This is a conceptual data-flow diagram, not proof that every component is enabled in production. Service availability depends on the Compose file and configuration selected.

### 4.2 Runtime and Compose profiles

The repository has two Compose configurations:

- **docker-compose.yml** is the local development stack. It includes PostgreSQL, Prometheus, Node Exporter, cAdvisor, the backend, Grafana, Alertmanager, and a frontend service behind the frontend profile. Many development tools bind to host loopback addresses for local inspection.
- **docker-compose.prod.yml** is the production-oriented stack. It includes PostgreSQL, backend, frontend, Prometheus, Node Exporter, and Alertmanager. The Caddy service is declared with the optional TLS profile. Grafana and cAdvisor are not services in this production file.

The local configuration publishes Prometheus, Node Exporter, cAdvisor, backend, Grafana, Alertmanager, and PostgreSQL on loopback ports. The production file publishes the frontend on port 80; the optional Caddy service publishes port 443. Backend, PostgreSQL, Prometheus, Node Exporter, and Alertmanager are exposed inside the Docker network rather than published on host ports.

### 4.3 Main request and telemetry flows

#### Flow A — User authentication

1. A user opens the React application.
2. The frontend calls the registration or login API.
3. The backend uses PostgreSQL to look up or create user records.
4. Passwords are hashed before storage.
5. Successful login returns a JWT bearer token.
6. The frontend stores the token in localStorage and attaches it to protected API requests.
7. Protected endpoints verify the current user and constrain agent/metric records to that user.

#### Flow B — Enroll a Docker host

1. An authenticated user submits a host name and operating-system type through the Docker connection workflow.
2. The backend creates an agent record linked to that user.
3. It generates a high-entropy agent key. The raw key is returned in the enrollment response; the backend stores its hash and a non-secret prefix.
4. The user configures the agent on the machine that runs Docker.
5. The agent authenticates its requests with the X-Agent-Key header.

Save the generated raw key securely when it is shown. The backend intentionally does not store a reusable raw agent key. Key rotation generates a new credential and invalidates the old one.

#### Flow C — Heartbeat and container telemetry

1. The agent connects to the local Docker daemon through the Docker SDK.
2. It reads Docker container metadata and requests a one-shot stats sample for running containers.
3. It computes CPU percentage from Docker CPU usage deltas and estimates effective memory usage using cgroup cache information where available.
4. It sends heartbeat information including host name, OS information, Docker version, and agent version.
5. It posts batches of container telemetry to the backend using the agent key.
6. The backend authenticates the agent and stores incoming metric records in PostgreSQL.
7. The UI fetches the authenticated user's agents and container records through the API.

The source configuration sets a default collection interval of 15 seconds and a heartbeat interval of 30 seconds. These values can be overridden with agent environment variables. Agent status logic treats a heartbeat older than approximately 90 seconds as offline in the agent listing/connection-status paths.

#### Flow D — Prometheus scrape and alert evaluation

1. Prometheus reads monitoring/prometheus/prometheus.yml.
2. It scrapes configured jobs at a 15-second interval.
3. The backend exposes application and Python runtime metrics at /metrics.
4. Node Exporter exposes host operating-system metrics on port 9100 inside the Compose network.
5. Prometheus evaluates rule expressions from monitoring/alerts/rules.yml.
6. Firing alerts are sent to Alertmanager, which applies grouping and receiver routing.

This is not proof of end-to-end notification delivery. The current Alertmanager receiver file has empty webhook configuration lists, so email, chat or external webhook delivery needs additional configuration and testing.

## 5. Frontend architecture

### 5.1 Technology

- React 18.3.1
- JavaScript ES modules
- Vite 5.4.8 for development and production builds
- Lucide React icons
- Nginx for static asset serving and reverse proxying

### 5.2 Responsibilities

The source includes a main dashboard application, an authentication screen, a Docker connection modal, and a centralized API client. The UI supports login/registration, viewing enrolled agent information, a connection workflow, refreshing state, and displaying metrics from the CloudMonitor API. The application includes dashboard chart components and states for missing or unavailable telemetry.

The frontend stores the JWT under the localStorage key cloudmonitor_auth_token. This is convenient for a student web app but should be considered during a security review because browser JavaScript can access localStorage. A production deployment should use HTTPS and review the session/token threat model.

### 5.3 Frontend development

The package scripts include a Vite development server, a production build, and a build preview. The Dockerfile builds the frontend bundle and the Nginx image serves the generated static content. The Nginx configuration proxies selected routes:

- /api/* to the backend
- /health and /api/health to the backend health route
- /prom/* to Prometheus
- other paths to the SPA fallback

The Nginx proxy does not publish every backend route at the site root. In particular, FastAPI docs and the backend /metrics endpoint should be inspected directly via the local backend URL unless proxy configuration changes.

## 6. Backend architecture

### 6.1 Technology

- Python 3.12 is used by CI and is the recommended baseline
- FastAPI and Uvicorn
- Pydantic request/response models
- SQLAlchemy ORM
- Alembic migration files
- PostgreSQL 16
- bcrypt password hashing and JWT tokens
- prometheus-client instrumentation

### 6.2 Main modules

| Location | Responsibility |
|---|---|
| backend/app/main.py | Constructs FastAPI, adds CORS and metrics middleware, registers routers, and defines root/status/metrics/simulation routes |
| backend/app/config.py | Environment-driven application, database, CORS, and JWT settings |
| backend/app/database.py | SQLAlchemy engine/session factory, declarative base, and request-scoped database session |
| backend/app/health.py | Health response and in-process health-state gauge |
| backend/app/metrics.py | Prometheus request and application metrics middleware/instruments |
| backend/app/auth/security.py | Password and token helpers, current-user/agent authentication and generated agent credentials |
| backend/app/routers/auth.py | Account registration, login, and current-user profile |
| backend/app/routers/agents.py | Agent enrollment, listing, connection status, key rotation, revocation, and heartbeat |
| backend/app/routers/metrics.py | Agent metric ingestion and authenticated container metric listing |
| backend/app/models/ | SQLAlchemy user, agent, and metric models |
| backend/app/schemas/ | Pydantic request and response definitions |
| backend/alembic/ | Database schema migration revisions |

The application attempts to create SQLAlchemy metadata at startup and the repository also contains Alembic migrations. Treat schema migration as a deliberate operational step and verify the current database schema before applying changes.

### 6.3 Authentication model

There are two separate credential flows:

- **User authentication:** registration and login are performed through the API. Login issues a signed JWT bearer token. The current-user endpoint and agent/metrics UI endpoints require that token.
- **Agent authentication:** a generated agent key is passed in the X-Agent-Key header to heartbeat and telemetry ingestion. Agent credentials are stored as hashes, and agent operations are linked to an owning user.

Agent list and metric query logic are scoped to the authenticated user. Agent-management endpoints include ownership checks before returning or changing a specific agent. This is intended to support per-user separation; tests should remain part of every change to protect that behavior.

## 7. API reference

Interactive request schemas are available through the local Swagger UI at http://localhost:8000/docs and ReDoc at http://localhost:8000/redoc.

### 7.1 Core endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| GET | / | API metadata and useful path names | Public |
| GET | /health | Health status, version, uptime, and component indicators | Public |
| GET | /api/health | Same health router mounted under /api | Public |
| GET | /api/v1/status | Operational status summary | Public |
| GET | /metrics | Prometheus exposition format: application and runtime metrics | Internal scrape endpoint |
| GET | /docs | FastAPI Swagger UI | Backend-local; not proxied by current frontend Nginx |
| GET | /redoc | FastAPI ReDoc | Backend-local; not proxied by current frontend Nginx |

The health response includes status, service name, version, environment, uptime, and component indicators. It is an application-level response, not proof that the host, database, Prometheus, and every dependency are healthy.

### 7.2 Authentication endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | /api/v1/auth/register | Create a user account | Public |
| POST | /api/v1/auth/login | Verify credentials and issue JWT | Public |
| GET | /api/v1/auth/me | Return the current authenticated user's profile | JWT bearer token |

### 7.3 Agent endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | /api/v1/agents/enroll | Enroll a host and generate an agent key | JWT bearer token |
| GET | /api/v1/agents | List the current user's hosts and summary statistics | JWT bearer token |
| GET | /api/v1/agents/{agent_id}/connection-status | Return connection stage and agent/metric summary | JWT bearer token |
| POST | /api/v1/agents/{agent_id}/rotate-key | Rotate the agent credential | JWT bearer token |
| DELETE | /api/v1/agents/{agent_id} | Revoke/disconnect a host; supports a purge query option | JWT bearer token |
| POST | /api/v1/agents/heartbeat | Update agent host metadata and heartbeat | X-Agent-Key header |

### 7.4 Metric endpoints

| Method | Path | Purpose | Access |
|---|---|---|---|
| POST | /api/v1/metrics/ingest | Receive a batch of container telemetry from an agent | X-Agent-Key header |
| GET | /api/v1/metrics/containers | List metric records visible to current user, optionally filtered by agent ID | JWT bearer token |

### 7.5 Development/test-only fault-injection endpoints

| Method | Path | Purpose | Guard |
|---|---|---|---|
| POST | /api/v1/simulate/error | Increment simulated-error counter and return HTTP 500 | Development/test only |
| GET | /api/v1/simulate/latency?delay=1.5 | Delay a response; delay constrained to 0–10 seconds | Development/test only |
| POST | /api/v1/simulate/health-toggle?status=false | Toggle the in-process health gauge | Development/test only |

The backend explicitly returns 403 from simulation routes when the configured environment is not development, dev, test, or local. Keep them out of public production workflows.

## 8. Metrics and monitoring stack

### 8.1 Application metrics

The backend instrumentation includes request counts and latency histograms, an application-health gauge, a counter for simulated errors, and standard Python/process metrics from the Prometheus client. Exact exposed metric names should be checked against the running /metrics output before writing production queries.

The alert rules define conditions for host CPU utilization, host memory utilization, backend availability, application health status, high HTTP 5xx error rate, and high P95 request latency. Rule expressions are configuration, not proof that each rule has fired successfully in the deployed environment.

### 8.2 Prometheus

Prometheus is configured with a global scrape interval and evaluation interval of 15 seconds. Its current scrape jobs are:

- **prometheus** — the Prometheus server itself
- **node-exporter** — host OS metrics
- **cloudmonitor-backend** — backend /metrics endpoint
- **alertmanager** — Alertmanager service metrics/health

Production Compose configures Prometheus data retention to two days. This is a resource trade-off for a small single-host deployment and should be reviewed before increasing it.

### 8.3 Node Exporter

Node Exporter exposes host OS counters such as CPU time and memory information. It is configured with read-only mounts for host proc/sys/root paths. The production Compose file does not publish its port to the host. Prometheus reaches it over the internal Compose network.

### 8.4 cAdvisor

cAdvisor is present in the local Compose stack and is configured to expose container metrics while disabling selected collectors. It is not a service in the current production Compose file, and the Prometheus scrape configuration has no cAdvisor target. Therefore, do not claim cAdvisor metrics are visible in production Prometheus without adding and verifying the target.

### 8.5 Grafana

Grafana 11.2.0 is configured in local Compose. Provisioning files define the Prometheus datasource and a dashboard configuration, and dashboard JSON exists in the repository. Grafana is not a service in the current production Compose file; production Grafana access should not be documented as available unless deployment changes confirm it.

### 8.6 Alertmanager

Alertmanager 0.27.0 is included in both Compose configurations. Its current routing configuration groups alerts and routes critical alerts to a named receiver, but the receiver webhook lists are empty. Therefore, the rules and routing structure are present, but external notification delivery is not established by the current configuration.

To enable notifications later, configure a supported receiver using secrets managed outside source control, validate delivery in a test environment, and document the expected response.

## 9. Docker monitoring agent

### 9.1 Responsibilities

The separate agent package includes configuration, a Docker metrics collector, a telemetry sender, a main polling loop, and agent tests. The agent reads container metadata and Docker stats via the Docker SDK, reports host/agent details, and submits authenticated telemetry to the backend.

Reported attributes include container state, health status when available, restart count, image identity, CPU percentage, memory usage, memory limit, and timestamps. The collector is designed not to collect container environment variables, command-line arguments, or application files.

### 9.2 Collection schedule and resilience

The default polling interval is 15 seconds and the heartbeat interval is 30 seconds. HTTP requests use timeouts and limited retries with exponential backoff. TLS certificate verification is enabled by default. A custom CA path can be configured; disabling verification should not be used for a remote production endpoint.

### 9.3 Docker socket security

The documented deployment uses a read-only bind mount of the Docker socket. Docker socket access is still highly privileged: a read-only filesystem mount does not create a general sandbox against every possible Docker API behavior. Do not expose an unauthenticated Docker daemon on TCP port 2375. Run the agent only on machines where the operator understands the trust and privilege implications.

### 9.4 Enrollment lifecycle

1. Log in to CloudMonitor.
2. Enroll a host from the Docker connection flow.
3. Copy the generated agent key securely.
4. Configure the agent server URL and key.
5. Start the agent process/container on the Docker host.
6. Confirm heartbeat and container telemetry are received.
7. Rotate the key if it is lost or exposed; the old key should no longer authenticate.

## 10. PostgreSQL data layer

PostgreSQL 16 Alpine is used in both Compose configurations. SQLAlchemy models describe users, agents, and container metric records; Alembic migration revisions are present for schema evolution. User accounts and enrolled agents are linked, and container metric queries are constrained by user ownership.

The production Compose file uses a named Docker volume called **cloudmonitor-prod_postgres_data** mounted at the PostgreSQL data directory. A named Docker volume survives ordinary container recreation if retained, but it is not a substitute for verified off-host backups and tested restores. Confirm the actual AWS block-device layout before claiming the database has a dedicated EBS volume.

Practical database rules:

- Use a unique, high-entropy production database password.
- Keep actual production .env files out of Git.
- Review migrations before applying them to production.
- Back up important data and test restoration in a separate environment.
- Never use a volume-deletion command as routine troubleshooting.

## 11. Local setup and developer workflow

### Prerequisites

- Git
- Docker Engine and Docker Compose v2
- Optionally Python 3.12 and pip for backend work
- Optionally Node.js 20 and npm for frontend work

### Docker Compose local stack

~~~bash
git clone https://github.com/ayushcmd/cloud_monitor.git
cd cloud_monitor
cp .env.example .env
docker compose --profile frontend up -d --build
docker compose ps
~~~

Windows PowerShell uses Copy-Item .env.example .env in place of cp.

Local URLs:
- Frontend: http://localhost:5173
- Backend: http://localhost:8000
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3000
- Alertmanager: http://localhost:9093
- Node Exporter: http://localhost:9100/metrics
- cAdvisor: http://localhost:8080
- PostgreSQL host mapping: localhost:5433

The local host ports are bound to loopback in Compose and are intended for local access. Values in example configuration are development values. Use generated secrets for any environment exposed to a network.

### Python test suite

The CI workflow uses Python 3.12, installs backend and agent requirements, sets a test environment and SQLite test database, and runs pytest over tests/ and agent/tests/. After installing dependencies, reproduce the CI test command with:

~~~bash
PYTHONPATH=backend:. pytest -v --tb=short tests/ agent/tests/
~~~

### Frontend build

~~~bash
cd frontend
npm ci
npm run build
~~~

CI also validates both Docker Compose configurations. A successful local build or CI run is useful evidence but is not equivalent to a production deployment test.

## 12. Security and privacy considerations

- **Transport security:** the current live demo URL is HTTP. Do not enter reusable credentials or send real agent keys/telemetry to the HTTP demo. Verify TLS before use with sensitive data.
- **Secrets:** keep production .env, JWT keys, database credentials, SSH private keys, and agent keys out of Git and logs.
- **Authentication:** review password hashing, JWT expiry, token storage, authorization checks, and ownership restrictions during future security work.
- **Docker socket:** use the documented least-exposure mount and never use unauthenticated Docker TCP port 2375.
- **Network exposure:** PostgreSQL, backend, Prometheus, Node Exporter and Alertmanager are not published as host ports in the production Compose configuration.
- **Fault injection:** simulation endpoints should remain disabled outside development/test.
- **Monitoring privacy:** the agent is intended to send operational telemetry rather than environment variables or application files; review payload schemas and logs before expanding collection.
- **Backups:** a persistent volume protects against ordinary container recreation, not every host, disk, credential, or operator failure.

## 13. Limitations and source-verified distinctions

| Area | Source-informed state | Documentation caution |
|---|---|---|
| Hosted application | Current demo URL provided as http://3.25.150.231 | HTTP; do not use real secrets until HTTPS is verified |
| Frontend | React/Vite app and Nginx routes exist | Not every backend route is proxied publicly |
| Backend | FastAPI routes and tests exist | Route existence does not guarantee public reachability or runtime success |
| PostgreSQL | Persistent named volume configured in production Compose | Backup and restore status must be audited separately |
| Prometheus | Server, scrape config and alert rules exist | Confirm targets are up and rule expressions match actual metrics |
| Node Exporter | Local and production Compose service | Metrics are internal to the Compose network in production |
| cAdvisor | Local Compose service | Absent from production Compose and current Prometheus scrape targets |
| Grafana | Local Compose service and provisioning files | Absent from production Compose services |
| Alertmanager | Service and routing configuration exist | Current webhook receivers are empty; external delivery is not proven |
| CI | Workflow tests Python/agent, builds frontend and validates Compose | Check latest Actions run for current results |
| CD | SSH-based deployment workflow exists | Recent runner-to-EC2 SSH diagnostics failed; SSM migration is planned |
| AWS services | EC2-based Docker deployment | CloudWatch, S3 backup integration, RDS, and a managed static-IP runner should not be claimed as implemented without separate verification |

## 14. Suggested future work

The repository's backlog includes:

1. Document and test PostgreSQL backups, restore, and application rollback.
2. Improve monitoring dashboards and validate alert delivery.
3. Expand automated tests and safe failure simulation.
4. Perform a production security review, including HTTPS and IAM.
5. Evaluate CloudWatch integration and infrastructure cost.
6. Migrate GitHub Actions deployment from SSH to AWS Systems Manager after prerequisites and permissions have been reviewed.

See the [repository issues](https://github.com/ayushcmd/cloud_monitor/issues).

## 15. Team

- Sarnendu Das
- Parveen Kumar
- Ayush Raj

BSc CSDA students at IIT Patna, fifth semester. This is a collaborative Cloud Computing mini project. Individual contributions are not assigned because team-specific roles have not been confirmed.

## 16. Repository map

~~~text
.
├── agent/                       # Docker monitoring agent
├── backend/                     # FastAPI API, models, schemas, migrations
├── frontend/                    # React/Vite UI and Nginx config
├── monitoring/
│   ├── prometheus/               # Prometheus scrape configuration
│   ├── alerts/                   # Prometheus alert rules
│   ├── grafana/                  # Local datasource/dashboard provisioning
│   └── alertmanager/             # Alertmanager routes/receivers
├── docs/                         # Existing AWS and CI/CD guides
├── scripts/                      # EC2 bootstrap script
├── tests/                        # Backend and agent-oriented tests
├── docker-compose.yml            # Local development stack
├── docker-compose.prod.yml       # Production-oriented stack
├── .github/workflows/ci.yml      # CI workflow
├── .github/workflows/cd.yml      # SSH-based CD and diagnostics
├── README.md
├── PROJECT_BUILD_AND_ARCHITECTURE.md
└── AWS_DEPLOYMENT_AND_OPERATIONS.md
~~~

## 17. Related project documents

- [README](README.md)
- [Backend README](../backend/README.md)
- [Agent README](../agent/README.md)
- [AWS deployment guide](DEPLOYMENT_AWS.md)
- [CI/CD setup guide](CICD_SETUP_GUIDE.md)
- [Local Compose file](../docker-compose.yml)
- [Production Compose file](../docker-compose.prod.yml)
- [Prometheus configuration](../monitoring/prometheus/prometheus.yml)
- [Alert rules](../monitoring/alerts/rules.yml)
- [Alertmanager configuration](../monitoring/alertmanager/alertmanager.yml)
