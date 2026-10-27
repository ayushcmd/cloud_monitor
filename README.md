# CloudMonitor

**Cloud Computing Mini Project · IIT Patna · BSc CSDA · 5th Semester**

CloudMonitor is a self-hosted Docker host and container monitoring platform built with React, FastAPI, PostgreSQL, a Python Docker agent, Prometheus, Node Exporter, and Docker Compose.

The project documentation has been organized under `docs/` for a cleaner repository root.

## Documentation

- **[Project overview and quickstart](docs/README.md)** — problem statement, live demo, technology stack, local installation, API overview, team, and project highlights.
- **[Project Build & Architecture](docs/PROJECT_BUILD_AND_ARCHITECTURE.md)** — end-to-end design, frontend/backend responsibilities, agent telemetry, API endpoints, PostgreSQL, Prometheus, Grafana, Node Exporter, cAdvisor, Alertmanager, and limitations.
- **[AWS Deployment & Operations](docs/AWS_DEPLOYMENT_AND_OPERATIONS.md)** — EC2 deployment, Docker Compose, networking, environment configuration, monitoring, CI/CD status, PostgreSQL persistence, backup/restore, rollback, and troubleshooting.

## Current demo

[http://3.25.150.231](http://3.25.150.231) — currently HTTP, not HTTPS. Use only throwaway demo credentials and do not send real agent keys or sensitive telemetry over this endpoint.

## Team

Sarnendu Das · Parveen Kumar · Ayush Raj  
BSc CSDA students, IIT Patna, 5th semester.

## Repository

[Source code and issues](https://github.com/ayushcmd/cloud_monitor) · [MIT License](LICENSE)

> The detailed guides distinguish source-configured features from verified live behavior. Grafana and cAdvisor are in the local Compose stack, and the SSH-based CD workflow still has a known runner-connectivity issue.
