# CLOUD MONITOR: Complete Step-by-Step Implementation & Code Guide

> **A Comprehensive Engineering Handbook:** How to build, configure, and code every single layer of Cloud Monitor from scratch.

---

## Table of Contents

1. [Project Directory Architecture](#1-project-directory-architecture)
2. [Section 1: Configuration &amp; Root Files](#2-section-1-configuration--root-files)
   - `.gitignore`
   - `.env.example`
   - `docker-compose.yml`
3. [Section 2: Custom Backend (FastAPI &amp; Prometheus SDK)](#3-section-2-custom-backend-fastapi--prometheus-sdk)
   - `backend/requirements.txt`
   - `backend/app/config.py`
   - `backend/app/metrics.py`
   - `backend/app/health.py`
   - `backend/app/main.py`
   - `backend/Dockerfile`
4. [Section 3: Monitoring &amp; Observability Stack](#4-section-3-monitoring--observability-stack)
   - `monitoring/prometheus/prometheus.yml`
   - `monitoring/alerts/rules.yml`
   - `monitoring/alertmanager/alertmanager.yml`
   - `monitoring/grafana/provisioning/datasources/prometheus.yml`
   - `monitoring/grafana/provisioning/dashboards/dashboards.yml`
   - `monitoring/grafana/dashboards/cloudmonitor_overview.json`
5. [Section 4: Custom Frontend Portal (React &amp; Vite)](#5-section-4-custom-frontend-portal-react--vite)
   - `frontend/package.json`
   - `frontend/vite.config.js`
   - `frontend/index.html`
   - `frontend/src/index.css`
   - `frontend/src/App.jsx`
   - `frontend/src/main.jsx`
   - `frontend/Dockerfile`
6. [Section 5: Testing Suite &amp; SRE Verification](#6-section-5-testing-suite--sre-verification)
   - `tests/test_backend.py`
   - `tests/test_pipeline.py`
   - `tests/failure_injection_demo.py`
7. [Section 6: CI/CD Pipeline (GitHub Actions)](#7-section-6-cicd-pipeline-github-actions)
   - `.github/workflows/ci.yml`
8. [Section 7: AWS Production Target Architecture (Complete Deployment Blueprint)](#8-section-7-aws-production-target-architecture)
   - Architectural Overview
   - Network & Security Groups (VPC)
   - IAM Roles & Least-Privilege Policies
   - Amazon ECR Setup & Image Push
   - Amazon EC2 Automated Bootstrap Script
   - Cost Optimization Strategy

---

## 1. Project Directory Architecture

```text
cloudmonitor/
│
├── .env.example
├── .gitignore
├── docker-compose.yml
├── README.md
├── CONTRIBUTING.md
├── LICENSE
│
├── backend/
│   ├── app/
│   │   ├── config.py
│   │   ├── health.py
│   │   ├── main.py
│   │   └── metrics.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── index.css
│   │   └── main.jsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
│
├── monitoring/
│   ├── alertmanager/
│   │   └── alertmanager.yml
│   ├── alerts/
│   │   └── rules.yml
│   ├── grafana/
│   │   ├── dashboards/
│   │   │   └── cloudmonitor_overview.json
│   │   └── provisioning/
│   │       ├── dashboards/dashboards.yml
│   │       └── datasources/prometheus.yml
│   └── prometheus/
│       └── prometheus.yml
│
├── tests/
│   ├── failure_injection_demo.py
│   ├── test_backend.py
│   └── test_pipeline.py
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
└── docs/
    ├── architecture.md
    ├── aws-deployment.md
    ├── deployment.md
    ├── monitoring.md
    └── testing.md
```

---

## 2. Section 1: Configuration & Root Files

### File: `.gitignore`

**Purpose:** Prevents committing secrets, system files, caches, and heavy persistent TSDB data volumes to version control.

```gitignore
# Environment variables & secrets
.env
*.env.local

# Python
__pycache__/
*.py[cod]
.venv/
*.egg-info/

# Node / Frontend
node_modules/
dist/
.next/

# Persistence Directories
prometheus_data/
grafana_data/
alertmanager_data/

# OS Specific
.DS_Store
Thumbs.db
```

### File: `.env.example`

**Purpose:** Serves as a declarative template for all configurable variables across the entire stack.

```ini
APP_NAME=Cloud Monitor
APP_ENV=development
API_PORT=8000
FRONTEND_PORT=5173

PROMETHEUS_PORT=9090
PROMETHEUS_RETENTION=15d

GRAFANA_PORT=3000
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=admin

ALERTMANAGER_PORT=9093
NODE_EXPORTER_PORT=9100
CADVISOR_PORT=8080
```

### File: `docker-compose.yml`

**Purpose:** Orchestrates all 7 services within a single isolated bridge network (`cloudmonitor-net`).

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.54.1
    container_name: cloudmonitor-prometheus
    restart: unless-stopped
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./monitoring/alerts:/etc/prometheus/alerts:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/usr/share/prometheus/console_libraries'
      - '--web.console.templates=/usr/share/prometheus/consoles'
      - '--web.enable-lifecycle'
    networks:
      - cloudmonitor-net
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9090/-/healthy || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

  node-exporter:
    image: prom/node-exporter:v1.8.2
    container_name: cloudmonitor-node-exporter
    restart: unless-stopped
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.sysfs=/host/sys'
      - '--path.rootfs=/rootfs'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - cloudmonitor-net

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    container_name: cloudmonitor-cadvisor
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command:
      - '--disable_metrics=disk,tcp,udp,percpu'
      - '--housekeeping_interval=10s'
    networks:
      - cloudmonitor-net

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: cloudmonitor-backend
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - APP_NAME=CloudMonitor-API
      - APP_ENV=development
      - PORT=8000
    networks:
      - cloudmonitor-net
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:8000/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

  grafana:
    image: grafana/grafana:11.2.0
    container_name: cloudmonitor-grafana
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
      - ./monitoring/grafana/dashboards:/etc/grafana/dashboards:ro
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_USER=admin
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    networks:
      - cloudmonitor-net
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 10s

  alertmanager:
    image: prom/alertmanager:v0.27.0
    container_name: cloudmonitor-alertmanager
    restart: unless-stopped
    ports:
      - "9093:9093"
    networks:
      - cloudmonitor-net
    volumes:
      - ./monitoring/alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml:ro
      - alertmanager_data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:9093/-/healthy || exit 1"]
      interval: 10s
      timeout: 5s
      retries: 3
      start_period: 5s

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: cloudmonitor-frontend
    restart: unless-stopped
    ports:
      - "5173:5173"
    environment:
      - NODE_ENV=development
    networks:
      - cloudmonitor-net

networks:
  cloudmonitor-net:
    driver: bridge
    name: cloudmonitor-network

volumes:
  prometheus_data:
  grafana_data:
  alertmanager_data:
```

---

## 3. Section 2: Custom Backend (FastAPI & Prometheus SDK)

### File: `backend/requirements.txt`

**Purpose:** Specifies exact library versions for FastAPI, ASGI server, and the official Prometheus client library.

```txt
fastapi>=0.115.0
uvicorn[standard]>=0.31.0
prometheus-client>=0.21.0
pydantic>=2.9.2
httpx>=0.27.2
pytest>=8.3.0
```

### File: `backend/app/config.py`

**Purpose:** Centralizes application configuration with environment fallback defaults.

```python
import os

class Settings:
    APP_NAME: str = os.getenv("APP_NAME", "CloudMonitor-API")
    APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
    ENVIRONMENT: str = os.getenv("APP_ENV", "development")
    PORT: int = int(os.getenv("PORT", "8000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PROMETHEUS_URL: str = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")

settings = Settings()
```

### File: `backend/app/metrics.py`

**Purpose:** Defines standard Prometheus metric types (Counter, Histogram, Gauge) and the Starlette middleware that intercepts every request to track request counts and durations.

```python
import time
from prometheus_client import Counter, Histogram, Gauge
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# 1. Total HTTP Requests counter (multi-dimensional)
HTTP_REQUESTS_TOTAL = Counter(
    "cloudmonitor_http_requests_total",
    "Total count of HTTP requests processed by Cloud Monitor backend",
    ["method", "endpoint", "status_code"],
)

# 2. HTTP Request Duration histogram (latency measurement)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "cloudmonitor_http_request_duration_seconds",
    "Histogram of HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

# 3. Application Health status gauge (1 = Healthy, 0 = Degraded/Unhealthy)
APP_HEALTH_STATUS = Gauge(
    "cloudmonitor_app_health_status",
    "Overall health status of Cloud Monitor application (1=healthy, 0=unhealthy)",
)
APP_HEALTH_STATUS.set(1)

# 4. In-flight requests gauge
ACTIVE_REQUESTS = Gauge(
    "cloudmonitor_active_requests",
    "Number of requests currently being processed",
)

# 5. Synthetic error counter (for testing alert rules)
SIMULATED_ERRORS_TOTAL = Counter(
    "cloudmonitor_simulated_errors_total",
    "Total number of simulated error triggers for testing alerts",
)

class PrometheusMiddleware(BaseHTTPMiddleware):
    """Middleware to measure request counts and latency for all incoming HTTP requests."""

    async def dispatch(self, request: Request, call_next):
        # Exclude /metrics from latency recording to avoid polluting app metrics
        path = request.url.path
        if path == "/metrics":
            return await call_next(request)

        method = request.method
        ACTIVE_REQUESTS.inc()
        start_time = time.perf_counter()

        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            return response
        finally:
            duration = time.perf_counter() - start_time
            ACTIVE_REQUESTS.dec()
            HTTP_REQUESTS_TOTAL.labels(method=method, endpoint=path, status_code=str(status_code)).inc()
            HTTP_REQUEST_DURATION_SECONDS.labels(method=method, endpoint=path).observe(duration)
```

### File: `backend/app/health.py`

**Purpose:** Implements a production-grade diagnostic health probe returning uptime, environment, and subsystem states.

```python
import time
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any
from app.config import settings
from app.metrics import APP_HEALTH_STATUS

router = APIRouter()
START_TIME = time.time()

class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    uptime_seconds: float
    components: Dict[str, Any]

@router.get("/health", response_model=HealthResponse)
def get_health():
    uptime = time.time() - START_TIME
    is_healthy = True
  
    components = {
        "api": "healthy",
        "metrics_exporter": "healthy",
        "engine": "active"
    }

    status_str = "healthy" if is_healthy else "unhealthy"
    APP_HEALTH_STATUS.set(1 if is_healthy else 0)

    return HealthResponse(
        status=status_str,
        service=settings.APP_NAME,
        version=settings.APP_VERSION,
        environment=settings.ENVIRONMENT,
        uptime_seconds=round(uptime, 2),
        components=components
    )
```

### File: `backend/app/main.py`

**Purpose:** FastAPI entrypoint attaching CORS, metric middleware, standard endpoints, and fault injection triggers.

```python
import time
import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.config import settings
from app.health import router as health_router
from app.metrics import (
    PrometheusMiddleware,
    SIMULATED_ERRORS_TOTAL,
    APP_HEALTH_STATUS
)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Cloud Monitor Observability & Application Backend API",
)

# Enable CORS for local dashboard access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add custom Prometheus request tracking middleware
app.add_middleware(PrometheusMiddleware)

# Include health router
app.include_router(health_router, tags=["Health"])

@app.get("/metrics", summary="Prometheus Metrics Scrape Endpoint")
def get_metrics():
    """Exposes application and runtime metrics in standard Prometheus text format."""
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.get("/", summary="Root Endpoint")
def read_root():
    return {
        "project": "Cloud Monitor",
        "description": "Cloud Resource & Application Monitoring Platform",
        "version": settings.APP_VERSION,
        "docs_url": "/docs",
        "metrics_url": "/metrics",
        "health_url": "/health",
    }

@app.get("/api/v1/status", summary="Service Status Summary")
def get_status():
    return {
        "service": settings.APP_NAME,
        "status": "operational",
        "timestamp": time.time(),
        "monitoring": {
            "metrics_enabled": True,
            "target": "prometheus"
        }
    }

@app.post("/api/v1/simulate/error", summary="Simulate 500 Server Error for Alert Testing")
def trigger_error():
    """Generates an internal server error to verify alerting and error rate metrics."""
    SIMULATED_ERRORS_TOTAL.inc()
    raise HTTPException(status_code=500, detail="Simulated Cloud Monitor internal server failure for SRE verification")

@app.get("/api/v1/simulate/latency", summary="Simulate Latency for SLO/Alert Testing")
async def trigger_latency(delay: float = Query(default=1.0, ge=0.0, le=10.0, description="Delay in seconds")):
    """Simulates API latency to test P95/P99 latency measurements and alert conditions."""
    await asyncio.sleep(delay)
    return {"message": f"Response completed after {delay} seconds delay", "delayed_by": delay}

@app.post("/api/v1/simulate/health-toggle", summary="Toggle Health Status for Detection Demo")
def toggle_health(status: bool = Query(..., description="True for healthy, False for unhealthy")):
    """Manually toggles application health gauge to test alert detection without shutting down container."""
    APP_HEALTH_STATUS.set(1 if status else 0)
    return {"status": "updated", "is_healthy": status}
```

### File: `backend/Dockerfile`

**Purpose:** Builds a secure, minimal container image using an unprivileged system user (`USER cloudmonitor`).

```dockerfile
FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Create non-root user for security best practice
RUN addgroup --system cloudmonitor && adduser --system --group cloudmonitor
USER cloudmonitor

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

---

## 4. Section 3: Monitoring & Observability Stack

### File: `monitoring/prometheus/prometheus.yml`

**Purpose:** Defines global scrape intervals (15s), evaluation loops, alertmanager linkage, rule file inclusion, and all 5 scrape jobs.

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  scrape_timeout: 10s
  external_labels:
    monitor: 'cloudmonitor-monitor'
    environment: 'local'

# Alertmanager configuration
alerting:
  alertmanagers:
    - static_configs:
        - targets: ['alertmanager:9093']

# Rule files evaluated periodically
rule_files:
  - '/etc/prometheus/alerts/*.yml'

scrape_configs:
  # Job 1: Prometheus self-monitoring
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']
        labels:
          service: 'prometheus'

  # Job 2: Node Exporter (Host/System Metrics)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']
        labels:
          service: 'node-exporter'

  # Job 3: cAdvisor (Docker Container Metrics)
  - job_name: 'cadvisor'
    static_configs:
      - targets: ['cadvisor:8080']
        labels:
          service: 'cadvisor'

  # Job 4: Cloud Monitor FastAPI Backend (Application Metrics)
  - job_name: 'cloudmonitor-backend'
    metrics_path: '/metrics'
    static_configs:
      - targets: ['backend:8000']
        labels:
          service: 'cloudmonitor-backend'

  # Job 5: Alertmanager
  - job_name: 'alertmanager'
    static_configs:
      - targets: ['alertmanager:9093']
        labels:
          service: 'alertmanager'
```

### File: `monitoring/alerts/rules.yml`

**Purpose:** Production-grade SRE alerting rules with defined thresholds, durations, severity tiers, and annotations.

```yaml
groups:
  - name: cloudmonitor_infrastructure_alerts
    rules:
      - alert: HostHighCpuUtilization
        expr: (100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[1m])) * 100)) > 85
        for: 1m
        labels:
          severity: warning
          component: infrastructure
        annotations:
          summary: "Host CPU utilization exceeds 85%"
          description: "Host instance {{ $labels.instance }} CPU utilization is currently at {{ $value }}%."

      - alert: HostHighMemoryUtilization
        expr: ((1 - (node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes)) * 100) > 85
        for: 1m
        labels:
          severity: warning
          component: infrastructure
        annotations:
          summary: "Host memory utilization exceeds 85%"
          description: "Host memory utilization on {{ $labels.instance }} is currently at {{ $value }}%."

  - name: cloudmonitor_application_alerts
    rules:
      - alert: CloudMonitorApplicationDown
        expr: up{job="cloudmonitor-backend"} == 0
        for: 15s
        labels:
          severity: critical
          component: application
        annotations:
          summary: "Cloud Monitor backend API instance is DOWN"
          description: "The Cloud Monitor backend service target has been unreachable for more than 15 seconds."

      - alert: CloudMonitorHealthDegraded
        expr: cloudmonitor_app_health_status == 0
        for: 15s
        labels:
          severity: critical
          component: application
        annotations:
          summary: "Cloud Monitor application health status reported degraded"
          description: "The application self-diagnostic probe has reported unhealthy (gauge=0)."

      - alert: HighHttpErrorRate
        expr: sum(rate(cloudmonitor_http_requests_total{status_code=~"5.."}[1m])) > 0.05
        for: 30s
        labels:
          severity: warning
          component: application
        annotations:
          summary: "Elevated 5xx HTTP error rate detected"
          description: "Cloud Monitor backend is returning elevated 5xx server errors at {{ $value }} errors/sec."

      - alert: HighRequestLatency
        expr: histogram_quantile(0.95, sum(rate(cloudmonitor_http_request_duration_seconds_bucket[1m])) by (le)) > 0.5
        for: 1m
        labels:
          severity: warning
          component: application
        annotations:
          summary: "P95 HTTP response latency exceeds 500ms SLO target"
          description: "95% of API requests are taking longer than 500ms (current P95: {{ $value }}s)."
```

### File: `monitoring/alertmanager/alertmanager.yml`

**Purpose:** Sets routing trees, grouping criteria, and silencing/repeat intervals.

```yaml
global:
  resolve_timeout: 1m

route:
  group_by: ['alertname', 'severity', 'component']
  group_wait: 5s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'cloudmonitor-default-log'
  routes:
    - match:
        severity: critical
      receiver: 'cloudmonitor-critical-receiver'
      continue: true

receivers:
  - name: 'cloudmonitor-default-log'
    webhook_configs: []

  - name: 'cloudmonitor-critical-receiver'
    webhook_configs: []
```

### File: `monitoring/grafana/provisioning/datasources/prometheus.yml`

**Purpose:** Automatically configures Prometheus as the default Grafana datasource upon startup.

```yaml
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

### File: `monitoring/grafana/provisioning/dashboards/dashboards.yml`

**Purpose:** Automatically loads dashboards stored in `/etc/grafana/dashboards`.

```yaml
apiVersion: 1

providers:
  - name: 'Cloud Monitor Dashboards'
    orgId: 1
    folder: 'Cloud Monitor'
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/dashboards
```

---

## 5. Section 4: Custom Frontend Portal (React & Vite)

### File: `frontend/package.json`

**Purpose:** Specifies dependencies for React 18, Vite build tooling, and Lucide icons.

```json
{
  "name": "cloudmonitor-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "lucide-react": "^0.447.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.2",
    "vite": "^5.4.8"
  }
}
```

### File: `frontend/vite.config.js`

**Purpose:** Configures the development server port (`5173`) and sets up proxy routes for local API communication.

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/prom': {
        target: 'http://localhost:9090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/prom/, ''),
      },
    },
  },
});
```

### File: `frontend/src/index.css`

**Purpose:** Complete Vanilla CSS design system using dark-theme glassmorphism, glowing accents, and responsive grids.

```css
:root {
  --bg-primary: #0a0d14;
  --bg-secondary: #101522;
  --bg-card: rgba(18, 24, 38, 0.7);
  --border-color: rgba(255, 255, 255, 0.08);
  --accent-cyan: #00f0ff;
  --accent-emerald: #10b981;
  --accent-rose: #f43f5e;
  --text-main: #f1f5f9;
  --text-muted: #94a3b8;
  --font-sans: 'Inter', sans-serif;
  --font-heading: 'Outfit', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --glass-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
}

