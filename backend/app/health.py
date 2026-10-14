import time
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any
from app.config import settings
from app.metrics import APP_HEALTH_STATUS

router = APIRouter()
START_TIME = time.time()

IS_HEALTHY: bool = True

def set_health_state(healthy: bool) -> None:
    global IS_HEALTHY
    IS_HEALTHY = healthy
    APP_HEALTH_STATUS.set(1 if healthy else 0)

def get_health_state() -> bool:
    return IS_HEALTHY

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
    is_healthy = get_health_state()
    
    components = {
        "api": "healthy" if is_healthy else "degraded",
        "metrics_exporter": "healthy",
        "engine": "active" if is_healthy else "inactive"
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
