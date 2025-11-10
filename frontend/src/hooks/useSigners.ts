import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import signerService, {
  type CreateSignerData,
  type UpdateSignerData,
} from '@/services/signerService';

/**
 * Custom hooks for signer operations using TanStack Query
 */

export const useSigners = (documentId: string) => {
  return useQuery({
    queryKey: ['signers', documentId],
    queryFn: () => signerService.list(documentId),
    enabled: !!documentId,
  });
};

export const useSigner = (documentId: string, signerId: string) => {
  return useQuery({
    queryKey: ['signers', documentId, signerId],
    queryFn: () => signerService.getById(documentId, signerId),
    enabled: !!documentId && !!signerId,
  });
};

export const useCreateSigner = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      data,
    }: {
      documentId: string;
      data: CreateSignerData;
    }) => signerService.create(documentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['signers', variables.documentId] });
    },
  });
};

export const useUpdateSigner = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      signerId,
      data,
    }: {
      documentId: string;
      signerId: string;
      data: UpdateSignerData;
    }) => signerService.update(documentId, signerId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['signers', variables.documentId, variables.signerId],
      });
      queryClient.invalidateQueries({ queryKey: ['signers', variables.documentId] });
    },
  });
};

export const useDeleteSigner = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, signerId }: { documentId: string; signerId: string }) =>
      signerService.delete(documentId, signerId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['signers', variables.documentId] });
    },
  });
};

export const useSendDocument = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (documentId: string) => signerService.send(documentId),
    onSuccess: (_, documentId) => {
      queryClient.invalidateQueries({ queryKey: ['documents', documentId] });
      queryClient.invalidateQueries({ queryKey: ['signers', documentId] });
    },
  });
};

export const useResendToSigner = () => {
  return useMutation({
    mutationFn: ({ documentId, signerId }: { documentId: string; signerId: string }) =>
      signerService.resend(documentId, signerId),
  });
};
