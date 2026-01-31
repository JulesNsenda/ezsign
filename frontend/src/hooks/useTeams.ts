/**
 * React hooks for team management
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamService } from '@/services/teamService';
import type { Team } from '@/types';
import type {
  TeamMember,
  CreateTeamData,
  UpdateTeamData,
  AddMemberData,
  UpdateMemberData,
} from '@/services/teamService';

/**
 * Hook to fetch all teams for the current user
 */
export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: teamService.getTeams,
  });
}

/**
 * Hook to fetch a specific team
 */
export function useTeam(teamId: string | null) {
  return useQuery<Team>({
    queryKey: ['teams', teamId],
    queryFn: () => teamService.getTeam(teamId!),
    enabled: !!teamId,
  });
}

/**
 * Hook to create a new team
 */
export function useCreateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTeamData) => teamService.createTeam(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

/**
 * Hook to update a team
 */
export function useUpdateTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: UpdateTeamData }) =>
      teamService.updateTeam(teamId, data),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['teams', teamId] });
    },
  });
}

/**
 * Hook to delete a team
 */
export function useDeleteTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (teamId: string) => teamService.deleteTeam(teamId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

/**
 * Hook to fetch team members
 */
export function useTeamMembers(teamId: string | null) {
  return useQuery<TeamMember[]>({
    queryKey: ['teams', teamId, 'members'],
    queryFn: () => teamService.getMembers(teamId!),
    enabled: !!teamId,
  });
}

/**
 * Hook to add a member to a team
 */
export function useAddTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: AddMemberData }) =>
      teamService.addMember(teamId, data),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    },
  });
}

/**
 * Hook to update a team member's role
 */
export function useUpdateTeamMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      teamId,
      userId,
      data,
    }: {
      teamId: string;
      userId: string;
      data: UpdateMemberData;
    }) => teamService.updateMemberRole(teamId, userId, data),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    },
  });
}

/**
 * Hook to remove a member from a team
 */
export function useRemoveTeamMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, userId }: { teamId: string; userId: string }) =>
      teamService.removeMember(teamId, userId),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'members'] });
    },
  });
}

export default {
  useTeams,
  useTeam,
  useCreateTeam,
  useUpdateTeam,
  useDeleteTeam,
  useTeamMembers,
  useAddTeamMember,
  useUpdateTeamMemberRole,
  useRemoveTeamMember,
};
