/**
 * Field Table Service
 *
 * Handles CRUD operations for table fields and their rows.
 */

import { Pool } from 'pg';
import {
  FieldTable,
  FieldTableData,
  CreateFieldTableData,
  UpdateFieldTableData,
  TableRow,
  TableRowData,
  TableRowValues,
  TableColumn,
} from '@/models/FieldTable';
import logger from '@/services/loggerService';

export class FieldTableService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new table
   */
  async createTable(data: CreateFieldTableData): Promise<FieldTable> {
    const defaults = FieldTable.getDefaultConfig();

    const query = `
      INSERT INTO field_tables (
        document_id, name, description, page, x, y, width,
        columns, min_rows, max_rows, row_height, show_header,
        header_background_color, header_text_color, font_size,
        border_color, signer_email, allow_add_rows, allow_remove_rows
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      RETURNING *
    `;

    const values = [
      data.document_id,
      data.name,
      data.description || null,
      data.page,
      data.x,
      data.y,
      data.width,
      JSON.stringify(data.columns || defaults.columns),
      data.min_rows ?? defaults.min_rows,
      data.max_rows ?? defaults.max_rows,
      data.row_height ?? defaults.row_height,
      data.show_header ?? defaults.show_header,
      data.header_background_color || '#f3f4f6',
      data.header_text_color || '#374151',
      data.font_size ?? defaults.font_size,
      data.border_color || '#d1d5db',
      data.signer_email || null,
      data.allow_add_rows ?? defaults.allow_add_rows,
      data.allow_remove_rows ?? defaults.allow_remove_rows,
    ];

    const result = await this.pool.query(query, values);
    const table = new FieldTable(this.mapRow(result.rows[0]));

    // Create initial rows based on min_rows
    const minRows = table.min_rows;
    if (minRows > 0) {
      for (let i = 0; i < minRows; i++) {
        await this.addRow(table.id, i);
      }
    }

    // Load rows
    table.rows = await this.getTableRows(table.id);

    logger.info('Created field table', {
      tableId: table.id,
      documentId: table.document_id,
      name: table.name,
      columnCount: table.columns.length,
    });

    return table;
  }

  /**
   * Get a table by ID
   */
  async getTableById(tableId: string): Promise<FieldTable | null> {
    const query = 'SELECT * FROM field_tables WHERE id = $1';
    const result = await this.pool.query(query, [tableId]);

    if (result.rows.length === 0) {
      return null;
    }

    const table = new FieldTable(this.mapRow(result.rows[0]));
    table.rows = await this.getTableRows(tableId);

    return table;
  }

  /**
   * Get all tables for a document
   */
  async getTablesByDocumentId(documentId: string): Promise<FieldTable[]> {
    const query = `
      SELECT * FROM field_tables
      WHERE document_id = $1
      ORDER BY page, y, x
    `;
    const result = await this.pool.query(query, [documentId]);

    const tables: FieldTable[] = [];
    for (const row of result.rows) {
      const table = new FieldTable(this.mapRow(row));
      table.rows = await this.getTableRows(table.id);
      tables.push(table);
    }

    return tables;
  }

  /**
   * Get tables assigned to a specific signer
   */
  async getTablesBySignerEmail(
    documentId: string,
    signerEmail: string
  ): Promise<FieldTable[]> {
    const query = `
      SELECT * FROM field_tables
      WHERE document_id = $1 AND (signer_email = $2 OR signer_email IS NULL)
      ORDER BY page, y, x
    `;
    const result = await this.pool.query(query, [documentId, signerEmail]);

    const tables: FieldTable[] = [];
    for (const row of result.rows) {
      const table = new FieldTable(this.mapRow(row));
      table.rows = await this.getTableRows(table.id);
      tables.push(table);
    }

    return tables;
  }

  /**
   * Update a table
   */
  async updateTable(
    tableId: string,
    data: UpdateFieldTableData
  ): Promise<FieldTable | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      setClauses.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.description !== undefined) {
      setClauses.push(`description = $${paramIndex++}`);
      values.push(data.description || null);
    }
    if (data.page !== undefined) {
      setClauses.push(`page = $${paramIndex++}`);
      values.push(data.page);
    }
    if (data.x !== undefined) {
      setClauses.push(`x = $${paramIndex++}`);
      values.push(data.x);
    }
    if (data.y !== undefined) {
      setClauses.push(`y = $${paramIndex++}`);
      values.push(data.y);
    }
    if (data.width !== undefined) {
      setClauses.push(`width = $${paramIndex++}`);
      values.push(data.width);
    }
    if (data.columns !== undefined) {
      setClauses.push(`columns = $${paramIndex++}`);
      values.push(JSON.stringify(data.columns));
    }
    if (data.min_rows !== undefined) {
      setClauses.push(`min_rows = $${paramIndex++}`);
      values.push(data.min_rows);
    }
    if (data.max_rows !== undefined) {
      setClauses.push(`max_rows = $${paramIndex++}`);
      values.push(data.max_rows);
    }
    if (data.row_height !== undefined) {
      setClauses.push(`row_height = $${paramIndex++}`);
      values.push(data.row_height);
    }
    if (data.show_header !== undefined) {
      setClauses.push(`show_header = $${paramIndex++}`);
      values.push(data.show_header);
    }
    if (data.header_background_color !== undefined) {
      setClauses.push(`header_background_color = $${paramIndex++}`);
      values.push(data.header_background_color);
    }
    if (data.header_text_color !== undefined) {
      setClauses.push(`header_text_color = $${paramIndex++}`);
      values.push(data.header_text_color);
    }
    if (data.font_size !== undefined) {
      setClauses.push(`font_size = $${paramIndex++}`);
      values.push(data.font_size);
    }
    if (data.border_color !== undefined) {
      setClauses.push(`border_color = $${paramIndex++}`);
      values.push(data.border_color);
    }
    if (data.signer_email !== undefined) {
      setClauses.push(`signer_email = $${paramIndex++}`);
      values.push(data.signer_email || null);
    }
    if (data.allow_add_rows !== undefined) {
      setClauses.push(`allow_add_rows = $${paramIndex++}`);
      values.push(data.allow_add_rows);
    }
    if (data.allow_remove_rows !== undefined) {
      setClauses.push(`allow_remove_rows = $${paramIndex++}`);
      values.push(data.allow_remove_rows);
    }

    if (setClauses.length === 0) {
      return this.getTableById(tableId);
    }

    setClauses.push(`updated_at = NOW()`);
    values.push(tableId);

    const query = `
      UPDATE field_tables
      SET ${setClauses.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return null;
    }

    const table = new FieldTable(this.mapRow(result.rows[0]));
    table.rows = await this.getTableRows(tableId);

    logger.info('Updated field table', { tableId, changes: Object.keys(data) });

    return table;
  }

  /**
   * Delete a table
   */
  async deleteTable(tableId: string): Promise<boolean> {
    const query = 'DELETE FROM field_tables WHERE id = $1 RETURNING id';
    const result = await this.pool.query(query, [tableId]);

    if (result.rows.length > 0) {
      logger.info('Deleted field table', { tableId });
      return true;
    }

    return false;
  }

  /**
   * Get all rows for a table
   */
  async getTableRows(tableId: string): Promise<TableRow[]> {
    const query = `
      SELECT * FROM field_table_rows
      WHERE table_id = $1
      ORDER BY row_index
    `;
    const result = await this.pool.query(query, [tableId]);

    return result.rows.map((row) => new TableRow(this.mapRowData(row)));
  }

  /**
   * Add a row to a table
   */
  async addRow(
    tableId: string,
    rowIndex?: number,
    values?: TableRowValues
  ): Promise<TableRow> {
    // If no index provided, get the next index
    if (rowIndex === undefined) {
      const countResult = await this.pool.query(
        'SELECT COALESCE(MAX(row_index), -1) + 1 as next_index FROM field_table_rows WHERE table_id = $1',
        [tableId]
      );
      rowIndex = countResult.rows[0].next_index;
    }

    const query = `
      INSERT INTO field_table_rows (table_id, row_index, values)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      tableId,
      rowIndex,
      JSON.stringify(values || {}),
    ]);

    return new TableRow(this.mapRowData(result.rows[0]));
  }

  /**
   * Update row values
   */
  async updateRowValues(
    rowId: string,
    values: TableRowValues
  ): Promise<TableRow | null> {
    const query = `
      UPDATE field_table_rows
      SET values = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [JSON.stringify(values), rowId]);

    if (result.rows.length === 0) {
      return null;
    }

    return new TableRow(this.mapRowData(result.rows[0]));
  }

  /**
   * Update a specific cell value
   */
  async updateCellValue(
    rowId: string,
    columnId: string,
    value: string | number | boolean | null
  ): Promise<TableRow | null> {
    // Use JSONB set operator
    const query = `
      UPDATE field_table_rows
      SET values = jsonb_set(COALESCE(values, '{}'::jsonb), $1, $2::jsonb),
          updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      `{${columnId}}`,
      JSON.stringify(value),
      rowId,
    ]);

    if (result.rows.length === 0) {
      return null;
    }

    return new TableRow(this.mapRowData(result.rows[0]));
  }

  /**
   * Delete a row
   */
  async deleteRow(rowId: string): Promise<boolean> {
    // Get the row first to reorder
    const getQuery = 'SELECT table_id, row_index FROM field_table_rows WHERE id = $1';
    const getResult = await this.pool.query(getQuery, [rowId]);

    if (getResult.rows.length === 0) {
      return false;
    }

    const { table_id, row_index } = getResult.rows[0];

    // Delete the row
    const deleteQuery = 'DELETE FROM field_table_rows WHERE id = $1';
    await this.pool.query(deleteQuery, [rowId]);

    // Reindex remaining rows
    const reindexQuery = `
      UPDATE field_table_rows
      SET row_index = row_index - 1
      WHERE table_id = $1 AND row_index > $2
    `;
    await this.pool.query(reindexQuery, [table_id, row_index]);

    return true;
  }

  /**
   * Reorder rows (for drag-and-drop)
   */
  async reorderRows(tableId: string, rowIds: string[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      for (let i = 0; i < rowIds.length; i++) {
        await client.query(
          'UPDATE field_table_rows SET row_index = $1, updated_at = NOW() WHERE id = $2 AND table_id = $3',
          [i, rowIds[i], tableId]
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Add a column to a table
   */
  async addColumn(tableId: string, column: TableColumn): Promise<FieldTable | null> {
    const table = await this.getTableById(tableId);
    if (!table) return null;

    const newColumns = [...table.columns, column];
    return this.updateTable(tableId, { columns: newColumns });
  }

  /**
   * Update a column
   */
  async updateColumn(
    tableId: string,
    columnId: string,
    updates: Partial<TableColumn>
  ): Promise<FieldTable | null> {
    const table = await this.getTableById(tableId);
    if (!table) return null;

    const newColumns = table.columns.map((col) =>
      col.id === columnId ? { ...col, ...updates } : col
    );

    return this.updateTable(tableId, { columns: newColumns });
  }

  /**
   * Delete a column
   */
  async deleteColumn(tableId: string, columnId: string): Promise<FieldTable | null> {
    const table = await this.getTableById(tableId);
    if (!table) return null;

    const newColumns = table.columns.filter((col) => col.id !== columnId);

    // Also remove the column data from all rows
    await this.pool.query(
      `UPDATE field_table_rows
       SET values = values - $1
       WHERE table_id = $2`,
      [columnId, tableId]
    );

    return this.updateTable(tableId, { columns: newColumns });
  }

  /**
   * Reorder columns
   */
  async reorderColumns(tableId: string, columnIds: string[]): Promise<FieldTable | null> {
    const table = await this.getTableById(tableId);
    if (!table) return null;

    const columnMap = new Map(table.columns.map((c) => [c.id, c]));
    const newColumns = columnIds
      .map((id) => columnMap.get(id))
      .filter((c): c is TableColumn => c !== undefined);

    return this.updateTable(tableId, { columns: newColumns });
  }

  /**
   * Get row count for a table
   */
  async getRowCount(tableId: string): Promise<number> {
    const query = 'SELECT COUNT(*) as count FROM field_table_rows WHERE table_id = $1';
    const result = await this.pool.query(query, [tableId]);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Map database row to FieldTableData
   */
  private mapRow(row: Record<string, unknown>): FieldTableData {
    return {
      id: row.id as string,
      document_id: row.document_id as string,
      name: row.name as string,
      description: row.description as string | null,
      page: row.page as number,
      x: row.x as number,
      y: row.y as number,
      width: row.width as number,
      columns: (row.columns || []) as TableColumn[],
      min_rows: row.min_rows as number,
      max_rows: row.max_rows as number,
      row_height: row.row_height as number,
      show_header: row.show_header as boolean,
      header_background_color: row.header_background_color as string | null,
      header_text_color: row.header_text_color as string | null,
      font_size: row.font_size as number,
      border_color: row.border_color as string | null,
      signer_email: row.signer_email as string | null,
      allow_add_rows: row.allow_add_rows as boolean,
      allow_remove_rows: row.allow_remove_rows as boolean,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
    };
  }

  /**
   * Map database row to TableRowData
   */
  private mapRowData(row: Record<string, unknown>): TableRowData {
    return {
      id: row.id as string,
      table_id: row.table_id as string,
      row_index: row.row_index as number,
      values: (row.values || {}) as TableRowValues,
      created_at: row.created_at as Date,
      updated_at: row.updated_at as Date,
    };
  }
}

// Singleton instance (will be initialized with pool in server.ts)
let fieldTableServiceInstance: FieldTableService | null = null;

export function initializeFieldTableService(pool: Pool): FieldTableService {
  fieldTableServiceInstance = new FieldTableService(pool);
  return fieldTableServiceInstance;
}

export function getFieldTableService(): FieldTableService {
  if (!fieldTableServiceInstance) {
    throw new Error('FieldTableService not initialized. Call initializeFieldTableService first.');
  }
  return fieldTableServiceInstance;
}
