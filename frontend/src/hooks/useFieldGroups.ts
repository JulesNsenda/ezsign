import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import fieldGroupService, {
  type CreateFieldGroupData,
  type UpdateFieldGroupData,
} from '@/services/fieldGroupService';

/**
 * Custom hooks for field group operations using TanStack Query
 */

export const useFieldGroups = (documentId: string, includeFieldCounts = false) => {
  return useQuery({
    queryKey: ['fieldGroups', documentId, includeFieldCounts],
    queryFn: () => fieldGroupService.list(documentId, includeFieldCounts),
    enabled: !!documentId,
  });
};

export const useFieldGroup = (documentId: string, groupId: string) => {
  return useQuery({
    queryKey: ['fieldGroups', documentId, groupId],
    queryFn: () => fieldGroupService.getById(documentId, groupId),
    enabled: !!documentId && !!groupId,
  });
};

export const useCreateFieldGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      data,
    }: {
      documentId: string;
      data: CreateFieldGroupData;
    }) => fieldGroupService.create(documentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldGroups', variables.documentId] });
    },
  });
};

export const useUpdateFieldGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      groupId,
      data,
    }: {
      documentId: string;
      groupId: string;
      data: UpdateFieldGroupData;
    }) => fieldGroupService.update(documentId, groupId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldGroups', variables.documentId],
      });
    },
  });
};

export const useDeleteFieldGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, groupId }: { documentId: string; groupId: string }) =>
      fieldGroupService.delete(documentId, groupId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldGroups', variables.documentId] });
      // Also invalidate fields since their group_id may have changed
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
    },
  });
};

export const useReorderFieldGroups = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      groupIds,
    }: {
      documentId: string;
      groupIds: string[];
    }) => fieldGroupService.reorderGroups(documentId, groupIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldGroups', variables.documentId] });
    },
  });
};

export const useAssignFieldsToGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      groupId,
      fieldIds,
    }: {
      documentId: string;
      groupId: string;
      fieldIds: string[];
    }) => fieldGroupService.assignFieldsToGroup(documentId, groupId, fieldIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
      queryClient.invalidateQueries({ queryKey: ['fieldGroups', variables.documentId] });
    },
  });
};

export const useUngroupFields = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      fieldIds,
    }: {
      documentId: string;
      fieldIds: string[];
    }) => fieldGroupService.ungroupFields(documentId, fieldIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
      queryClient.invalidateQueries({ queryKey: ['fieldGroups', variables.documentId] });
    },
  });
};

export const useReorderFieldsInGroup = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      groupId,
      fieldIds,
    }: {
      documentId: string;
      groupId: string;
      fieldIds: string[];
    }) => fieldGroupService.reorderFieldsInGroup(documentId, groupId, fieldIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fields', variables.documentId] });
    },
  });
};
