export type TeamMemberRole = 'owner' | 'admin' | 'member';

export interface TeamData {
  id: string;
  name: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateTeamData {
  name: string;
  owner_id: string;
}

export interface UpdateTeamData {
  name?: string;
}

export interface TeamMemberData {
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: Date;
}

export interface AddTeamMemberData {
  user_id: string;
  role?: TeamMemberRole;
}

export class Team {
  id: string;
  name: string;
  owner_id: string;
  created_at: Date;
  updated_at: Date;

  constructor(data: TeamData) {
    this.id = data.id;
    this.name = data.name;
    this.owner_id = data.owner_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Check if a user is the owner of this team
   */
  isOwner(userId: string): boolean {
    return this.owner_id === userId;
  }

  /**
   * Convert to JSON
   */
  toJSON(): TeamData {
    return {
      id: this.id,
      name: this.name,
      owner_id: this.owner_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}

export class TeamMember {
  team_id: string;
  user_id: string;
  role: TeamMemberRole;
  created_at: Date;

  constructor(data: TeamMemberData) {
    this.team_id = data.team_id;
    this.user_id = data.user_id;
    this.role = data.role;
    this.created_at = data.created_at;
  }

  /**
   * Check if this member is the owner
   */
  isOwner(): boolean {
    return this.role === 'owner';
  }

  /**
   * Check if this member is an admin or owner
   */
  isAdminOrOwner(): boolean {
    return this.role === 'owner' || this.role === 'admin';
  }

  /**
   * Check if this member can manage other members
   */
  canManageMembers(): boolean {
    return this.isAdminOrOwner();
  }

  /**
   * Check if this member can manage team settings
   */
  canManageTeam(): boolean {
    return this.isAdminOrOwner();
  }

  /**
   * Convert to JSON
   */
  toJSON(): TeamMemberData {
    return {
      team_id: this.team_id,
      user_id: this.user_id,
      role: this.role,
      created_at: this.created_at,
    };
  }
}
