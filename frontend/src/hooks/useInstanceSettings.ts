import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import instanceSettingsService, {
  type InstanceSettingsData,
  type SettingEntry,
  type TestEmailResult,
} from '@/services/instanceSettingsService';

/**
 * Custom hooks for admin instance settings using TanStack Query.
 */

export const INSTANCE_SETTINGS_QUERY_KEY = ['instanceSettings'];

/**
 * Hook to get instance settings (admin-only).
 */
export const useInstanceSettings = () => {
  return useQuery<InstanceSettingsData>({
    queryKey: INSTANCE_SETTINGS_QUERY_KEY,
    queryFn: () => instanceSettingsService.getSettings(),
  });
};

/**
 * Hook to update instance settings.
 */
export const useUpdateInstanceSettings = () => {
  const queryClient = useQueryClient();

  return useMutation<InstanceSettingsData, Error, SettingEntry[]>({
    mutationFn: (entries) => instanceSettingsService.updateSettings(entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: INSTANCE_SETTINGS_QUERY_KEY });
    },
  });
};

/**
 * Hook to send a test email using the current effective SMTP config.
 */
export const useSendTestEmail = () => {
  return useMutation<TestEmailResult, Error>({
    mutationFn: () => instanceSettingsService.sendTestEmail(),
  });
};
