/**
 * Invitation service for API calls
 */
import apiClient from '@/api/client';

export interface Invitation {
  id: string;
  team_id: string;
  email: string;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  expires_at: string;
  accepted_at?: string | null;
  created_at: string;
  team?: {
    id: string;
    name: string;
  };
}

export interface CreateInvitationData {
  email: string;
  role?: 'admin' | 'member';
}

export interface InvitationDetails {
  invitation: {
    id: string;
    email: string;
    role: string;
    status: string;
    expires_at: string;
    is_valid: boolean;
    is_expired: boolean;
  };
  team: {
    id: string;
    name: string;
  } | null;
}

export const invitationService = {
  /**
   * Create a new invitation for a team
   */
  createInvitation: async (teamId: string, data: CreateInvitationData): Promise<Invitation> => {
    const response = await apiClient.post(`/teams/${teamId}/invitations`, data);
    return response.data.invitation;
  },

  /**
   * Get all invitations for a team
   */
  getTeamInvitations: async (teamId: string): Promise<Invitation[]> => {
    const response = await apiClient.get(`/teams/${teamId}/invitations`);
    return response.data.invitations || [];
  },

  /**
   * Cancel/delete an invitation
   */
  cancelInvitation: async (teamId: string, invitationId: string): Promise<void> => {
    await apiClient.delete(`/teams/${teamId}/invitations/${invitationId}`);
  },

  /**
   * Resend an invitation
   */
  resendInvitation: async (teamId: string, invitationId: string): Promise<Invitation> => {
    const response = await apiClient.post(`/teams/${teamId}/invitations/${invitationId}/resend`);
    return response.data.invitation;
  },

  /**
   * Get invitation details by token (public)
   */
  getInvitationByToken: async (token: string): Promise<InvitationDetails> => {
    const response = await apiClient.get(`/invitations/${token}`);
    return response.data;
  },

  /**
   * Accept an invitation
   */
  acceptInvitation: async (token: string): Promise<{ team: { id: string; name: string } }> => {
    const response = await apiClient.post(`/invitations/${token}/accept`);
    return response.data;
  },

  /**
   * Get pending invitations for current user
   */
  getPendingInvitations: async (): Promise<Invitation[]> => {
    const response = await apiClient.get('/invitations');
    return response.data.invitations || [];
  },
};

export default invitationService;
