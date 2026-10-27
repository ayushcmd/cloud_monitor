"""create agents and container_metrics tables

Revision ID: 002_agents_metrics
Revises: 001_create_users_table
Create Date: 2026-10-26 18:05:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '002_agents_metrics'
down_revision: Union[str, None] = '001_create_users_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    # 1. Create agents table
    op.create_table(
        'agents',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('agent_key_hash', sa.String(length=64), nullable=False),
        sa.Column('agent_key_prefix', sa.String(length=16), nullable=False),
        sa.Column('status', sa.String(length=32), nullable=False, server_default='pending'),
        sa.Column('hostname', sa.String(length=255), nullable=True),
        sa.Column('docker_version', sa.String(length=64), nullable=True),
        sa.Column('os_info', sa.String(length=128), nullable=True),
        sa.Column('last_heartbeat', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_revoked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agents_id'), 'agents', ['id'], unique=False)
    op.create_index(op.f('ix_agents_user_id'), 'agents', ['user_id'], unique=False)
    op.create_index(op.f('ix_agents_agent_key_hash'), 'agents', ['agent_key_hash'], unique=True)

    # 2. Create container_metrics table
    op.create_table(
        'container_metrics',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('agent_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('container_id', sa.String(length=128), nullable=False),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('image', sa.String(length=255), nullable=True),
        sa.Column('state', sa.String(length=32), nullable=False, server_default='unknown'),
        sa.Column('health_status', sa.String(length=32), nullable=True),
        sa.Column('cpu_percent', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('memory_bytes', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('memory_limit', sa.BigInteger(), nullable=False, server_default='0'),
        sa.Column('restart_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['agent_id'], ['agents.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_container_metrics_id'), 'container_metrics', ['id'], unique=False)
    op.create_index(op.f('ix_container_metrics_agent_id'), 'container_metrics', ['agent_id'], unique=False)
    op.create_index(op.f('ix_container_metrics_user_id'), 'container_metrics', ['user_id'], unique=False)
    op.create_index(op.f('ix_container_metrics_container_id'), 'container_metrics', ['container_id'], unique=False)
    op.create_index(op.f('ix_container_metrics_recorded_at'), 'container_metrics', ['recorded_at'], unique=False)
    op.create_index('ix_agent_container', 'container_metrics', ['agent_id', 'container_id'], unique=False)

def downgrade() -> None:
    op.drop_index('ix_agent_container', table_name='container_metrics')
    op.drop_index(op.f('ix_container_metrics_recorded_at'), table_name='container_metrics')
    op.drop_index(op.f('ix_container_metrics_container_id'), table_name='container_metrics')
    op.drop_index(op.f('ix_container_metrics_user_id'), table_name='container_metrics')
    op.drop_index(op.f('ix_container_metrics_agent_id'), table_name='container_metrics')
    op.drop_index(op.f('ix_container_metrics_id'), table_name='container_metrics')
    op.drop_table('container_metrics')

    op.drop_index(op.f('ix_agents_agent_key_hash'), table_name='agents')
    op.drop_index(op.f('ix_agents_user_id'), table_name='agents')
    op.drop_index(op.f('ix_agents_id'), table_name='agents')
    op.drop_table('agents')
