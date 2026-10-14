import time
import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.config import settings
from app.health import router as health_router, set_health_state
from app.metrics import (
    PrometheusMiddleware,
    SIMULATED_ERRORS_TOTAL,
    APP_HEALTH_STATUS
)

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="CloudMonitor Observability & Application Backend API",
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
        "project": "CloudMonitor",
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
    raise HTTPException(status_code=500, detail="Simulated CloudMonitor internal server failure for SRE verification")


@app.get("/api/v1/simulate/latency", summary="Simulate Latency for SLO/Alert Testing")
async def trigger_latency(delay: float = Query(default=1.0, ge=0.0, le=10.0, description="Delay in seconds")):
    """Simulates API latency to test P95/P99 latency measurements and alert conditions."""
    await asyncio.sleep(delay)
    return {"message": f"Response completed after {delay} seconds delay", "delayed_by": delay}


@app.post("/api/v1/simulate/health-toggle", summary="Toggle Health Status for Detection Demo")
def toggle_health(status: bool = Query(..., description="True for healthy, False for unhealthy")):
    """Manually toggles application health gauge to test alert detection without shutting down container."""
    set_health_state(status)
    return {"status": "updated", "is_healthy": status}
