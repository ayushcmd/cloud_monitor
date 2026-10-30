from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.agent import Agent
from app.models.metric import ContainerMetric
from app.schemas.metric import (
    MetricIngestRequest,
    MetricIngestResponse,
    ContainerMetricResponse,
)
from app.auth.security import (
    get_current_user,
    get_current_agent,
)

router = APIRouter()

@router.post(
    "/ingest",
    response_model=MetricIngestResponse,
    status_code=status.HTTP_200_OK,
    summary="Ingest Container Metrics Batch from Agent"
)
def ingest_container_metrics(
    payload: MetricIngestRequest,
    current_agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db)
):
    """
    Submits container telemetry collected by the authorized Docker agent.
    Authenticates via 'X-Agent-Key' header or Bearer token.
    Enforces per-batch limit of 100 containers to protect server resources.
    Updates the latest container metric snapshot associated with the agent and owner.
    """
    now = datetime.now(timezone.utc)
    batch_time = payload.timestamp or now

    # 1. Update agent heartbeat
    current_agent.last_heartbeat = now
    current_agent.status = "online"

    # 2. Upsert container metric snapshots
    for item in payload.containers:
        recorded_time = item.recorded_at or batch_time

        # Check for existing container record for this agent
        existing = (
            db.query(ContainerMetric)
            .filter(
                ContainerMetric.agent_id == current_agent.id,
                ContainerMetric.container_id == item.container_id
            )
            .first()
        )

        if existing:
            existing.name = item.name
            existing.image = item.image
            existing.state = item.state
            existing.health_status = item.health_status
            existing.cpu_percent = round(item.cpu_percent, 2)
            existing.memory_bytes = item.memory_bytes
            existing.memory_limit = item.memory_limit
            existing.restart_count = item.restart_count
            existing.recorded_at = recorded_time
        else:
            new_record = ContainerMetric(
                agent_id=current_agent.id,
                user_id=current_agent.user_id,
                container_id=item.container_id,
                name=item.name,
                image=item.image,
                state=item.state,
                health_status=item.health_status,
                cpu_percent=round(item.cpu_percent, 2),
                memory_bytes=item.memory_bytes,
                memory_limit=item.memory_limit,
                restart_count=item.restart_count,
                recorded_at=recorded_time,
            )
            db.add(new_record)

    db.commit()

    return MetricIngestResponse(
        status="ok",
        ingested_count=len(payload.containers),
        recorded_at=now,
    )

@router.get(
    "/containers",
    response_model=List[ContainerMetricResponse],
    summary="Get User's Monitored Containers"
)
def get_user_container_metrics(
    agent_id: Optional[int] = Query(None, description="Optional agent ID to filter containers by specific host"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves latest container metrics for all agents belonging to the authenticated user.
    Strictly tenant-scoped: User A cannot view User B's container metrics.
    Only returns metrics for non-revoked agents.
    """
    query = (
        db.query(ContainerMetric, Agent.name.label("agent_name"))
        .join(Agent, ContainerMetric.agent_id == Agent.id)
        .filter(
            ContainerMetric.user_id == current_user.id,
            Agent.is_revoked == False
        )
    )

    if agent_id is not None:
        query = query.filter(ContainerMetric.agent_id == agent_id)

    results = query.order_by(ContainerMetric.name.asc()).all()

    response_items = []
    for metric, agent_name in results:
        response_items.append(
            ContainerMetricResponse(
                id=metric.id,
                agent_id=metric.agent_id,
                agent_name=agent_name,
                container_id=metric.container_id,
                name=metric.name,
                image=metric.image,
                state=metric.state,
                health_status=metric.health_status,
                cpu_percent=metric.cpu_percent,
                memory_bytes=metric.memory_bytes,
                memory_limit=metric.memory_limit,
                restart_count=metric.restart_count,
                recorded_at=metric.recorded_at,
            )
        )

    return response_items
