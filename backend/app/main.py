import time
import asyncio
from fastapi import FastAPI, HTTPException, Query, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import generate_latest, CONTENT_TYPE_LATEST

from app.config import settings
from app.database import Base, engine
from app.health import router as health_router, set_health_state
from app.metrics import (
    PrometheusMiddleware,
    SIMULATED_ERRORS_TOTAL,
    APP_HEALTH_STATUS
)
from app.routers.auth import router as auth_router
from app.routers.agents import router as agents_router
from app.routers.metrics import router as metrics_router

# Ensure database schema exists
try:
    Base.metadata.create_all(bind=engine)
except Exception:
    pass

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="CloudMonitor Observability & Application Backend API",
)

# Configure CORS with explicit allowed origins (no wildcard with credentials)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept"],
)

# Add custom Prometheus request tracking middleware
app.add_middleware(PrometheusMiddleware)

# Include health router under both /health and /api/health
app.include_router(health_router, tags=["Health"])
app.include_router(health_router, prefix="/api", tags=["Health"])

# Include authentication router
app.include_router(auth_router, prefix="/api/v1/auth", tags=["Authentication"])

# Include agent management and metric ingestion routers
app.include_router(agents_router, prefix="/api/v1/agents", tags=["Agents"])
app.include_router(metrics_router, prefix="/api/v1/metrics", tags=["Metrics"])


def require_development_mode():
    """Guards simulation endpoints so they can only be executed in development/test environments."""
    env = settings.ENVIRONMENT.lower()
    if env not in ("development", "dev", "test", "local"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Simulation and fault-injection endpoints are disabled in non-development environments.",
        )


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


@app.post("/api/v1/simulate/error", dependencies=[Depends(require_development_mode)], summary="Simulate 500 Server Error for Alert Testing")
def trigger_error():
    """Generates an internal server error to verify alerting and error rate metrics."""
    SIMULATED_ERRORS_TOTAL.inc()
    raise HTTPException(status_code=500, detail="Simulated CloudMonitor internal server failure for SRE verification")


@app.get("/api/v1/simulate/latency", dependencies=[Depends(require_development_mode)], summary="Simulate Latency for SLO/Alert Testing")
async def trigger_latency(delay: float = Query(default=1.0, ge=0.0, le=10.0, description="Delay in seconds")):
    """Simulates API latency to test P95/P99 latency measurements and alert conditions."""
    await asyncio.sleep(delay)
    return {"message": f"Response completed after {delay} seconds delay", "delayed_by": delay}


@app.post("/api/v1/simulate/health-toggle", dependencies=[Depends(require_development_mode)], summary="Toggle Health Status for Detection Demo")
def toggle_health(status: bool = Query(..., description="True for healthy, False for unhealthy")):
    """Manually toggles application health gauge to test alert detection without shutting down container."""
    set_health_state(status)
    return {"status": "updated", "is_healthy": status}
