import { Pool } from 'pg';
import {
  Team,
  TeamData,
  CreateTeamData,
  UpdateTeamData,
  TeamMember,
  TeamMemberData,
  AddTeamMemberData,
} from '@/models/Team';

export class TeamService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new team
   */
  async createTeam(data: CreateTeamData): Promise<Team> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Create team
      const teamQuery = `
        INSERT INTO teams (name, owner_id)
        VALUES ($1, $2)
        RETURNING id, name, owner_id, created_at, updated_at
      `;

      const teamResult = await client.query<TeamData>(teamQuery, [data.name, data.owner_id]);

      const team = new Team(teamResult.rows[0]);

      // Add owner as team member
      const memberQuery = `
        INSERT INTO team_members (team_id, user_id, role)
        VALUES ($1, $2, $3)
      `;

      await client.query(memberQuery, [team.id, data.owner_id, 'owner']);

      await client.query('COMMIT');

      return team;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find a team by ID
   */
  async findById(id: string): Promise<Team | null> {
    const query = `
      SELECT id, name, owner_id, created_at, updated_at
      FROM teams
      WHERE id = $1
    `;

    const result = await this.pool.query<TeamData>(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Team(result.rows[0]);
  }

  /**
   * Find all teams for a user (as member or owner)
   */
  async findByUserId(userId: string): Promise<Team[]> {
    const query = `
      SELECT DISTINCT t.id, t.name, t.owner_id, t.created_at, t.updated_at
      FROM teams t
      INNER JOIN team_members tm ON t.id = tm.team_id
      WHERE tm.user_id = $1
      ORDER BY t.created_at DESC
    `;

    const result = await this.pool.query<TeamData>(query, [userId]);

    return result.rows.map((row) => new Team(row));
  }

  /**
   * Find teams owned by a user
   */
  async findOwnedByUserId(userId: string): Promise<Team[]> {
    const query = `
      SELECT id, name, owner_id, created_at, updated_at
      FROM teams
      WHERE owner_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query<TeamData>(query, [userId]);

    return result.rows.map((row) => new Team(row));
  }

  /**
   * Update a team
   */
  async updateTeam(id: string, data: UpdateTeamData): Promise<Team | null> {
    if (!data.name) {
      return this.findById(id);
    }

    const query = `
      UPDATE teams
      SET name = $1
      WHERE id = $2
      RETURNING id, name, owner_id, created_at, updated_at
    `;

    const result = await this.pool.query<TeamData>(query, [data.name, id]);

    if (result.rows.length === 0) {
      return null;
    }

    return new Team(result.rows[0]);
  }

  /**
   * Delete a team
   */
  async deleteTeam(id: string): Promise<boolean> {
    const query = `
      DELETE FROM teams
      WHERE id = $1
    `;

    const result = await this.pool.query(query, [id]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Add a member to a team
   */
  async addMember(teamId: string, data: AddTeamMemberData): Promise<TeamMember> {
    const role = data.role || 'member';

    const query = `
      INSERT INTO team_members (team_id, user_id, role)
      VALUES ($1, $2, $3)
      RETURNING team_id, user_id, role, created_at
    `;

    const result = await this.pool.query<TeamMemberData>(query, [teamId, data.user_id, role]);

    return new TeamMember(result.rows[0]);
  }

  /**
   * Remove a member from a team
   */
  async removeMember(teamId: string, userId: string): Promise<boolean> {
    const query = `
      DELETE FROM team_members
      WHERE team_id = $1 AND user_id = $2
    `;

    const result = await this.pool.query(query, [teamId, userId]);

    return result.rowCount !== null && result.rowCount > 0;
  }

  /**
   * Get all members of a team
   */
  async getMembers(teamId: string): Promise<TeamMember[]> {
    const query = `
      SELECT team_id, user_id, role, created_at
      FROM team_members
      WHERE team_id = $1
      ORDER BY created_at ASC
    `;

    const result = await this.pool.query<TeamMemberData>(query, [teamId]);

    return result.rows.map((row) => new TeamMember(row));
  }

  /**
   * Get a specific team member
   */
  async getMember(teamId: string, userId: string): Promise<TeamMember | null> {
    const query = `
      SELECT team_id, user_id, role, created_at
      FROM team_members
      WHERE team_id = $1 AND user_id = $2
    `;

    const result = await this.pool.query<TeamMemberData>(query, [teamId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new TeamMember(result.rows[0]);
  }

  /**
   * Update a team member's role
   */
  async updateMemberRole(
    teamId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member',
  ): Promise<TeamMember | null> {
    const query = `
      UPDATE team_members
      SET role = $1
      WHERE team_id = $2 AND user_id = $3
      RETURNING team_id, user_id, role, created_at
    `;

    const result = await this.pool.query<TeamMemberData>(query, [role, teamId, userId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new TeamMember(result.rows[0]);
  }

  /**
   * Check if a user is a member of a team
   */
  async isMember(teamId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT 1
      FROM team_members
      WHERE team_id = $1 AND user_id = $2
    `;

    const result = await this.pool.query(query, [teamId, userId]);

    return result.rows.length > 0;
  }

  /**
   * Check if a user is an admin or owner of a team
   */
  async isAdminOrOwner(teamId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT role
      FROM team_members
      WHERE team_id = $1 AND user_id = $2
    `;

    const result = await this.pool.query<{ role: string }>(query, [teamId, userId]);

    if (result.rows.length === 0) {
      return false;
    }

    const role = result.rows[0].role;
    return role === 'owner' || role === 'admin';
  }
}
