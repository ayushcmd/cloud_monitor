# Cloud Monitor System Architecture

## 1. High-Level Architecture Overview

Cloud Monitor is designed as an end-to-end, multi-tier observability and application telemetry platform. It unifies host infrastructure metrics, container runtime statistics, and custom application-level instrumentation into a single coordinated pipeline.

```
+-------------------------------------------------------------------------------------------------------+
|                                             CLOUD MONITOR                                             |
+-------------------------------------------------------------------------------------------------------+
        |                                                                           |
        v                                                                           v
+-----------------------------+                             +-------------------------------------------+
|    Application Layer        |                             |         Infrastructure Exporters          |
|                             |                             |                                           |
|   +---------------------+   |                             |   +-----------------+ +---------------+   |
|   |  FastAPI Backend    |   |                             |   |  Node Exporter  | |   cAdvisor    |   |
|   |  Port 8000          |   |                             |   |  Port 9100      | |   Port 8080   |   |
|   |  /health & /metrics |   |                             |   |  Host Metrics   | |  Containers   |   |
|   +----------+----------+   |                             |   +--------+--------+ +-------+-------+   |
|              |              |                             |            |                  |           |
+--------------|--------------+                             +------------|------------------|-----------+
               |                                                         |                  |
               +---------------------------+                             |                  |
                                           |                             |                  |
                                           v                             v                  v
                               +--------------------------------------------------------------------+
                               |                     Prometheus Server (TSDB)                       |
                               |                     Port 9090                                      |
                               |                     Scrape Interval: 15s                           |
                               +------------------+------------------------------+------------------+
                                                  |                              |
                                                  v                              v
                                      +-----------------------+      +-----------------------+
                                      |   Grafana Dashboards  |      |     Alertmanager      |
                                      |   Port 3000           |      |     Port 9093         |
                                      |   Curated Panels      |      |     Rule Evaluation   |
                                      +-----------------------+      +-----------------------+
                                                  ^
                                                  |
                                      +-----------------------+
                                      |  Cloud Monitor Frontend |
                                      |  Port 5173            |
                                      |  Unified Portal & Lab |
                                      +-----------------------+
```

## 2. Core Components and Responsibilities

### A. Data Collection Layer
1. **Node Exporter (prom/node-exporter:v1.8.2)**:
   - Gathers host OS and hardware metrics.
   - Monitors physical/virtual CPU modes (user, system, idle, iowait), RAM consumption, swap, disk filesystem free/used bytes, and network interface traffic.
2. **cAdvisor (gcr.io/cadvisor/cadvisor:v0.49.1)**:
   - Evaluates real-time Docker container performance and resource usage.
   - Isolates CPU utilization, memory footprints, and lifecycle status for each container.
3. **Cloud Monitor Custom Backend (FastAPI)**:
   - Instruments application requests using `prometheus_client`.
   - Tracks incoming request throughput, latency distribution histograms (P50, P95, P99), HTTP status codes, and application health gauges.

### B. Storage & Querying Layer
1. **Prometheus Server (prom/prometheus:v2.54.1)**:
   - Pull-based time-series metrics collector.
   - Configured with a 15s scrape interval and 15s evaluation interval.
   - Persists data to an internal TSDB and evaluates alerting rules continuously.

### C. Visualization & Incident Management
1. **Grafana (grafana/grafana:11.2.0)**:
   - Provisioned automatically via Git-managed configuration files.
   - Pre-configured with the `CloudMonitor - Unified Observability Platform` dashboard covering System, Containers, and Application layers.
2. **Alertmanager (prom/alertmanager:v0.27.0)**:
   - Handles alert deduplication, grouping, and dispatch.
   - Routes critical events (service down, severe degradation) and warnings (high CPU/RAM, elevated error rate).
3. **Cloud Monitor Custom UI (React / Vite)**:
   - Unified operator portal displaying live telemetry, active target statuses, SLO benchmarks, and an interactive failure injection lab.
