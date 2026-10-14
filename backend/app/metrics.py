import time
from prometheus_client import Counter, Histogram, Gauge
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

# 1. Total HTTP Requests counter
HTTP_REQUESTS_TOTAL = Counter(
    "cloudmonitor_http_requests_total",
    "Total count of HTTP requests processed by CloudMonitor backend",
    ["method", "endpoint", "status_code"],
)

# 2. HTTP Request Duration histogram (latency)
HTTP_REQUEST_DURATION_SECONDS = Histogram(
    "cloudmonitor_http_request_duration_seconds",
    "Histogram of HTTP request latency in seconds",
    ["method", "endpoint"],
    buckets=[0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0],
)

# 3. Application Health status gauge (1 = Healthy, 0 = Degraded/Unhealthy)
APP_HEALTH_STATUS = Gauge(
    "cloudmonitor_app_health_status",
    "Overall health status of CloudMonitor application (1=healthy, 0=unhealthy)",
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
