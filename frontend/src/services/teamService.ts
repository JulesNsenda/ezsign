/**
 * Team service for API calls
 */
import apiClient from '@/api/client';
import type { Team } from '@/types';

export interface TeamMember {
  user_id: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export interface CreateTeamData {
  name: string;
}

export interface UpdateTeamData {
  name: string;
}

export interface AddMemberData {
  email: string;
  role: 'admin' | 'member';
}

export interface UpdateMemberData {
  role: 'admin' | 'member';
}

export const teamService = {
  /**
   * Get all teams for the current user
   */
  getTeams: async (): Promise<Team[]> => {
    const response = await apiClient.get('/teams');
    return response.data.teams || [];
  },

  /**
   * Get a specific team by ID
   */
  getTeam: async (teamId: string): Promise<Team> => {
    const response = await apiClient.get(`/teams/${teamId}`);
    return response.data.team;
  },

  /**
   * Create a new team
   */
  createTeam: async (data: CreateTeamData): Promise<Team> => {
    const response = await apiClient.post('/teams', data);
    return response.data.team;
  },

  /**
   * Update a team
   */
  updateTeam: async (teamId: string, data: UpdateTeamData): Promise<Team> => {
    const response = await apiClient.put(`/teams/${teamId}`, data);
    return response.data.team;
  },

  /**
   * Delete a team
   */
  deleteTeam: async (teamId: string): Promise<void> => {
    await apiClient.delete(`/teams/${teamId}`);
  },

  /**
   * Get team members
   */
  getMembers: async (teamId: string): Promise<TeamMember[]> => {
    const response = await apiClient.get(`/teams/${teamId}/members`);
    return response.data.members || [];
  },

  /**
   * Add a member to a team
   */
  addMember: async (teamId: string, data: AddMemberData): Promise<TeamMember> => {
    const response = await apiClient.post(`/teams/${teamId}/members`, data);
    return response.data.member;
  },

  /**
   * Update a team member's role
   */
  updateMemberRole: async (
    teamId: string,
    userId: string,
    data: UpdateMemberData
  ): Promise<TeamMember> => {
    const response = await apiClient.put(`/teams/${teamId}/members/${userId}`, data);
    return response.data.member;
  },

  /**
   * Remove a member from a team
   */
  removeMember: async (teamId: string, userId: string): Promise<void> => {
    await apiClient.delete(`/teams/${teamId}/members/${userId}`);
  },
};

export default teamService;
