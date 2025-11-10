import { useQuery, useMutation } from '@tanstack/react-query';
import signatureService, { type SignatureData } from '@/services/signatureService';

/**
 * Custom hooks for signature operations using TanStack Query
 */

export const useSigningSession = (token: string) => {
  return useQuery({
    queryKey: ['signing-session', token],
    queryFn: () => signatureService.getSession(token),
    enabled: !!token,
    retry: false, // Don't retry on invalid token
  });
};

export const useSubmitSignatures = () => {
  return useMutation({
    mutationFn: ({ token, signatures }: { token: string; signatures: SignatureData[] }) =>
      signatureService.submitSignatures(token, signatures),
  });
};
