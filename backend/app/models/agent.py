from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Agent(Base):
    __tablename__ = "agents"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    agent_key_hash = Column(String(64), unique=True, index=True, nullable=False)
    agent_key_prefix = Column(String(16), nullable=False)
    status = Column(String(32), default="pending", nullable=False)
    os_type = Column(String(32), default="linux", nullable=False)
    hostname = Column(String(255), nullable=True)
    docker_version = Column(String(64), nullable=True)
    os_info = Column(String(128), nullable=True)
    agent_version = Column(String(32), nullable=True)
    last_heartbeat = Column(DateTime(timezone=True), nullable=True)
    is_revoked = Column(Boolean, default=False, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", backref="agents")
