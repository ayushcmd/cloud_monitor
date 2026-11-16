"""Persist bounded container samples separately from the latest inventory."""
from alembic import op
import sqlalchemy as sa
revision = '004_container_history'
down_revision = '003_os_and_version'
branch_labels = None
depends_on = None

def upgrade():
    with op.batch_alter_table('container_metrics') as batch:
        batch.alter_column('cpu_percent', existing_type=sa.Float(), nullable=True)
        batch.alter_column('memory_bytes', existing_type=sa.BigInteger(), nullable=True)
        batch.alter_column('memory_limit', existing_type=sa.BigInteger(), nullable=True)
    op.create_table('container_metric_samples',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('agent_id', sa.Integer(), sa.ForeignKey('agents.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('container_id', sa.String(128), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('cpu_percent', sa.Float()), sa.Column('memory_bytes', sa.BigInteger()),
        sa.Column('memory_limit', sa.BigInteger()), sa.Column('network_rx_bytes', sa.BigInteger()),
        sa.Column('network_tx_bytes', sa.BigInteger()), sa.Column('block_read_bytes', sa.BigInteger()),
        sa.Column('block_write_bytes', sa.BigInteger()), sa.Column('restart_count', sa.Integer(), nullable=False),
        sa.Column('state', sa.String(32), nullable=False), sa.Column('health_status', sa.String(32)),
        sa.UniqueConstraint('agent_id','container_id','recorded_at', name='uq_sample_identity'))
    op.create_index('ix_sample_tenant_agent_container_time','container_metric_samples', ['user_id','agent_id','container_id','recorded_at'])
    op.create_index('ix_sample_recorded_at','container_metric_samples',['recorded_at'])

def downgrade():
    op.drop_index('ix_sample_recorded_at', table_name='container_metric_samples')
    op.drop_index('ix_sample_tenant_agent_container_time', table_name='container_metric_samples')
    op.drop_table('container_metric_samples')
    op.execute("UPDATE container_metrics SET cpu_percent = 0 WHERE cpu_percent IS NULL")
    op.execute("UPDATE container_metrics SET memory_bytes = 0 WHERE memory_bytes IS NULL")
    op.execute("UPDATE container_metrics SET memory_limit = 0 WHERE memory_limit IS NULL")
    with op.batch_alter_table('container_metrics') as batch:
        batch.alter_column('cpu_percent', existing_type=sa.Float(), nullable=False, server_default='0')
        batch.alter_column('memory_bytes', existing_type=sa.BigInteger(), nullable=False, server_default='0')
        batch.alter_column('memory_limit', existing_type=sa.BigInteger(), nullable=False, server_default='0')
