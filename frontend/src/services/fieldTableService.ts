import apiClient from '@/api/client';
import type {
  FieldTable,
  TableRow,
  TableColumn,
  TableRowValues,
  CreateFieldTableData,
  UpdateFieldTableData,
} from '@/types';

/**
 * Field Table service
 * Handles all field table-related API calls
 */

export const fieldTableService = {
  /**
   * List all tables for a document
   */
  async list(documentId: string): Promise<FieldTable[]> {
    const response = await apiClient.get<{ success: boolean; data: FieldTable[] }>(
      `/documents/${documentId}/tables`
    );
    return response.data.data || [];
  },

  /**
   * Get a single table by ID
   */
  async getById(documentId: string, tableId: string): Promise<FieldTable> {
    const response = await apiClient.get<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}`
    );
    return response.data.data;
  },

  /**
   * Create a new table
   */
  async create(documentId: string, data: CreateFieldTableData): Promise<FieldTable> {
    const response = await apiClient.post<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables`,
      data
    );
    return response.data.data;
  },

  /**
   * Update a table
   */
  async update(
    documentId: string,
    tableId: string,
    data: UpdateFieldTableData
  ): Promise<FieldTable> {
    const response = await apiClient.put<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a table
   */
  async delete(documentId: string, tableId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/tables/${tableId}`);
  },

  // Row operations

  /**
   * Add a row to a table
   */
  async addRow(
    documentId: string,
    tableId: string,
    values?: TableRowValues
  ): Promise<TableRow> {
    const response = await apiClient.post<{ success: boolean; data: TableRow }>(
      `/documents/${documentId}/tables/${tableId}/rows`,
      { values }
    );
    return response.data.data;
  },

  /**
   * Update row values
   */
  async updateRow(
    documentId: string,
    tableId: string,
    rowId: string,
    values: TableRowValues
  ): Promise<TableRow> {
    const response = await apiClient.put<{ success: boolean; data: TableRow }>(
      `/documents/${documentId}/tables/${tableId}/rows/${rowId}`,
      { values }
    );
    return response.data.data;
  },

  /**
   * Update a single cell value
   */
  async updateCell(
    documentId: string,
    tableId: string,
    rowId: string,
    columnId: string,
    value: string | number | boolean | null
  ): Promise<TableRow> {
    const response = await apiClient.put<{ success: boolean; data: TableRow }>(
      `/documents/${documentId}/tables/${tableId}/rows/${rowId}/cells/${columnId}`,
      { value }
    );
    return response.data.data;
  },

  /**
   * Delete a row
   */
  async deleteRow(documentId: string, tableId: string, rowId: string): Promise<void> {
    await apiClient.delete(`/documents/${documentId}/tables/${tableId}/rows/${rowId}`);
  },

  /**
   * Reorder rows
   */
  async reorderRows(documentId: string, tableId: string, rowIds: string[]): Promise<FieldTable> {
    const response = await apiClient.post<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}/rows/reorder`,
      { row_ids: rowIds }
    );
    return response.data.data;
  },

  // Column operations

  /**
   * Add a column to a table
   */
  async addColumn(
    documentId: string,
    tableId: string,
    column: Omit<TableColumn, 'id'>
  ): Promise<FieldTable> {
    const response = await apiClient.post<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}/columns`,
      column
    );
    return response.data.data;
  },

  /**
   * Update a column
   */
  async updateColumn(
    documentId: string,
    tableId: string,
    columnId: string,
    data: Partial<Omit<TableColumn, 'id'>>
  ): Promise<FieldTable> {
    const response = await apiClient.put<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}/columns/${columnId}`,
      data
    );
    return response.data.data;
  },

  /**
   * Delete a column
   */
  async deleteColumn(documentId: string, tableId: string, columnId: string): Promise<FieldTable> {
    const response = await apiClient.delete<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}/columns/${columnId}`
    );
    return response.data.data;
  },

  /**
   * Reorder columns
   */
  async reorderColumns(
    documentId: string,
    tableId: string,
    columnIds: string[]
  ): Promise<FieldTable> {
    const response = await apiClient.post<{ success: boolean; data: FieldTable }>(
      `/documents/${documentId}/tables/${tableId}/columns/reorder`,
      { column_ids: columnIds }
    );
    return response.data.data;
  },
};

export default fieldTableService;
