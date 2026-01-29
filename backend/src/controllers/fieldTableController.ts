/**
 * Field Table Controller
 *
 * Handles HTTP requests for table field operations.
 */

import { Request, Response, NextFunction } from 'express';
import { getFieldTableService } from '@/services/fieldTableService';
import { TableColumn } from '@/models/FieldTable';
import logger from '@/services/loggerService';

/**
 * Create a new table for a document
 */
export const createTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const documentId = req.params.id;
    if (!documentId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Document ID is required' },
      });
      return;
    }

    const {
      name,
      description,
      page,
      x,
      y,
      width,
      columns,
      min_rows,
      max_rows,
      row_height,
      show_header,
      header_background_color,
      header_text_color,
      font_size,
      border_color,
      signer_email,
      allow_add_rows,
      allow_remove_rows,
    } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table name is required' },
      });
      return;
    }

    if (x === undefined || y === undefined || width === undefined) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Position (x, y) and width are required' },
      });
      return;
    }

    const service = getFieldTableService();
    const table = await service.createTable({
      document_id: documentId,
      name,
      description,
      page: page ?? 0,
      x,
      y,
      width,
      columns,
      min_rows,
      max_rows,
      row_height,
      show_header,
      header_background_color,
      header_text_color,
      font_size,
      border_color,
      signer_email,
      allow_add_rows,
      allow_remove_rows,
    });

    // Validate the table
    const validation = table.validate();
    if (!validation.valid) {
      logger.warn('Created table with validation warnings', {
        tableId: table.id,
        warnings: validation.errors,
      });
    }

    res.status(201).json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all tables for a document
 */
export const getDocumentTables = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const documentId = req.params.id;
    if (!documentId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Document ID is required' },
      });
      return;
    }

    const service = getFieldTableService();
    const tables = await service.getTablesByDocumentId(documentId);

    res.json({
      success: true,
      data: tables.map((t) => t.toJSON()),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a specific table
 */
export const getTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const service = getFieldTableService();
    const table = await service.getTableById(tableId);

    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a table
 */
export const updateTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const service = getFieldTableService();
    const table = await service.updateTable(tableId, req.body);

    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a table
 */
export const deleteTable = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const service = getFieldTableService();
    const deleted = await service.deleteTable(tableId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Table deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a row to a table
 */
export const addRow = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const { values } = req.body;

    const service = getFieldTableService();

    // Check if we can add more rows
    const table = await service.getTableById(tableId);
    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    const rowCount = await service.getRowCount(tableId);
    if (!table.canAddRows(rowCount)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MAX_ROWS_REACHED',
          message: `Maximum number of rows (${table.max_rows}) reached`,
        },
      });
      return;
    }

    const row = await service.addRow(tableId, undefined, values);

    res.status(201).json({
      success: true,
      data: row.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update row values
 */
export const updateRow = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rowId = req.params.rowId;
    if (!rowId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Row ID is required' },
      });
      return;
    }

    const { values } = req.body;

    const service = getFieldTableService();
    const row = await service.updateRowValues(rowId, values);

    if (!row) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Row not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: row.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a single cell value
 */
export const updateCell = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const rowId = req.params.rowId;
    const columnId = req.params.columnId;
    if (!rowId || !columnId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Row ID and Column ID are required' },
      });
      return;
    }

    const { value } = req.body;

    const service = getFieldTableService();
    const row = await service.updateCellValue(rowId, columnId, value);

    if (!row) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Row not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: row.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a row
 */
export const deleteRow = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    const rowId = req.params.rowId;
    if (!tableId || !rowId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID and Row ID are required' },
      });
      return;
    }

    const service = getFieldTableService();

    // Check if we can remove rows
    const table = await service.getTableById(tableId);
    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    const rowCount = await service.getRowCount(tableId);
    if (!table.canRemoveRows(rowCount)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'MIN_ROWS_REACHED',
          message: `Minimum number of rows (${table.min_rows}) reached`,
        },
      });
      return;
    }

    const deleted = await service.deleteRow(rowId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Row not found' },
      });
      return;
    }

    res.json({
      success: true,
      message: 'Row deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reorder rows
 */
export const reorderRows = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const { row_ids } = req.body;

    if (!Array.isArray(row_ids) || row_ids.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'row_ids array is required' },
      });
      return;
    }

    const service = getFieldTableService();
    await service.reorderRows(tableId, row_ids);

    const table = await service.getTableById(tableId);

    res.json({
      success: true,
      data: table?.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add a column to a table
 */
export const addColumn = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const { name, type, width, required, placeholder, defaultValue } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Column name is required' },
      });
      return;
    }

    const column: TableColumn = {
      id: crypto.randomUUID(),
      name,
      type: type || 'text',
      width: width || 100,
      required: required || false,
      placeholder,
      defaultValue,
    };

    const service = getFieldTableService();
    const table = await service.addColumn(tableId, column);

    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a column
 */
export const updateColumn = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    const columnId = req.params.columnId;
    if (!tableId || !columnId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID and Column ID are required' },
      });
      return;
    }

    const service = getFieldTableService();
    const table = await service.updateColumn(tableId, columnId, req.body);

    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table or column not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a column
 */
export const deleteColumn = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    const columnId = req.params.columnId;
    if (!tableId || !columnId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID and Column ID are required' },
      });
      return;
    }

    const service = getFieldTableService();
    const table = await service.deleteColumn(tableId, columnId);

    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Reorder columns
 */
export const reorderColumns = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tableId = req.params.tableId;
    if (!tableId) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Table ID is required' },
      });
      return;
    }

    const { column_ids } = req.body;

    if (!Array.isArray(column_ids) || column_ids.length === 0) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'column_ids array is required' },
      });
      return;
    }

    const service = getFieldTableService();
    const table = await service.reorderColumns(tableId, column_ids);

    if (!table) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Table not found' },
      });
      return;
    }

    res.json({
      success: true,
      data: table.toJSON(),
    });
  } catch (error) {
    next(error);
  }
};
