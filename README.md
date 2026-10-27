# Cloud Monitor — Backend API Service

> **High-performance FastAPI Backend with native Prometheus instrumentation, health checks, and SRE failure injection capabilities.**

[![Python](https://img.shields.io/badge/Python-3.12-blue.svg?logo=python)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com/)
[![Docker](https://img.shields.io/badge/Docker-Containerized-2496ED.svg?logo=docker)](https://www.docker.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics%20Ready-E6522C.svg?logo=prometheus)](https://prometheus.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. Overview

The **Cloud Monitor Backend** is an asynchronous microservice powering the Cloud Monitor observability stack. It exposes:
- **Core Application Endpoints**: Service discovery, versioning, and operational status.
- **Production Health Checks**: Standard `/health` route with sub-component status and uptime.
- **Prometheus Telemetry**: Real-time `/metrics` endpoint exposing HTTP request counts, latency histograms, error rates, and custom gauges.
- **SRE Fault Injection API**: Dedicated endpoints to simulate HTTP 500 errors, synthetic request latency, and health state toggling to validate observability alerts.

---

## 2. Architecture & Service Topology

```
+-------------------------------------------------------------+
|                      DOCKER HOST                            |
|                                                             |
|   +-----------------------+        +--------------------+   |
|   |                       |  GET   |                    |   |
|   |  Prometheus Server    |------->|  Cloud Monitor     |   |
|   |  (Scrapes :8000)      |/metrics|  FastAPI Backend   |   |
|   |                       |        |  (Port :8000)      |   |
|   +-----------------------+        +---------+----------+   |
|                                              ^              |
|                                              |              |
+----------------------------------------------|--------------+
                                               |
                                     HTTP Requests / Docs
                                               |
                                    +----------+---------+
                                    | Client / Operator  |
                                    | Swagger UI / cURL  |
                                    +--------------------+
```

---

## 3. Quickstart with Docker

### Option A: Standalone Docker (Recommended)

1. **Clone the repository**:
   ```bash
   git clone https://github.com/blackpython34/cloud_monitor.git
   cd cloud_monitor
   ```

2. **(Optional) Configure environment variables**:
   ```bash
   # Linux / macOS:
   cp .env.example .env

   # Windows (PowerShell):
   Copy-Item .env.example .env
   ```

3. **Build the Docker container**:
   ```bash
   docker build -t cloudmonitor-backend:latest ./backend
   ```

4. **Run the container**:
   ```bash
   docker run -d \
     -p 8000:8000 \
     --name cloudmonitor-backend \
     cloudmonitor-backend:latest
   ```

5. **Verify container status**:
   ```bash
   docker ps -f name=cloudmonitor-backend
   ```

---

### Option B: Docker Compose

You can launch the backend service directly using the included `docker-compose.yml`:

```bash
# 1. Clone repository & enter directory
git clone https://github.com/blackpython34/cloud_monitor.git
cd cloud_monitor

# 2. Build and launch the backend container in background
docker compose up -d --build backend

# 3. Check service status
docker compose ps backend

# 4. View live container logs
docker compose logs -f backend

# 5. Stop the backend service
docker compose stop backend
```

---

## 4. Local Development (Without Docker)

If you prefer to run the service locally using Python:

### 1. Prerequisites
- **Python 3.10+** (Python 3.12 recommended)
- **pip** and **virtualenv**

### 2. Setup Virtual Environment
```bash
# On Linux / macOS:
python3 -m venv venv
source venv/bin/activate

# On Windows (PowerShell):
python -m venv venv
.\venv\Scripts\Activate.ps1
```

### 3. Install Dependencies
```bash
pip install --upgrade pip
pip install -r backend/requirements.txt
```

### 4. Run the Server
```bash
# Run from repository root
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

## 5. API Endpoints Catalog

Once running, access interactive OpenAPI documentation at:
- **Swagger UI**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **ReDoc UI**: [http://localhost:8000/redoc](http://localhost:8000/redoc)

| Method | Endpoint | Description | Expected Status |
| :--- | :--- | :--- | :---: |
| `GET` | `/` | Root service info and directory links | `200 OK` |
| `GET` | `/health` | Service health, uptime, and component statuses | `200 OK` |
| `GET` | `/metrics` | Prometheus metrics exposition format | `200 OK` |
| `GET` | `/api/v1/status` | High-level operational status | `200 OK` |
| `POST`| `/api/v1/simulate/error` | Simulates an HTTP 500 error for alert validation | `500 Internal Error` |
| `GET` | `/api/v1/simulate/latency` | Simulates delay (`?delay=1.5`) for SLO/P95 testing | `200 OK` |
| `POST`| `/api/v1/simulate/health-toggle` | Toggles health gauge (`?status=false` or `true`) | `200 OK` |

---

## 6. Testing with cURL

```bash
# 1. Health check
curl -s http://localhost:8000/health | jq

# Sample response:
# {
#   "status": "healthy",
#   "service": "CloudMonitor-API",
#   "version": "1.0.0",
#   "environment": "development",
#   "uptime_seconds": 45.2,
#   "components": {
#     "api": "healthy",
#     "metrics_exporter": "healthy",
#     "engine": "active"
#   }
# }

# 2. Scrape Prometheus metrics
curl -s http://localhost:8000/metrics | head -n 25

# 3. Simulate API Latency (1.5 seconds)
curl -s "http://localhost:8000/api/v1/simulate/latency?delay=1.5"

# 4. Simulate HTTP 500 Internal Error
curl -s -X POST http://localhost:8000/api/v1/simulate/error

# 5. Toggle Health Status to degraded for alerting tests
curl -s -X POST "http://localhost:8000/api/v1/simulate/health-toggle?status=false"

# 6. Restore Health Status to healthy
curl -s -X POST "http://localhost:8000/api/v1/simulate/health-toggle?status=true"
```

---

## 7. Prometheus Metrics Exported

The backend natively exports standard Prometheus metrics:

- `http_requests_total{method, endpoint, status_code}`: Counter of all processed HTTP requests.
- `http_request_duration_seconds{method, endpoint}`: Histogram measuring request latency percentiles (P50, P90, P95, P99).
- `app_health_status`: Gauge set to `1` when healthy, `0` when degraded/unhealthy.
- `simulated_errors_total`: Counter recording simulated SRE fault injections.
- Standard Python runtime metrics (`process_cpu_seconds_total`, `process_resident_memory_bytes`, `python_gc_*`).

---

## 8. Docker Security & Architecture Highlights

- **Non-Root Execution**: Runs under a dedicated system user and group (`cloudmonitor`) for container hardening.
- **Embedded Healthcheck**:
  ```dockerfile
  HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1
  ```
- **Lean Footprint**: Based on `python:3.12-slim` to minimize image size and attack surface.
- **Optimized Python Runtime**: Uses `PYTHONDONTWRITEBYTECODE=1` and `PYTHONUNBUFFERED=1` for real-time Docker logging.

---

## 9. CI/CD & Production Operations

- **Continuous Integration**: Automated test suite (pytest), React frontend build (ite), and Docker Compose validation run on every pull request and push via [GitHub Actions CI](.github/workflows/ci.yml).
- **Continuous Deployment**: Automated zero-downtime deployment to AWS EC2 triggers safely on merges to main via [GitHub Actions CD](.github/workflows/cd.yml).
- **Operations & Runbook**: See [docs/CICD_SETUP_GUIDE.md](docs/CICD_SETUP_GUIDE.md) for required GitHub secrets, monitoring, troubleshooting, and database-safe rollback instructions.

---

## 10. License

This project is licensed under the [MIT License](LICENSE).
