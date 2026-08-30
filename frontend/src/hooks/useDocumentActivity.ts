import { useQuery } from '@tanstack/react-query';
import activityService from '@/services/activityService';

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
