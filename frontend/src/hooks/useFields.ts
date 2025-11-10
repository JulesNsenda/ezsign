import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import fieldService, { type CreateFieldData, type UpdateFieldData } from '@/services/fieldService';

/**
 * Custom hooks for field operations using TanStack Query
 */

export const useFields = (documentId: string) => {
  return useQuery({
    queryKey: ['fields', documentId],
    queryFn: () => fieldService.list(documentId),
    enabled: !!documentId,
  });
};

export const useField = (documentId: string, fieldId: string) => {
  return useQuery({
    queryKey: ['fields', documentId, fieldId],
    queryFn: () => fieldService.getById(documentId, fieldId),
    enabled: !!documentId && !!fieldId,
  });
};

export const useCreateField = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, data }: { documentId: string; data: CreateFieldData }) =>
      fieldService.create(documentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
    },
  });
};

export const useUpdateField = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      fieldId,
      data,
    }: {
      documentId: string;
      fieldId: string;
      data: UpdateFieldData;
    }) => fieldService.update(documentId, fieldId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fields', variables.documentId, variables.fieldId],
      });
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
    },
  });
};

export const useDeleteField = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, fieldId }: { documentId: string; fieldId: string }) =>
      fieldService.delete(documentId, fieldId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
    },
  });
};
