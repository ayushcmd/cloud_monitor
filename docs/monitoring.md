# Cloud Monitor Monitoring, Metrics & Alerting Reference

## 1. Metrics Catalog

### A. Infrastructure Metrics (Node Exporter)
- `node_cpu_seconds_total`: Tracks CPU core operational time by mode (`idle`, `user`, `system`, `iowait`).
- `node_memory_MemTotal_bytes`: Total physical RAM on the host.
- `node_memory_MemAvailable_bytes`: Available memory remaining before swapping.
- `node_filesystem_size_bytes` & `node_filesystem_avail_bytes`: Partition capacities and free disk space.
- `node_network_receive_bytes_total`: Ingress network volume per interface.

### B. Container Metrics (cAdvisor)
- `container_cpu_usage_seconds_total`: Cumulative CPU seconds consumed by container or cgroup.
- `container_memory_usage_bytes`: Current working memory allocated to each container.
- `container_last_seen`: Timestamp when cAdvisor last observed the active container.

### C. Application Metrics (Cloud Monitor FastAPI)
- `cloudmonitor_http_requests_total`: Counter partitioned by `method`, `endpoint`, and `status_code`.
- `cloudmonitor_http_request_duration_seconds`: Histogram measuring API response latency across configured duration buckets (`0.01s` to `5.0s`).
- `cloudmonitor_app_health_status`: Binary gauge (`1` = healthy, `0` = degraded/unhealthy).
- `cloudmonitor_active_requests`: Gauge tracking currently in-flight HTTP requests.

---

## 2. Alert Rules Catalog (`monitoring/alerts/rules.yml`)

| Alert Name | Severity | Condition (PromQL) | Threshold Duration | Description |
| :--- | :--- | :--- | :--- | :--- |
| **CloudMonitorApplicationDown** | Critical | `up{job="cloudmonitor-backend"} == 0` | 15s | Application API is unreachable |
| **CloudMonitorHealthDegraded** | Critical | `cloudmonitor_app_health_status == 0` | 15s | Application self-probe reports failure |
| **HostHighCpuUtilization** | Warning | `CPU Busy > 85%` | 1m | Host processor sustained high load |
| **HostHighMemoryUtilization**| Warning | `RAM Used > 85%` | 1m | Host memory exhaustion warning |
| **HighHttpErrorRate** | Warning | `5xx rate > 0.05 req/s` | 30s | Server error spike detected |
| **HighRequestLatency** | Warning | `P95 latency > 0.5s` | 1m | Latency SLO breached |

---

## 3. Difference Between Monitoring and Observability

- **Monitoring ("What is happening?")**:
  Prometheus evaluates metrics against static thresholds and reports whether services are UP or DOWN and whether resource usage is within predefined limits.
- **Observability ("Why is it happening?")**:
  Through correlated multi-dimensional labels, Grafana dashboards, and latency distributions (P50/P95/P99), Cloud Monitor allows operators to drill into an outage, observe resource constraints, correlate memory pressure with latency spikes, and pinpoint root causes.
