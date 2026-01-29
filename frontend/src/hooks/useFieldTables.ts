import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import fieldTableService from '@/services/fieldTableService';
import type {
  CreateFieldTableData,
  UpdateFieldTableData,
  TableColumn,
  TableRowValues,
} from '@/types';

/**
 * Custom hooks for field table operations using TanStack Query
 */

export const useFieldTables = (documentId: string) => {
  return useQuery({
    queryKey: ['fieldTables', documentId],
    queryFn: () => fieldTableService.list(documentId),
    enabled: !!documentId,
  });
};

export const useFieldTable = (documentId: string, tableId: string) => {
  return useQuery({
    queryKey: ['fieldTables', documentId, tableId],
    queryFn: () => fieldTableService.getById(documentId, tableId),
    enabled: !!documentId && !!tableId,
  });
};

export const useCreateFieldTable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      data,
    }: {
      documentId: string;
      data: CreateFieldTableData;
    }) => fieldTableService.create(documentId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useUpdateFieldTable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      data,
    }: {
      documentId: string;
      tableId: string;
      data: UpdateFieldTableData;
    }) => fieldTableService.update(documentId, tableId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId],
      });
    },
  });
};

export const useDeleteFieldTable = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ documentId, tableId }: { documentId: string; tableId: string }) =>
      fieldTableService.delete(documentId, tableId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

// Row operation hooks

export const useAddTableRow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      values,
    }: {
      documentId: string;
      tableId: string;
      values?: TableRowValues;
    }) => fieldTableService.addRow(documentId, tableId, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useUpdateTableRow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      rowId,
      values,
    }: {
      documentId: string;
      tableId: string;
      rowId: string;
      values: TableRowValues;
    }) => fieldTableService.updateRow(documentId, tableId, rowId, values),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useUpdateTableCell = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      rowId,
      columnId,
      value,
    }: {
      documentId: string;
      tableId: string;
      rowId: string;
      columnId: string;
      value: string | number | boolean | null;
    }) => fieldTableService.updateCell(documentId, tableId, rowId, columnId, value),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useDeleteTableRow = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      rowId,
    }: {
      documentId: string;
      tableId: string;
      rowId: string;
    }) => fieldTableService.deleteRow(documentId, tableId, rowId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useReorderTableRows = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      rowIds,
    }: {
      documentId: string;
      tableId: string;
      rowIds: string[];
    }) => fieldTableService.reorderRows(documentId, tableId, rowIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

// Column operation hooks

export const useAddTableColumn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      column,
    }: {
      documentId: string;
      tableId: string;
      column: Omit<TableColumn, 'id'>;
    }) => fieldTableService.addColumn(documentId, tableId, column),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useUpdateTableColumn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      columnId,
      data,
    }: {
      documentId: string;
      tableId: string;
      columnId: string;
      data: Partial<Omit<TableColumn, 'id'>>;
    }) => fieldTableService.updateColumn(documentId, tableId, columnId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useDeleteTableColumn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      columnId,
    }: {
      documentId: string;
      tableId: string;
      columnId: string;
    }) => fieldTableService.deleteColumn(documentId, tableId, columnId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};

export const useReorderTableColumns = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      documentId,
      tableId,
      columnIds,
    }: {
      documentId: string;
      tableId: string;
      columnIds: string[];
    }) => fieldTableService.reorderColumns(documentId, tableId, columnIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['fieldTables', variables.documentId, variables.tableId],
      });
      queryClient.invalidateQueries({ queryKey: ['fieldTables', variables.documentId] });
    },
  });
};
