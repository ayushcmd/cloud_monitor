from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models.user import User
from app.models.agent import Agent
from app.models.metric import ContainerMetric
from app.schemas.agent import (
    AgentEnrollRequest,
    AgentEnrollResponse,
    AgentResponse,
    AgentRotateKeyResponse,
    AgentConnectionStatusResponse,
    HeartbeatRequest,
    HeartbeatResponse,
)
from app.auth.security import (
    get_current_user,
    get_current_agent,
    generate_agent_key,
)

router = APIRouter()

@router.post(
    "/enroll",
    response_model=AgentEnrollResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Enroll a New Docker Monitoring Agent / Host"
)
def enroll_agent(
    payload: AgentEnrollRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Authorizes a new Docker monitoring agent for the logged-in user (tenant).
    Generates a cryptographically secure 256-bit agent secret key.
    The raw agent_key is returned ONLY in this response and must be saved by the user.
    Only the SHA-256 hash is permanently stored in PostgreSQL.
    """
    raw_key, key_hash, key_prefix = generate_agent_key()
    os_type = (payload.os_type or "linux").strip().lower()
    if os_type not in ("windows", "linux", "macos"):
        os_type = "linux"

    agent = Agent(
        user_id=current_user.id,
        name=payload.name.strip(),
        os_type=os_type,
        agent_key_hash=key_hash,
        agent_key_prefix=key_prefix,
        status="pending",
        is_revoked=False,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    return AgentEnrollResponse(
        id=agent.id,
        name=agent.name,
        os_type=agent.os_type,
        agent_key=raw_key,
        agent_key_prefix=agent.agent_key_prefix,
        status=agent.status,
        created_at=agent.created_at,
    )

@router.get(
    "",
    response_model=List[AgentResponse],
    summary="List Authenticated User's Agents"
)
def list_user_agents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves all Docker agents enrolled by the current authenticated user with telemetry summaries."""
    agents = (
        db.query(Agent)
        .filter(Agent.user_id == current_user.id)
        .order_by(Agent.created_at.desc())
        .all()
    )

    now = datetime.now(timezone.utc)
    enriched_agents = []

    for ag in agents:
        # Check if agent went offline (no heartbeat for > 90 seconds)
        current_status = ag.status
        if not ag.is_revoked:
            if ag.last_heartbeat:
                hb = ag.last_heartbeat if ag.last_heartbeat.tzinfo else ag.last_heartbeat.replace(tzinfo=timezone.utc)
                delta_sec = (now - hb).total_seconds()
                if delta_sec > 90:
                    current_status = "offline"
                else:
                    current_status = "online"
            else:
                current_status = "pending"
        else:
            current_status = "revoked"

        # Calculate container aggregates
        metrics = db.query(ContainerMetric).filter(ContainerMetric.agent_id == ag.id).all()
        container_count = len(metrics)
        running_count = sum(1 for m in metrics if m.state == "running")
        total_cpu = sum(m.cpu_percent for m in metrics)
        total_mem = sum(m.memory_bytes for m in metrics)

        enriched_agents.append(
            AgentResponse(
                id=ag.id,
                name=ag.name,
                os_type=ag.os_type or "linux",
                agent_key_prefix=ag.agent_key_prefix,
                status=current_status,
                hostname=ag.hostname,
                docker_version=ag.docker_version,
                os_info=ag.os_info,
                agent_version=ag.agent_version,
                last_heartbeat=ag.last_heartbeat,
                is_revoked=ag.is_revoked,
                created_at=ag.created_at,
                container_count=container_count,
                running_count=running_count,
                total_cpu_percent=round(total_cpu, 1),
                total_memory_bytes=total_mem,
            )
        )

    return enriched_agents

@router.get(
    "/{agent_id}/connection-status",
    response_model=AgentConnectionStatusResponse,
    summary="Get Detailed Real-Time Connection Progress for an Agent"
)
def get_connection_status(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Returns real-time connection progress for the connection wizard (Screen D & E).
    Calculates stages based on authentic heartbeat events and ingested metrics.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or does not belong to the authenticated user."
        )

    now = datetime.now(timezone.utc)
    metrics = db.query(ContainerMetric).filter(ContainerMetric.agent_id == agent.id).all()
    container_count = len(metrics)
    running_count = sum(1 for m in metrics if m.state == "running")
    stopped_count = sum(1 for m in metrics if m.state != "running")
    total_cpu = sum(m.cpu_percent for m in metrics)
    total_mem = sum(m.memory_bytes for m in metrics)

    # Determine connection stage
    if agent.is_revoked:
        stage = "revoked"
        status_val = "revoked"
    elif container_count > 0 and agent.last_heartbeat:
        hb = agent.last_heartbeat if agent.last_heartbeat.tzinfo else agent.last_heartbeat.replace(tzinfo=timezone.utc)
        delta_sec = (now - hb).total_seconds()
        if delta_sec <= 90:
            stage = "connected"
            status_val = "online"
        else:
            stage = "connected"
            status_val = "offline"
    elif agent.last_heartbeat:
        stage = "heartbeat_received"
        status_val = "online"
    else:
        stage = "waiting_for_agent"
        status_val = "pending"

    return AgentConnectionStatusResponse(
        agent_id=agent.id,
        name=agent.name,
        os_type=agent.os_type or "linux",
        status=status_val,
        stage=stage,
        is_revoked=agent.is_revoked,
        last_heartbeat=agent.last_heartbeat,
        hostname=agent.hostname,
        os_info=agent.os_info,
        docker_version=agent.docker_version,
        agent_version=agent.agent_version,
        container_count=container_count,
        running_count=running_count,
        stopped_count=stopped_count,
        total_cpu_percent=round(total_cpu, 1),
        total_memory_bytes=total_mem,
    )

@router.post(
    "/{agent_id}/rotate-key",
    response_model=AgentRotateKeyResponse,
    status_code=status.HTTP_200_OK,
    summary="Rotate Agent Secret Key"
)
def rotate_agent_key(
    agent_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Rotates the secret key for an existing agent host.
    Generates a new 256-bit key, immediately invalidating the previous credential.
    Resets agent status to 'pending' until the host connects with the new key.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or does not belong to the authenticated user."
        )

    raw_key, key_hash, key_prefix = generate_agent_key()
    now = datetime.now(timezone.utc)

    agent.agent_key_hash = key_hash
    agent.agent_key_prefix = key_prefix
    agent.is_revoked = False
    agent.status = "pending"
    db.commit()

    return AgentRotateKeyResponse(
        id=agent.id,
        name=agent.name,
        agent_key=raw_key,
        agent_key_prefix=agent.agent_key_prefix,
        status=agent.status,
        rotated_at=now,
    )

@router.delete(
    "/{agent_id}",
    status_code=status.HTTP_200_OK,
    summary="Revoke or Disconnect an Enrolled Host"
)
def revoke_agent(
    agent_id: int,
    purge: bool = Query(False, description="If true, permanently removes the agent and cascades associated metrics"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Revokes credentials or permanently disconnects the specified agent.
    Enforces strict tenancy ownership: users cannot revoke agents belonging to other users.
    Once revoked, all subsequent heartbeats and metrics ingestion from this agent are rejected.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id, Agent.user_id == current_user.id).first()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Agent not found or does not belong to the authenticated user."
        )

    if purge:
        db.delete(agent)
        db.commit()
        return {"status": "purged", "agent_id": agent_id, "message": "Agent and associated metrics permanently removed."}

    agent.is_revoked = True
    agent.status = "revoked"
    db.commit()

    return {"status": "revoked", "agent_id": agent_id, "message": "Agent credentials revoked successfully."}

@router.post(
    "/heartbeat",
    response_model=HeartbeatResponse,
    summary="Agent Health Check & Status Heartbeat"
)
def agent_heartbeat(
    payload: HeartbeatRequest,
    current_agent: Agent = Depends(get_current_agent),
    db: Session = Depends(get_db)
):
    """
    Outbound heartbeat endpoint called by the running Docker agent daemon.
    Authenticates via 'X-Agent-Key' header or Bearer token.
    Updates the agent's last_heartbeat timestamp and runtime host metadata.
    """
    now = datetime.now(timezone.utc)
    current_agent.last_heartbeat = now
    current_agent.status = "online"

    if payload.hostname:
        current_agent.hostname = payload.hostname
    if payload.docker_version:
        current_agent.docker_version = payload.docker_version
    if payload.os_info:
        current_agent.os_info = payload.os_info
    if payload.agent_version:
        current_agent.agent_version = payload.agent_version

    db.commit()

    return HeartbeatResponse(
        status="ok",
        agent_id=current_agent.id,
        recorded_at=now,
    )
