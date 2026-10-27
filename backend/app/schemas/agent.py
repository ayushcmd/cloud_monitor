from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class AgentEnrollRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Friendly identifier for the Docker agent")
    os_type: Optional[str] = Field("linux", max_length=32, description="Operating system: windows, linux, or macos")

class AgentEnrollResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    os_type: str = "linux"
    agent_key: str = Field(..., description="High-entropy raw agent secret key (displayed only once upon enrollment)")
    agent_key_prefix: str
    status: str
    created_at: datetime

class AgentRotateKeyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    agent_key: str = Field(..., description="Newly rotated high-entropy agent secret key (displayed only once)")
    agent_key_prefix: str
    status: str
    rotated_at: datetime

class AgentConnectionStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    agent_id: int
    name: str
    os_type: str = "linux"
    status: str
    stage: str = Field(..., description="Wizard connection stage: preparing, waiting_for_agent, heartbeat_received, metrics_received, connected, revoked, offline")
    is_revoked: bool
    last_heartbeat: Optional[datetime] = None
    hostname: Optional[str] = None
    os_info: Optional[str] = None
    docker_version: Optional[str] = None
    agent_version: Optional[str] = None
    container_count: int = 0
    running_count: int = 0
    stopped_count: int = 0
    total_cpu_percent: float = 0.0
    total_memory_bytes: int = 0

class AgentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    os_type: str = "linux"
    agent_key_prefix: str
    status: str
    hostname: Optional[str] = None
    docker_version: Optional[str] = None
    os_info: Optional[str] = None
    agent_version: Optional[str] = None
    last_heartbeat: Optional[datetime] = None
    is_revoked: bool
    created_at: datetime
    container_count: int = 0
    running_count: int = 0
    total_cpu_percent: float = 0.0
    total_memory_bytes: int = 0

class HeartbeatRequest(BaseModel):
    hostname: Optional[str] = Field(None, max_length=255)
    os_info: Optional[str] = Field(None, max_length=128)
    docker_version: Optional[str] = Field(None, max_length=64)
    agent_version: Optional[str] = Field(None, max_length=32)

class HeartbeatResponse(BaseModel):
    status: str = "ok"
    agent_id: int
    recorded_at: datetime
