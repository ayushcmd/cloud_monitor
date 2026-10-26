# Cloud Monitor Local & Docker Deployment Guide

## 1. Prerequisites
- Docker Engine 24+ or Docker Desktop with WSL2
- Docker Compose v2+
- Python 3.10+ (for local test runner and automated failure demos)

## 2. Environment Configuration & Setup
Clone the repository and copy `.env.example` to `.env` if you wish to override default port assignments or retention policies:

```bash
git clone https://github.com/blackpython34/cloud_monitor.git
cd cloud_monitor
cp .env.example .env
```

## 3. Starting the Full Observability Stack

Launch all 7 Cloud Monitor services using Docker Compose:

```bash
docker compose up -d --build
```

Verify service states:
```bash
docker compose ps
```

All 7 containers should display status `Up` / `healthy`.

## 4. Service Endpoints Reference

| Service | Local URL | Default Credentials | Description |
| :--- | :--- | :--- | :--- |
| **Cloud Monitor Portal** | `http://localhost:5173` | None | Unified dashboard & SRE lab |
| **Cloud Monitor API** | `http://localhost:8000` | None | FastAPI backend |
| **API Documentation** | `http://localhost:8000/docs` | None | Swagger UI |
| **API Metrics** | `http://localhost:8000/metrics` | None | Raw Prometheus metrics |
| **Prometheus Web UI** | `http://localhost:9090` | None | Query console & targets |
| **Grafana Dashboard** | `http://localhost:3000` | `admin` / `admin` | Visual dashboards |
| **Alertmanager UI** | `http://localhost:9093` | None | Alerts router & silencer |
| **Node Exporter** | `http://localhost:9100/metrics` | None | Host telemetry feed |
| **cAdvisor UI/Metrics**| `http://localhost:8080` | None | Container telemetry feed |

## 5. Stopping and Cleaning Up

```bash
# Stop all services cleanly
docker compose down

# Stop and delete persistent data volumes (TSDB, Grafana dashboards)
docker compose down -v
```
