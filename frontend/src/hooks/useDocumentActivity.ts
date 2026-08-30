import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import activityService from '@/services/activityService';
import signerService from '@/services/signerService';

/**
 * Hooks for the document activity timeline.
 */

export const useDocumentActivity = (documentId: string, page = 1, pageSize = 20) => {
  return useQuery({
    queryKey: ['document-activity', documentId, page, pageSize],
    queryFn: () => activityService.getDocumentActivity(documentId, page, pageSize),
    enabled: !!documentId,
  });
};

/**
 * Resends the signing email for one signer, then refreshes the timeline.
 *
 * The point of putting this behind the activity view is that someone looking
 * at a failed send wants to fix it, not just read about it - so the new
 * attempt, success or failure, has to show up in the same list they are
 * looking at. Invalidating by document id (rather than the exact page key)
 * refreshes whichever page they are on.
 */
export const useResendSignerEmail = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, signerId }: { documentId: string; signerId: string }) =>
      signerService.resend(documentId, signerId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['document-activity', variables.documentId] });
      queryClient.invalidateQueries({ queryKey: ['signers', variables.documentId] });
    },
  });
};
