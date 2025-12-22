import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import documentService, {
  type CreateDocumentData,
  type ListDocumentsParams,
  type UpdateDocumentData,
  type ScheduleDocumentData,
} from '@/services/documentService';

/**
 * Custom hook for document operations using TanStack Query
 */

export const useDocuments = (params?: ListDocumentsParams) => {
  return useQuery({
    queryKey: ['documents', params],
    queryFn: () => documentService.list(params),
  });
};

export const useDocument = (id: string) => {
  return useQuery({
    queryKey: ['documents', id],
    queryFn: () => documentService.getById(id),
    enabled: !!id,
  });
};

export const useUploadDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, data }: { file: File; data: CreateDocumentData }) =>
      documentService.upload(file, data),
    onSuccess: () => {
      // Invalidate and refetch documents list
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useUpdateDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateDocumentData }) =>
      documentService.update(id, data),
    onSuccess: (_, variables) => {
      // Invalidate specific document and list
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useDeleteDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => documentService.delete(id),
    onSuccess: () => {
      // Invalidate documents list
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useDownloadDocument = () => {
  return useMutation({
    mutationFn: async (id: string) => {
      const blob = await documentService.download(id);
      const doc = await documentService.getById(id);

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = doc.original_filename;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });
};

export const useScheduleDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ScheduleDocumentData }) =>
      documentService.schedule(id, data),
    onSuccess: (_, variables) => {
      // Invalidate specific document and list
      queryClient.invalidateQueries({ queryKey: ['documents', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useCancelSchedule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => documentService.cancelSchedule(id),
    onSuccess: (_, id) => {
      // Invalidate specific document and list
      queryClient.invalidateQueries({ queryKey: ['documents', id] });
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};

export const useScheduleStatus = (id: string) => {
  return useQuery({
    queryKey: ['documents', id, 'schedule'],
    queryFn: () => documentService.getScheduleStatus(id),
    enabled: !!id,
  });
};
