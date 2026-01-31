/**
 * Team Invitation Service
 */
import { Pool } from 'pg';
import {
  TeamInvitation,
  TeamInvitationData,
  CreateInvitationData,
  InvitationStatus,
} from '@/models/TeamInvitation';

export class InvitationService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new invitation
   */
  async create(data: CreateInvitationData): Promise<TeamInvitation> {
    const token = TeamInvitation.generateToken();
    const expiresAt = TeamInvitation.getDefaultExpiration();
    const role = data.role || 'member';

    const query = `
      INSERT INTO team_invitations (team_id, email, role, token, invited_by, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [
      data.team_id,
      data.email.toLowerCase(),
      role,
      token,
      data.invited_by,
      expiresAt,
    ]);

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to create invitation');
    }
    return new TeamInvitation(row);
  }

  /**
   * Find an invitation by token
   */
  async findByToken(token: string): Promise<TeamInvitation | null> {
    const query = `
      SELECT id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
      FROM team_invitations
      WHERE token = $1
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [token]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new TeamInvitation(row);
  }

  /**
   * Find an invitation by ID
   */
  async findById(id: string): Promise<TeamInvitation | null> {
    const query = `
      SELECT id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
      FROM team_invitations
      WHERE id = $1
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [id]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new TeamInvitation(row);
  }

  /**
   * Find pending invitation by team and email
   */
  async findPendingByTeamAndEmail(teamId: string, email: string): Promise<TeamInvitation | null> {
    const query = `
      SELECT id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
      FROM team_invitations
      WHERE team_id = $1 AND email = $2 AND status = 'pending'
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [teamId, email.toLowerCase()]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new TeamInvitation(row);
  }

  /**
   * Get all invitations for a team
   */
  async findByTeamId(teamId: string): Promise<TeamInvitation[]> {
    const query = `
      SELECT id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
      FROM team_invitations
      WHERE team_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [teamId]);

    return result.rows.map((row) => new TeamInvitation(row));
  }

  /**
   * Get pending invitations for an email
   */
  async findPendingByEmail(email: string): Promise<TeamInvitation[]> {
    const query = `
      SELECT id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
      FROM team_invitations
      WHERE email = $1 AND status = 'pending' AND expires_at > NOW()
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [email.toLowerCase()]);

    return result.rows.map((row) => new TeamInvitation(row));
  }

  /**
   * Update invitation status
   */
  async updateStatus(id: string, status: InvitationStatus): Promise<TeamInvitation | null> {
    const acceptedAt = status === 'accepted' ? new Date() : null;

    const query = `
      UPDATE team_invitations
      SET status = $2, accepted_at = $3
      WHERE id = $1
      RETURNING id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [id, status, acceptedAt]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new TeamInvitation(row);
  }

  /**
   * Accept an invitation and add user to team
   */
  async accept(token: string, userId: string): Promise<{ invitation: TeamInvitation; success: boolean }> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Find the invitation
      const invQuery = `
        SELECT id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
        FROM team_invitations
        WHERE token = $1
        FOR UPDATE
      `;
      const invResult = await client.query<TeamInvitationData>(invQuery, [token]);

      const invRow = invResult.rows[0];
      if (!invRow) {
        await client.query('ROLLBACK');
        throw new Error('Invitation not found');
      }

      const invitation = new TeamInvitation(invRow);

      if (!invitation.canAccept()) {
        await client.query('ROLLBACK');
        if (invitation.isExpired()) {
          throw new Error('Invitation has expired');
        }
        throw new Error('Invitation is no longer valid');
      }

      // Check if user is already a member
      const memberCheckQuery = `
        SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2
      `;
      const memberCheck = await client.query(memberCheckQuery, [invitation.team_id, userId]);

      if (memberCheck.rows.length > 0) {
        // Already a member, just mark invitation as accepted
        await client.query(
          'UPDATE team_invitations SET status = $1, accepted_at = NOW() WHERE id = $2',
          ['accepted', invitation.id]
        );
        await client.query('COMMIT');
        return { invitation, success: true };
      }

      // Add user to team
      const addMemberQuery = `
        INSERT INTO team_members (team_id, user_id, role)
        VALUES ($1, $2, $3)
      `;
      await client.query(addMemberQuery, [invitation.team_id, userId, invitation.role]);

      // Update invitation status
      const updateQuery = `
        UPDATE team_invitations
        SET status = 'accepted', accepted_at = NOW()
        WHERE id = $1
        RETURNING id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
      `;
      const updateResult = await client.query<TeamInvitationData>(updateQuery, [invitation.id]);

      await client.query('COMMIT');

      const updatedRow = updateResult.rows[0];
      if (!updatedRow) {
        throw new Error('Failed to update invitation');
      }

      return {
        invitation: new TeamInvitation(updatedRow),
        success: true,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel an invitation
   */
  async cancel(id: string): Promise<TeamInvitation | null> {
    return this.updateStatus(id, 'cancelled');
  }

  /**
   * Delete an invitation
   */
  async delete(id: string): Promise<boolean> {
    const query = 'DELETE FROM team_invitations WHERE id = $1';
    const result = await this.pool.query(query, [id]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Resend an invitation (creates new token and extends expiration)
   */
  async resend(id: string): Promise<TeamInvitation | null> {
    const token = TeamInvitation.generateToken();
    const expiresAt = TeamInvitation.getDefaultExpiration();

    const query = `
      UPDATE team_invitations
      SET token = $2, expires_at = $3, status = 'pending', accepted_at = NULL
      WHERE id = $1
      RETURNING id, team_id, email, role, token, invited_by, status, expires_at, accepted_at, created_at
    `;

    const result = await this.pool.query<TeamInvitationData>(query, [id, token, expiresAt]);

    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return new TeamInvitation(row);
  }
}
