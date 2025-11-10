import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import templateService, {
  type CreateTemplateData,
  type UpdateTemplateData,
  type ListTemplatesParams,
} from '@/services/templateService';

/**
 * Custom hooks for template operations using TanStack Query
 */

export const useTemplates = (params?: ListTemplatesParams) => {
  return useQuery({
    queryKey: ['templates', params],
    queryFn: () => templateService.list(params),
  });
};

export const useTemplate = (id: string) => {
  return useQuery({
    queryKey: ['templates', id],
    queryFn: () => templateService.getById(id),
    enabled: !!id,
  });
};

export const useCreateTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTemplateData) => templateService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
};

export const useUpdateTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateTemplateData }) =>
      templateService.update(id, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['templates', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
};

export const useDeleteTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => templateService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });
};

export const useCreateDocumentFromTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ templateId, title }: { templateId: string; title: string }) =>
      templateService.createDocument(templateId, title),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
  });
};
