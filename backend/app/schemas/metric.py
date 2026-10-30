from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

class ContainerMetricItem(BaseModel):
    container_id: str = Field(..., min_length=1, max_length=128, description="Docker container ID or short SHA")
    name: str = Field(..., min_length=1, max_length=255, description="Container name without leading slash")
    image: Optional[str] = Field(None, max_length=255, description="Docker image repository:tag")
    state: str = Field(..., max_length=32, description="Current container lifecycle state (running, exited, paused, etc.)")
    health_status: Optional[str] = Field(None, max_length=32, description="Health status (healthy, unhealthy, starting, none)")
    cpu_percent: float = Field(..., ge=0.0, description="CPU utilization percentage (0.0 to 100.0 * num_cpus)")
    memory_bytes: int = Field(..., ge=0, description="Current memory consumption in bytes (RSS/working set)")
    memory_limit: int = Field(..., ge=0, description="Container memory limit in bytes")
    restart_count: int = Field(..., ge=0, description="Number of times container has restarted")
    recorded_at: Optional[datetime] = None

class MetricIngestRequest(BaseModel):
    timestamp: Optional[datetime] = None
    containers: List[ContainerMetricItem] = Field(
        ...,
        max_length=100,
        description="List of container telemetry objects (capped at 100 containers per ingestion batch)"
    )

class MetricIngestResponse(BaseModel):
    status: str = "ok"
    ingested_count: int
    recorded_at: datetime

class ContainerMetricResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    agent_id: int
    agent_name: str
    container_id: str
    name: str
    image: Optional[str] = None
    state: str
    health_status: Optional[str] = None
    cpu_percent: float
    memory_bytes: int
    memory_limit: int
    restart_count: int
    recorded_at: datetime
