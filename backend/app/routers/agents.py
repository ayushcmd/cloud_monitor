from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
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
    AgentLocalProvisionRequest,
    AgentLocalProvisionResponse,
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
        total_cpu = sum((m.cpu_percent or 0.0) for m in metrics)
        total_mem = sum((m.memory_bytes or 0) for m in metrics)

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
    metrics = db.query(ContainerMetric).filter(ContainerMetric.agent_id == agent.id, ContainerMetric.state != 'removed').all()
    container_count = len(metrics)
    running_count = sum(1 for m in metrics if m.state == "running")
    stopped_count = sum(1 for m in metrics if m.state != "running")
    total_cpu = sum(m.cpu_percent or 0 for m in metrics)
    total_mem = sum(m.memory_bytes or 0 for m in metrics)

    # Determine connection stage
    if agent.is_revoked:
        stage = "revoked"
        status_val = "revoked"
    elif agent.last_heartbeat:
        hb = agent.last_heartbeat if agent.last_heartbeat.tzinfo else agent.last_heartbeat.replace(tzinfo=timezone.utc)
        delta_sec = (now - hb).total_seconds()
        if delta_sec <= 90:
            status_val = "online"
            if container_count > 0 or agent.status == "connected":
                stage = "connected"
            else:
                stage = "heartbeat_received"
        else:
            stage = "offline"
            status_val = "offline"
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
    if current_agent.status != "connected":
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

@router.post(
    "/dev/provision-local",
    response_model=AgentLocalProvisionResponse,
    status_code=status.HTTP_200_OK,
    summary="Auto-Provision Local Docker Agent (Trusted Development Only)"
)
def provision_local_agent(
    payload: Optional[AgentLocalProvisionRequest] = None,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Auto-provisions or reuses a local Docker monitoring agent during development.
    Strictly restricted to local development environments and loopback clients.
    Reuses existing agents when available to avoid duplicate registrations.
    Starts the agent container on cloudmonitor-network and configures local backend IPC.
    """
    from app.config import Settings
    settings = Settings()
    if settings.ENVIRONMENT != "development" or not settings.ENABLE_DEV_PROVISIONING:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local agent auto-provisioning is strictly restricted to trusted local development environments."
        )

    # Locality & Header Spoofing Protection
    # 1. Reject untrusted X-Forwarded-For forwarding chains
    import ipaddress
    raw_xff = request.headers.get("x-forwarded-for", "").strip() if request else ""
    if raw_xff:
        for hop in raw_xff.split(","):
            clean_hop = hop.strip()
            if not clean_hop:
                continue
            try:
                hop_ip = ipaddress.ip_address(clean_hop)
                # Client must originate strictly from loopback or internal Docker bridge
                if not (hop_ip.is_loopback or hop_ip in ipaddress.ip_network("172.16.0.0/12")):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Untrusted proxy or non-local forwarding detected."
                    )
            except ValueError:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Malformed forwarding headers detected."
                )

    # 2. Reject untrusted X-Real-IP headers
    raw_x_real = request.headers.get("x-real-ip", "").strip() if request else ""
    if raw_x_real:
        try:
            real_ip = ipaddress.ip_address(raw_x_real)
            if not (real_ip.is_loopback or real_ip in ipaddress.ip_network("172.16.0.0/12")):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Untrusted origin IP detected in headers."
                )
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Malformed origin IP header detected."
            )

    # 3. Verify client TCP peer IP is loopback or local Docker bridge
    client_host = request.client.host if (request and request.client) else ""
    is_trusted_peer = False
    if client_host in ("127.0.0.1", "::1", "localhost", "testclient"):
        is_trusted_peer = True
    elif client_host:
        try:
            peer_ip = ipaddress.ip_address(client_host)
            # Only loopback or Docker bridge subnet (172.16.0.0/12) is eligible, and Host must be local
            host_header = (request.headers.get("host") or "").lower()
            is_local_host = any(host_header.startswith(h) for h in ("localhost", "127.0.0.1", "backend", "testserver"))
            if (peer_ip.is_loopback or peer_ip in ipaddress.ip_network("172.16.0.0/12")) and is_local_host:
                is_trusted_peer = True
        except ValueError:
            pass

    if not is_trusted_peer:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Local agent auto-provisioning is only permitted from trusted local development connections."
        )

    req = payload or AgentLocalProvisionRequest()
    existing_agent = None
    reused = False
    raw_key = None

    # Strict Tenant Isolation: Enforce ownership check if agent_id is passed
    if req.agent_id:
        target = db.query(Agent).filter(Agent.id == req.agent_id).first()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent ID {req.agent_id} not found."
            )
        if target.user_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: Cannot provision or reuse an agent belonging to another tenant."
            )
        if target.is_revoked:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot reuse a revoked agent."
            )
        existing_agent = target
    elif req.reuse_existing:
        existing_agent = (
            db.query(Agent)
            .filter(Agent.user_id == current_user.id, Agent.is_revoked == False)
            .order_by(Agent.last_heartbeat.desc().nullslast(), Agent.id.desc())
            .first()
        )

    if existing_agent:
        agent = existing_agent
        reused = True

        # Check if agent is already online with a running container
        now = datetime.now(timezone.utc)
        hb = agent.last_heartbeat if agent.last_heartbeat and agent.last_heartbeat.tzinfo else (
            agent.last_heartbeat.replace(tzinfo=timezone.utc) if agent.last_heartbeat else None
        )
        is_online = hb and (now - hb).total_seconds() <= 90

        from app.services.docker_provisioner import get_docker_client, start_or_restart_local_agent
        try:
            d_client = get_docker_client()
            c_name = f"cloudmonitor-agent-{agent.id}"
            try:
                c = d_client.containers.get(c_name)
                c_running = (c.status == "running")
            except Exception:
                c_running = False
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=str(e)
            )

        if is_online and c_running:
            return AgentLocalProvisionResponse(
                agent_id=agent.id,
                name=agent.name,
                status="online",
                stage="connected" if agent.status == "connected" else "heartbeat_received",
                reused=True,
                message=f"Local agent '{agent.name}' (ID: {agent.id}) is already online and streaming telemetry."
            )

        # Rotate key to start fresh container
        raw_key, key_hash, key_prefix = generate_agent_key()
        agent.agent_key_hash = key_hash
        agent.agent_key_prefix = key_prefix
        agent.status = "pending"
        db.commit()
    else:
        raw_key, key_hash, key_prefix = generate_agent_key()
        agent = Agent(
            user_id=current_user.id,
            name=(req.name or "Local Docker Host").strip(),
            os_type="linux",
            agent_key_hash=key_hash,
            agent_key_prefix=key_prefix,
            status="pending",
            is_revoked=False
        )
        db.add(agent)
        db.commit()
        db.refresh(agent)

    from app.services.docker_provisioner import start_or_restart_local_agent
    try:
        _, msg = start_or_restart_local_agent(
            agent_id=agent.id,
            agent_key=raw_key,
            server_url="http://backend:8000",
            network_name="cloudmonitor-network"
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(e)
        )

    return AgentLocalProvisionResponse(
        agent_id=agent.id,
        name=agent.name,
        status="pending",
        stage="waiting_for_agent",
        reused=reused,
        message=msg
    )
