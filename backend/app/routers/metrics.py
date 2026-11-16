from datetime import datetime, timezone, timedelta
import os
from typing import List, Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import tuple_

from app.database import get_db
from app.models.user import User
from app.models.agent import Agent
from app.models.metric import ContainerMetric
from app.models.sample import ContainerMetricSample
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
_last_cleanup = datetime.min.replace(tzinfo=timezone.utc)

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

    # 1. Update agent heartbeat and connected state
    current_agent.last_heartbeat = now
    current_agent.status = "connected"

    def utc(value):
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

    retention_days = min(365, max(1, int(os.getenv("CONTAINER_HISTORY_RETENTION_DAYS", "30"))))
    cutoff = now - timedelta(days=retention_days)
    keys = [item.container_id for item in payload.containers]
    if len(set(keys)) != len(keys):
        raise HTTPException(status_code=422, detail="Duplicate container IDs in batch")
    latest = {m.container_id: m for m in db.query(ContainerMetric).filter(
        ContainerMetric.agent_id == current_agent.id, ContainerMetric.container_id.in_(keys)
    ).all()} if keys else {}
    stamps = [(item.container_id, utc(item.recorded_at or batch_time).replace(tzinfo=None)) for item in payload.containers]
    duplicate_rows = db.query(ContainerMetricSample.container_id, ContainerMetricSample.recorded_at).filter(
        ContainerMetricSample.agent_id == current_agent.id,
        tuple_(ContainerMetricSample.container_id, ContainerMetricSample.recorded_at).in_(stamps)
    ).all() if stamps else []
    duplicates = {(cid, utc(recorded).replace(tzinfo=None)) for cid, recorded in duplicate_rows}
    for item in payload.containers:
        recorded = utc(item.recorded_at or batch_time)
        if recorded > now + timedelta(minutes=5):
            raise HTTPException(status_code=422, detail="Sample timestamp is in the future")
        if recorded < cutoff:
            continue
        stamp = recorded.replace(tzinfo=None)
        existing = latest.get(item.container_id)
        if (item.container_id, stamp) not in duplicates:
            db.add(ContainerMetricSample(agent_id=current_agent.id, user_id=current_agent.user_id,
                container_id=item.container_id, recorded_at=recorded, cpu_percent=item.cpu_percent,
                memory_bytes=item.memory_bytes, memory_limit=item.memory_limit,
                network_rx_bytes=item.network_rx_bytes, network_tx_bytes=item.network_tx_bytes,
                block_read_bytes=item.block_read_bytes, block_write_bytes=item.block_write_bytes,
                restart_count=item.restart_count, state=item.state, health_status=item.health_status))
        if existing and utc(existing.recorded_at) > recorded:
            continue
        if not existing:
            existing = ContainerMetric(agent_id=current_agent.id, user_id=current_agent.user_id,
                container_id=item.container_id)
            db.add(existing)
        existing.name, existing.image, existing.state = item.name, item.image, item.state
        existing.health_status = item.health_status
        existing.cpu_percent, existing.memory_bytes = (round(item.cpu_percent, 2) if item.cpu_percent is not None else None), item.memory_bytes
        existing.memory_limit, existing.restart_count, existing.recorded_at = item.memory_limit, item.restart_count, recorded
    # Only a complete, fresh inventory can mark absent containers removed.
    if payload.complete_inventory and utc(batch_time) >= now - timedelta(minutes=2) and all(utc(item.recorded_at or batch_time) >= now - timedelta(minutes=2) for item in payload.containers):
        active = db.query(ContainerMetric).filter(ContainerMetric.agent_id == current_agent.id,
            ContainerMetric.state != "removed").all()
        for metric in active:
            if metric.container_id not in keys and utc(metric.recorded_at) <= utc(batch_time):
                metric.state = "removed"
                metric.recorded_at = utc(batch_time)
                metric.cpu_percent = None
                metric.memory_bytes = None
                metric.memory_limit = None
                if (metric.container_id, utc(batch_time).replace(tzinfo=None)) not in duplicates:
                    db.add(ContainerMetricSample(agent_id=current_agent.id,user_id=current_agent.user_id,
                        container_id=metric.container_id,recorded_at=utc(batch_time),state="removed",
                        restart_count=metric.restart_count))
    # Delete at most one indexed page per minute so ingestion never performs a large table-wide delete.
    global _last_cleanup
    if (now - _last_cleanup).total_seconds() >= 60:
        expired_ids = [row.id for row in db.query(ContainerMetricSample.id).filter(
            ContainerMetricSample.recorded_at < cutoff).order_by(ContainerMetricSample.recorded_at).limit(1000)]
        if expired_ids:
            db.query(ContainerMetricSample).filter(ContainerMetricSample.id.in_(expired_ids)).delete(synchronize_session=False)
        _last_cleanup = now
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

    heartbeats = db.query(Agent.id, Agent.last_heartbeat).filter(Agent.user_id == current_user.id).all()
    agent_heartbeat_fresh = {aid: hb is not None and (datetime.now(timezone.utc) -
        (hb if hb.tzinfo else hb.replace(tzinfo=timezone.utc))).total_seconds() <= 90 for aid, hb in heartbeats}
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
                monitoring_status=("removed" if metric.state == "removed" else
                    "agent_offline" if not agent_heartbeat_fresh.get(metric.agent_id, False) else
                    "telemetry_stale" if (datetime.now(timezone.utc) - (metric.recorded_at if metric.recorded_at.tzinfo else metric.recorded_at.replace(tzinfo=timezone.utc))).total_seconds() > 90 else
                    "unhealthy" if metric.health_status == "unhealthy" else metric.state),
            )
        )

    return response_items


