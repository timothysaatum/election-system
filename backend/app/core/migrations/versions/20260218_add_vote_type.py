"""add_vote_type

Revision ID: 20260218_add_vote_type
Revises: 64b04121fdcd
Create Date: 2026-02-18 04:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260218_add_vote_type'
down_revision = '64b04121fdcd'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add vote_type column to votes table
    op.add_column('votes', sa.Column('vote_type', sa.String(length=50), nullable=False, server_default='endorsed'))
    # Create index for vote_type for better query performance
    op.create_index(op.f('ix_votes_vote_type'), 'votes', ['vote_type'], unique=False)


def downgrade() -> None:
    # Remove the index
    op.drop_index(op.f('ix_votes_vote_type'), table_name='votes')
    # Remove the vote_type column
    op.drop_column('votes', 'vote_type')
