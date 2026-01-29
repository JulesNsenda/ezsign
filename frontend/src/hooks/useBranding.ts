import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import brandingService, {
  type BrandingResponse,
  type LogoUploadResponse,
  type PublicBrandingResponse,
} from '@/services/brandingService';
import type { UpdateBrandingData, Branding } from '@/types';

/**
 * Custom hooks for branding operations using TanStack Query
 */

/**
 * Hook to get branding settings for a team
 */
export const useBranding = (teamId: string | undefined) => {
  return useQuery({
    queryKey: ['branding', teamId],
    queryFn: () => brandingService.getBranding(teamId!),
    enabled: !!teamId,
  });
};

/**
 * Hook to get public branding for signing pages
 */
export const usePublicBranding = (teamId: string | undefined) => {
  return useQuery<PublicBrandingResponse>({
    queryKey: ['publicBranding', teamId],
    queryFn: () => brandingService.getPublicBranding(teamId!),
    enabled: !!teamId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

/**
 * Hook to update branding settings
 */
export const useUpdateBranding = () => {
  const queryClient = useQueryClient();

  return useMutation<
    BrandingResponse,
    Error,
    { teamId: string; data: UpdateBrandingData }
  >({
    mutationFn: ({ teamId, data }) => brandingService.updateBranding(teamId, data),
    onSuccess: (_, variables) => {
      // Invalidate branding queries for this team
      queryClient.invalidateQueries({ queryKey: ['branding', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['publicBranding', variables.teamId] });
    },
  });
};

/**
 * Hook to upload a logo
 */
export const useUploadLogo = () => {
  const queryClient = useQueryClient();

  return useMutation<LogoUploadResponse, Error, { teamId: string; file: File }>({
    mutationFn: ({ teamId, file }) => brandingService.uploadLogo(teamId, file),
    onSuccess: (_, variables) => {
      // Invalidate branding queries for this team
      queryClient.invalidateQueries({ queryKey: ['branding', variables.teamId] });
      queryClient.invalidateQueries({ queryKey: ['publicBranding', variables.teamId] });
    },
  });
};

/**
 * Hook to delete a logo
 */
export const useDeleteLogo = () => {
  const queryClient = useQueryClient();

  return useMutation<{ message: string; branding: Branding }, Error, string>({
    mutationFn: (teamId) => brandingService.deleteLogo(teamId),
    onSuccess: (_, teamId) => {
      // Invalidate branding queries for this team
      queryClient.invalidateQueries({ queryKey: ['branding', teamId] });
      queryClient.invalidateQueries({ queryKey: ['publicBranding', teamId] });
    },
  });
};

/**
 * Hook to reset branding to defaults
 */
export const useResetBranding = () => {
  const queryClient = useQueryClient();

  return useMutation<{ message: string; branding: Branding }, Error, string>({
    mutationFn: (teamId) => brandingService.resetBranding(teamId),
    onSuccess: (_, teamId) => {
      // Invalidate branding queries for this team
      queryClient.invalidateQueries({ queryKey: ['branding', teamId] });
      queryClient.invalidateQueries({ queryKey: ['publicBranding', teamId] });
    },
  });
};
