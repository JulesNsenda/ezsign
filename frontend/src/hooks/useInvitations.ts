/**
 * React hooks for invitation management
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { invitationService } from '@/services/invitationService';
import type { Invitation, CreateInvitationData, InvitationDetails } from '@/services/invitationService';

/**
 * Hook to fetch invitations for a team
 */
export function useTeamInvitations(teamId: string | null) {
  return useQuery<Invitation[]>({
    queryKey: ['teams', teamId, 'invitations'],
    queryFn: () => invitationService.getTeamInvitations(teamId!),
    enabled: !!teamId,
  });
}

/**
 * Hook to create an invitation
 */
export function useCreateInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, data }: { teamId: string; data: CreateInvitationData }) =>
      invitationService.createInvitation(teamId, data),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'invitations'] });
    },
  });
}

/**
 * Hook to cancel an invitation
 */
export function useCancelInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, invitationId }: { teamId: string; invitationId: string }) =>
      invitationService.cancelInvitation(teamId, invitationId),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'invitations'] });
    },
  });
}

/**
 * Hook to resend an invitation
 */
export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ teamId, invitationId }: { teamId: string; invitationId: string }) =>
      invitationService.resendInvitation(teamId, invitationId),
    onSuccess: (_, { teamId }) => {
      queryClient.invalidateQueries({ queryKey: ['teams', teamId, 'invitations'] });
    },
  });
}

/**
 * Hook to get invitation details by token
 */
export function useInvitationByToken(token: string | null) {
  return useQuery<InvitationDetails>({
    queryKey: ['invitations', token],
    queryFn: () => invitationService.getInvitationByToken(token!),
    enabled: !!token,
    retry: false,
  });
}

/**
 * Hook to accept an invitation
 */
export function useAcceptInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (token: string) => invitationService.acceptInvitation(token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

/**
 * Hook to get pending invitations for current user
 */
export function usePendingInvitations() {
  return useQuery<Invitation[]>({
    queryKey: ['invitations', 'pending'],
    queryFn: invitationService.getPendingInvitations,
  });
}

export default {
  useTeamInvitations,
  useCreateInvitation,
  useCancelInvitation,
  useResendInvitation,
  useInvitationByToken,
  useAcceptInvitation,
  usePendingInvitations,
};