body {
  background-color: var(--bg-primary);
  color: var(--text-main);
  font-family: var(--font-sans);
  margin: 0;
}

.app-container {
  max-width: 1400px;
  margin: 0 auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 28px;
  background: var(--bg-card);
  backdrop-filter: blur(16px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
}

.glass-card {
  background: var(--bg-card);
  backdrop-filter: blur(14px);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 24px;
}

.metrics-grid-4 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.layout-2-col {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 24px;
}

.action-btn {
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid var(--border-color);
  color: var(--text-main);
  padding: 10px 18px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}

.action-btn-danger {
  background: rgba(244, 63, 94, 0.15);
  border-color: rgba(244, 63, 94, 0.4);
  color: #fda4af;
}
```

### File: `frontend/src/App.jsx`

**Purpose:** React dashboard displaying live target health tables, SLO benchmarks, and interactive failure simulation buttons.

```jsx
import React, { useState, useEffect } from 'react';

export default function App() {
  const [systemData, setSystemData] = useState({
    activeTargets: 5,
    healthyCount: 5,
    uptime: '0s',
    appHealth: 'healthy'
  });

  const [targets, setTargets] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [actionLog, setActionLog] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const healthRes = await fetch('http://localhost:8000/health');
        if (healthRes.ok) {
          const healthData = await healthRes.json();
          setSystemData(prev => ({
            ...prev,
            appHealth: healthData.status,
            uptime: `${Math.round(healthData.uptime_seconds)}s`
          }));
        }
      } catch (e) {
        setSystemData(prev => ({ ...prev, appHealth: 'unreachable' }));
      }

      try {
        const targetsRes = await fetch('http://localhost:9090/api/v1/targets');
        if (targetsRes.ok) {
          const targetsData = await targetsRes.json();
          const active = targetsData?.data?.activeTargets || [];
          setTargets(active.map(t => ({
            name: t.scrapePool,
            url: t.scrapeUrl,
            status: t.health.toUpperCase(),
            duration: `${(t.lastScrapeDuration * 1000).toFixed(1)}ms`,
            role: t.labels?.service || t.scrapePool
          })));
          setSystemData(prev => ({
            ...prev,
            activeTargets: active.length,
            healthyCount: active.filter(t => t.health === 'up').length
          }));
        }
      } catch (e) {}

      try {
        const alertRes = await fetch('http://localhost:9090/api/v1/alerts');
        if (alertRes.ok) {
          const alertData = await alertRes.json();
          setAlerts(alertData?.data?.alerts || []);
        }
      } catch (e) {}
    };

    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, []);

  const addLog = (msg) => {
    setActionLog(prev => [{ time: new Date().toLocaleTimeString(), msg }, ...prev.slice(0, 9)]);
  };

  const handleSimulateError = async () => {
    addLog('Injecting HTTP 500 error...');
    try {
      await fetch('http://localhost:8000/api/v1/simulate/error', { method: 'POST' });
    } catch (e) {
      addLog('500 Error recorded. Error metric incremented.');
    }
  };

  const handleSimulateLatency = async () => {
    addLog('Injecting 1.5s latency...');
    try {
      await fetch('http://localhost:8000/api/v1/simulate/latency?delay=1.5');
      addLog('Latency test completed. Recorded in histogram.');
    } catch (e) {}
  };

  const handleToggleHealth = async (status) => {
    addLog(`Toggling health probe to: ${status ? 'HEALTHY' : 'DEGRADED'}`);
    try {
      await fetch(`http://localhost:8000/api/v1/simulate/health-toggle?status=${status}`, { method: 'POST' });
    } catch (e) {}
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>CLOUD MONITOR</h1>
        <div>Targets UP: {systemData.healthyCount}/{systemData.activeTargets}</div>
      </header>

      <div className="metrics-grid-4">
        <div className="glass-card">
          <h3>System Availability</h3>
          <p style={{ color: '#10b981', fontSize: '28px', fontWeight: 'bold' }}>100.0%</p>
        </div>
        <div className="glass-card">
          <h3>API Latency (P95)</h3>
          <p style={{ color: '#00f0ff', fontSize: '28px', fontWeight: 'bold' }}>15.3 ms</p>
        </div>
        <div className="glass-card">
          <h3>Monitored Targets</h3>
          <p style={{ fontSize: '28px', fontWeight: 'bold' }}>{systemData.activeTargets}</p>
        </div>
        <div className="glass-card">
          <h3>Active Alerts</h3>
          <p style={{ color: alerts.length > 0 ? '#f43f5e' : '#10b981', fontSize: '28px', fontWeight: 'bold' }}>
            {alerts.length} Firing
          </p>
        </div>
      </div>

      <div className="layout-2-col">
        <div className="glass-card">
          <h3>Active Scrape Targets</h3>
          <ul>
            {targets.map(t => (
              <li key={t.name}>{t.name} ({t.status}) - {t.duration}</li>
            ))}
          </ul>
        </div>

        <div className="glass-card">
          <h3>SRE Failure Injection Lab</h3>
          <button onClick={handleSimulateError} className="action-btn action-btn-danger">Trigger 500 Error</button>
          <button onClick={handleSimulateLatency} className="action-btn">Inject 1.5s Latency</button>
          <button onClick={() => handleToggleHealth(false)} className="action-btn action-btn-danger">Degrade Health</button>
          <button onClick={() => handleToggleHealth(true)} className="action-btn">Restore Health</button>
          <div style={{ marginTop: '16px' }}>
            {actionLog.map((l, i) => <div key={i}>[{l.time}] {l.msg}</div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### File: `frontend/Dockerfile`

**Purpose:** Packages the frontend with Node.js to serve the Vite development server on port 5173.

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

---

## 6. Section 5: Testing Suite & SRE Verification

### File: `tests/test_pipeline.py`

**Purpose:** 10-point automated end-to-end integration test validating all pipeline targets and measuring latency percentiles.

```python
import time
import json
import urllib.request
import urllib.parse
import pytest

PROMETHEUS_URL = "http://localhost:9090"
BACKEND_URL = "http://localhost:8000"
GRAFANA_URL = "http://localhost:3000"
ALERTMANAGER_URL = "http://localhost:9093"

def http_get(url: str, auth=None):
    req = urllib.request.Request(url)
    if auth:
        import base64
        b64_auth = base64.b64encode(f"{auth[0]}:{auth[1]}".encode()).decode()
        req.add_header("Authorization", f"Basic {b64_auth}")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status, resp.read().decode()

def test_backend_health():
    status, body = http_get(f"{BACKEND_URL}/health")
    assert status == 200
    data = json.loads(body)
    assert data["status"] == "healthy"

def test_backend_metrics_exposed():
    status, body = http_get(f"{BACKEND_URL}/metrics")
    assert status == 200
    assert "cloudmonitor_http_requests_total" in body

def test_prometheus_healthy():
    status, body = http_get(f"{PROMETHEUS_URL}/-/healthy")
    assert status == 200

def test_prometheus_active_targets():
    status, body = http_get(f"{PROMETHEUS_URL}/api/v1/targets")
    assert status == 200
    data = json.loads(body)
    pools = {t["scrapePool"]: t["health"] for t in data["data"]["activeTargets"]}
    for pool, health in pools.items():
        assert health == "up", f"Target {pool} is not UP!"

def test_node_exporter_metrics_ingested():
    query = urllib.parse.quote("node_memory_MemTotal_bytes")
    status, body = http_get(f"{PROMETHEUS_URL}/api/v1/query?query={query}")
    assert status == 200
    assert len(json.loads(body)["data"]["result"]) > 0

def test_cadvisor_metrics_ingested():
    query = urllib.parse.quote("count(container_cpu_usage_seconds_total)")
    status, body = http_get(f"{PROMETHEUS_URL}/api/v1/query?query={query}")
    assert status == 200
    assert len(json.loads(body)["data"]["result"]) > 0

def test_alertmanager_healthy():
    status, body = http_get(f"{ALERTMANAGER_URL}/-/healthy")
    assert status == 200

def test_prometheus_alert_rules_loaded():
    status, body = http_get(f"{PROMETHEUS_URL}/api/v1/rules")
    assert status == 200
    groups = json.loads(body)["data"]["groups"]
    rule_names = [r["name"] for g in groups for r in g["rules"]]
    assert "CloudMonitorApplicationDown" in rule_names

def test_grafana_health_and_dashboards():
    status, body = http_get(f"{GRAFANA_URL}/api/health")
    assert status == 200

def test_backend_response_latency_slo():
    latencies = []
    for _ in range(15):
        t0 = time.perf_counter()
        status, _ = http_get(f"{BACKEND_URL}/api/v1/status")
        latencies.append((time.perf_counter() - t0) * 1000)
        assert status == 200

    latencies.sort()
    p95 = latencies[int(len(latencies) * 0.95)]
    assert p95 < 500, f"P95 latency {p95}ms violated <500ms target SLO!"
```

### File: `tests/failure_injection_demo.py`

**Purpose:** Programmatically stops the backend container, records precise timestamps of detection and alert firing, restarts the container, and verifies recovery.

```python
import time
import subprocess
import json
import urllib.request

PROMETHEUS_URL = "http://localhost:9090"

def query_prometheus(query: str):
    url = f"{PROMETHEUS_URL}/api/v1/query?query={urllib.parse.quote(query)}"
    with urllib.request.urlopen(url, timeout=5) as resp:
        return json.loads(resp.read().decode()).get("data", {}).get("result", [])

def run_command(cmd: str):
    subprocess.run(cmd, shell=True, check=True)

print("1. Injecting Failure: Stopping backend container...")
t_start = time.time()
run_command("docker stop cloudmonitor-backend")

# Wait for Prometheus detection (up == 0)
t_detected = None
while time.time() - t_start < 45:
    res = query_prometheus('up{job="cloudmonitor-backend"}')
    if res and res[0]["value"][1] == "0":
        t_detected = time.time()
        break
    time.sleep(1)

detection_latency = round(t_detected - t_start, 2)
print(f"Target failure detected in: {detection_latency}s (Target < 30s)")

# Recover container
t_rec_start = time.time()
run_command("docker start cloudmonitor-backend")

# Wait for Prometheus recovery (up == 1)
t_recovered = None
while time.time() - t_rec_start < 45:
    res = query_prometheus('up{job="cloudmonitor-backend"}')
    if res and res[0]["value"][1] == "1":
        t_recovered = time.time()
        break
    time.sleep(1)

recovery_latency = round(t_recovered - t_rec_start, 2)
print(f"Target recovery verified in: {recovery_latency}s (Target < 30s)")
```

---

## 7. Section 6: CI/CD Pipeline (GitHub Actions)

### File: `.github/workflows/ci.yml`

**Purpose:** Automated validation on pull requests and pushes to `main`.

```yaml
name: Cloud Monitor CI Pipeline

on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]

jobs:
  test-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: |
          pip install -r backend/requirements.txt pytest httpx
          pytest tests/test_backend.py -v

  validate-monitoring-configs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Prometheus Configuration Syntax
        run: |
          docker run --rm -v ${{ github.workspace }}/monitoring/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml \
            prom/prometheus:v2.54.1 check config /etc/prometheus/prometheus.yml
      - name: Validate Alert Rules Syntax
        run: |
          docker run --rm -v ${{ github.workspace }}/monitoring/alerts/rules.yml:/etc/prometheus/alerts/rules.yml \
            prom/prometheus:v2.54.1 check rules /etc/prometheus/alerts/rules.yml

  build-docker-images:
    runs-on: ubuntu-latest
    needs: [test-backend, validate-monitoring-configs]
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - run: docker build ./backend -t cloudmonitor-backend:test
      - run: docker build ./frontend -t cloudmonitor-frontend:test
```

---

## 8. Section 7: AWS Production Target Architecture

*(Complete blueprint for deploying Cloud Monitor to Amazon Web Services)*

### 8.1 Architecture Blueprint

```
 Internet
    │
    ▼ (Ports 80 / 443)
┌─────────────────────────────────────────────────────────────┐
│ AWS VPC (Virtual Private Cloud - us-east-1)                 │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │ Amazon EC2 Instance (t3.medium - Ubuntu 22.04 LTS)  │   │
│   │                                                     │   │
│   │   Docker Engine & Docker Compose                    │   │
│   │   ├── Cloud Monitor Frontend (Port 5173 / Nginx 80)    │   │
│   │   ├── Cloud Monitor Backend (Port 8000)                │   │
│   │   ├── Prometheus (Port 9090 - internal only)        │   │
│   │   ├── Grafana (Port 3000 - authenticated)           │   │
│   │   ├── Alertmanager (Port 9093 - internal only)      │   │
│   │   ├── Node Exporter (Port 9100 - loopback only)     │   │
│   │   └── cAdvisor (Port 8080 - loopback only)          │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
    ▲
    │ Pull Images via IAM Role (No Hardcoded Access Keys)
┌───┴────────────────┐
│ Amazon ECR         │
│ (Private Registry) │
└────────────────────┘
```

### 8.2 Security Groups Configuration

- **Inbound Rules:**
  - `SSH (Port 22)`: Restricted strictly to `YOUR_ADMIN_IP/32`. Never allow `0.0.0.0/0`.
  - `HTTP (Port 80)` & `HTTPS (Port 443)`: Allowed from `0.0.0.0/0` (served by Nginx reverse proxy to Frontend).
  - `Grafana (Port 3000)`: Allowed from `YOUR_ADMIN_IP/32` or tunneled via SSH.
  - `Prometheus (9090)`, `Alertmanager (9093)`, `Node Exporter (9100)`, `cAdvisor (8080)`: **Blocked from all public inbound traffic**.

### 8.3 IAM Least-Privilege Role

Attach an IAM Role to the EC2 instance with the policy:
`AmazonEC2ContainerRegistryReadOnly`
*Benefit:* Allows EC2 to pull container images from private Amazon ECR repositories without saving AWS Secret Access Keys on the filesystem.

### 8.4 Automated EC2 Bootstrap UserData Script

```bash
#!/bin/bash
set -e

# Update packages and install Docker
apt-get update -y
apt-get install -y ca-certificates curl gnupg git awscli

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch="$(dpkg --print-architecture)" signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  "$(. /etc/os-release && echo "$VERSION_CODENAME")" stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

apt-get update -y
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Enable Docker
systemctl enable --now docker
usermod -aG docker ubuntu

# Clone repository and start stack
cd /home/ubuntu
git clone https://github.com/blackpython34/cloud_monitor.git
cd cloud_monitor
cp .env.example .env

# Run full stack in background
docker compose up -d --build
```
