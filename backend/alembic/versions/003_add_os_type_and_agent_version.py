"""add os_type and agent_version to agents table

Revision ID: 003_os_and_version
Revises: 002_agents_metrics
Create Date: 2026-10-27 08:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '003_os_and_version'
down_revision: Union[str, None] = '002_agents_metrics'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('agents', sa.Column('os_type', sa.String(length=32), nullable=False, server_default='linux'))
    op.add_column('agents', sa.Column('agent_version', sa.String(length=32), nullable=True))

def downgrade() -> None:
    op.drop_column('agents', 'agent_version')
    op.drop_column('agents', 'os_type')
