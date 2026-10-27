from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, Float, String, DateTime, ForeignKey, Index
from sqlalchemy.orm import relationship
from app.database import Base

class ContainerMetric(Base):
    __tablename__ = "container_metrics"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    agent_id = Column(Integer, ForeignKey("agents.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    container_id = Column(String(128), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    image = Column(String(255), nullable=True)
    state = Column(String(32), nullable=False, default="unknown")
    health_status = Column(String(32), nullable=True)
    cpu_percent = Column(Float, nullable=False, default=0.0)
    memory_bytes = Column(BigInteger, nullable=False, default=0)
    memory_limit = Column(BigInteger, nullable=False, default=0)
    restart_count = Column(Integer, nullable=False, default=0)
    recorded_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True
    )

    agent = relationship("Agent", backref="metrics")
    user = relationship("User", backref="container_metrics")

    __table_args__ = (
        Index("ix_agent_container", "agent_id", "container_id"),
    )