def _history_query(db, user_id, agent_id, container_id, start, end, limit=1000):
    now = datetime.now(timezone.utc)
    end = end or now
    start = start or end - timedelta(hours=1)
    def utc(dt):
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    start, end = utc(start), utc(end)
    if end <= start or end > now + timedelta(minutes=5) or (end-start) > timedelta(days=7):
        raise HTTPException(status_code=422, detail="Invalid history range (maximum 7 days)")
    q = db.query(ContainerMetricSample).join(Agent, ContainerMetricSample.agent_id == Agent.id).filter(
        ContainerMetricSample.user_id == user_id, Agent.user_id == user_id, Agent.is_revoked == False,
        ContainerMetricSample.recorded_at >= start, ContainerMetricSample.recorded_at <= end)
    if agent_id is not None:
        q = q.filter(ContainerMetricSample.agent_id == agent_id)
    if container_id is not None:
        q = q.filter(ContainerMetricSample.container_id == container_id)
    return q.order_by(ContainerMetricSample.recorded_at.desc()).limit(limit).all(), start, end


def _sample(row):
    return {key: getattr(row, key) for key in ('agent_id','container_id','recorded_at',
        'cpu_percent','memory_bytes','memory_limit','network_rx_bytes','network_tx_bytes',
        'block_read_bytes','block_write_bytes','restart_count','state','health_status')}

@router.get('/containers/history')
def container_history(agent_id: Optional[int] = Query(None, ge=1), container_id: Optional[str] = Query(None, max_length=128),
        start: Optional[datetime] = None, end: Optional[datetime] = None, step: int = Query(15, ge=15, le=3600),
        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows, start, end = _history_query(db, current_user.id, agent_id, container_id, start, end)
    # Keep the newest sample in each resolution bucket per container.
    seen, selected = set(), []
    for row in rows:
        key = (row.agent_id, row.container_id, int(row.recorded_at.timestamp()) // step)
        if key not in seen:
            seen.add(key)
            selected.append(_sample(row))
    selected.reverse()
    return {'start':start,'end':end,'step':step,'samples':selected,'truncated':len(rows)==1000}

@router.get('/containers/events')
def container_events(agent_id: Optional[int] = Query(None, ge=1), container_id: Optional[str] = Query(None, max_length=128),
        start: Optional[datetime] = None, end: Optional[datetime] = None,
        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows, _, _ = _history_query(db, current_user.id, agent_id, container_id, start, end)
    previous, events = {}, []
    for row in reversed(rows):
        key = (row.agent_id, row.container_id)
        prior = previous.get(key)
        if prior and (prior.state, prior.health_status, prior.restart_count) != (row.state, row.health_status, row.restart_count):
            events.append({'agent_id':row.agent_id,'container_id':row.container_id,'recorded_at':row.recorded_at,
                'state':row.state,'health_status':row.health_status,'restart_count':row.restart_count})
        previous[key] = row
    return {'events':events[-100:],'truncated':len(rows)==1000}

@router.get('/containers/{container_id}/history')
def specific_container_history(container_id: str, agent_id: int = Query(..., ge=1),
        start: Optional[datetime] = None, end: Optional[datetime] = None, step: int = Query(15, ge=15, le=3600),
        current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return container_history(agent_id, container_id, start, end, step, current_user, db)
