/**
 * Team Invitation Model
 */

export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'cancelled';
export type InvitationRole = 'admin' | 'member';

export interface TeamInvitationData {
  id: string;
  team_id: string;
  email: string;
  role: InvitationRole;
  token: string;
  invited_by: string;
  status: InvitationStatus;
  expires_at: Date;
  accepted_at?: Date | null;
  created_at: Date;
}

export interface CreateInvitationData {
  team_id: string;
  email: string;
  role?: InvitationRole;
  invited_by: string;
}

export class TeamInvitation {
  readonly id: string;
  readonly team_id: string;
  readonly email: string;
  readonly role: InvitationRole;
  readonly token: string;
  readonly invited_by: string;
  readonly status: InvitationStatus;
  readonly expires_at: Date;
  readonly accepted_at?: Date | null;
  readonly created_at: Date;

  constructor(data: TeamInvitationData) {
    this.id = data.id;
    this.team_id = data.team_id;
    this.email = data.email.toLowerCase();
    this.role = data.role;
    this.token = data.token;
    this.invited_by = data.invited_by;
    this.status = data.status;
    this.expires_at = data.expires_at instanceof Date ? data.expires_at : new Date(data.expires_at);
    this.accepted_at = data.accepted_at ? (data.accepted_at instanceof Date ? data.accepted_at : new Date(data.accepted_at)) : null;
    this.created_at = data.created_at instanceof Date ? data.created_at : new Date(data.created_at);
  }

  /**
   * Check if the invitation is still valid
   */
  isValid(): boolean {
    return this.status === 'pending' && !this.isExpired();
  }

  /**
   * Check if the invitation has expired
   */
  isExpired(): boolean {
    return new Date() > this.expires_at;
  }

  /**
   * Check if the invitation can be accepted
   */
  canAccept(): boolean {
    return this.isValid();
  }

  /**
   * Convert to JSON
   */
  toJSON(): TeamInvitationData {
    return {
      id: this.id,
      team_id: this.team_id,
      email: this.email,
      role: this.role,
      token: this.token,
      invited_by: this.invited_by,
      status: this.status,
      expires_at: this.expires_at,
      accepted_at: this.accepted_at,
      created_at: this.created_at,
    };
  }

  /**
   * Convert to public JSON (without sensitive token)
   */
  toPublicJSON(): Omit<TeamInvitationData, 'token'> {
    const { token, ...rest } = this.toJSON();
    return rest;
  }

  /**
   * Generate a secure random token
   */
  static generateToken(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Get default expiration date (7 days from now)
   */
  static getDefaultExpiration(): Date {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    return date;
  }
}
