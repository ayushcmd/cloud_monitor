from datetime import datetime, timezone
from sqlalchemy import Column, Integer, BigInteger, Float, String, DateTime, ForeignKey, Index, UniqueConstraint
from app.database import Base

class ContainerMetricSample(Base):
    __tablename__ = 'container_metric_samples'
    id = Column(Integer, primary_key=True)
    agent_id = Column(Integer, ForeignKey('agents.id', ondelete='CASCADE'), nullable=False)
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    container_id = Column(String(128), nullable=False)
    recorded_at = Column(DateTime(timezone=True), nullable=False)
    cpu_percent = Column(Float)
    memory_bytes = Column(BigInteger)
    memory_limit = Column(BigInteger)
    network_rx_bytes = Column(BigInteger)
    network_tx_bytes = Column(BigInteger)
    block_read_bytes = Column(BigInteger)
    block_write_bytes = Column(BigInteger)
    restart_count = Column(Integer, nullable=False, default=0)
    state = Column(String(32), nullable=False)
    health_status = Column(String(32))
    __table_args__ = (
        UniqueConstraint('agent_id', 'container_id', 'recorded_at', name='uq_sample_identity'),
        Index('ix_sample_tenant_agent_container_time', 'user_id', 'agent_id', 'container_id', 'recorded_at'),
        Index('ix_sample_recorded_at', 'recorded_at'),
    )
