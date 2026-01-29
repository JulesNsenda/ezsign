/**
 * Field Table Model
 *
 * Represents a table field with configurable columns and repeatable rows.
 * Used for structured data entry like line items, attendee lists, etc.
 */

/**
 * Column type options
 */
export type TableColumnType = 'text' | 'number' | 'date' | 'checkbox';

/**
 * Column definition for a table
 */
export interface TableColumn {
  id: string;           // UUID for the column
  name: string;         // Display name
  type: TableColumnType;
  width: number;        // Width in points (relative to table width)
  required: boolean;    // Whether this column must have a value
  placeholder?: string; // Placeholder text for empty cells
  defaultValue?: string;// Default value for new rows
}

/**
 * Row values (maps column ID to cell value)
 */
export interface TableRowValues {
  [columnId: string]: string | number | boolean | null;
}

/**
 * Table row data
 */
export interface TableRowData {
  id: string;
  table_id: string;
  row_index: number;
  values: TableRowValues;
  created_at: Date;
  updated_at: Date;
}

/**
 * Field table data from database
 */
export interface FieldTableData {
  id: string;
  document_id: string;
  name: string;
  description: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  columns: TableColumn[];
  min_rows: number;
  max_rows: number;
  row_height: number;
  show_header: boolean;
  header_background_color: string | null;
  header_text_color: string | null;
  font_size: number;
  border_color: string | null;
  signer_email: string | null;
  allow_add_rows: boolean;
  allow_remove_rows: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Data for creating a new table
 */
export interface CreateFieldTableData {
  document_id: string;
  name: string;
  description?: string;
  page: number;
  x: number;
  y: number;
  width: number;
  columns?: TableColumn[];
  min_rows?: number;
  max_rows?: number;
  row_height?: number;
  show_header?: boolean;
  header_background_color?: string;
  header_text_color?: string;
  font_size?: number;
  border_color?: string;
  signer_email?: string;
  allow_add_rows?: boolean;
  allow_remove_rows?: boolean;
}

/**
 * Data for updating a table
 */
export interface UpdateFieldTableData {
  name?: string;
  description?: string;
  page?: number;
  x?: number;
  y?: number;
  width?: number;
  columns?: TableColumn[];
  min_rows?: number;
  max_rows?: number;
  row_height?: number;
  show_header?: boolean;
  header_background_color?: string;
  header_text_color?: string;
  font_size?: number;
  border_color?: string;
  signer_email?: string;
  allow_add_rows?: boolean;
  allow_remove_rows?: boolean;
}

/**
 * Field Table Class
 */
export class FieldTable {
  id: string;
  document_id: string;
  name: string;
  description: string | null;
  page: number;
  x: number;
  y: number;
  width: number;
  columns: TableColumn[];
  min_rows: number;
  max_rows: number;
  row_height: number;
  show_header: boolean;
  header_background_color: string | null;
  header_text_color: string | null;
  font_size: number;
  border_color: string | null;
  signer_email: string | null;
  allow_add_rows: boolean;
  allow_remove_rows: boolean;
  created_at: Date;
  updated_at: Date;

  // Optional: loaded rows
  rows?: TableRow[];

  constructor(data: FieldTableData) {
    this.id = data.id;
    this.document_id = data.document_id;
    this.name = data.name;
    this.description = data.description;
    this.page = data.page;
    this.x = data.x;
    this.y = data.y;
    this.width = data.width;
    this.columns = data.columns || [];
    this.min_rows = data.min_rows;
    this.max_rows = data.max_rows;
    this.row_height = data.row_height;
    this.show_header = data.show_header;
    this.header_background_color = data.header_background_color;
    this.header_text_color = data.header_text_color;
    this.font_size = data.font_size;
    this.border_color = data.border_color;
    this.signer_email = data.signer_email;
    this.allow_add_rows = data.allow_add_rows;
    this.allow_remove_rows = data.allow_remove_rows;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Calculate total table height based on rows
   */
  calculateHeight(rowCount: number): number {
    const headerHeight = this.show_header ? this.row_height : 0;
    return headerHeight + (rowCount * this.row_height);
  }

  /**
   * Check if a signer can add rows
   */
  canAddRows(currentRowCount: number): boolean {
    return this.allow_add_rows && currentRowCount < this.max_rows;
  }

  /**
   * Check if a signer can remove rows
   */
  canRemoveRows(currentRowCount: number): boolean {
    return this.allow_remove_rows && currentRowCount > this.min_rows;
  }

  /**
   * Validate table configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.name || this.name.trim() === '') {
      errors.push('Table name is required');
    }

    if (this.columns.length === 0) {
      errors.push('Table must have at least one column');
    }

    if (this.columns.length > 20) {
      errors.push('Table cannot have more than 20 columns');
    }

    // Validate columns
    const columnIds = new Set<string>();
    for (const column of this.columns) {
      if (!column.id) {
        errors.push('Column must have an ID');
      }
      if (columnIds.has(column.id)) {
        errors.push(`Duplicate column ID: ${column.id}`);
      }
      columnIds.add(column.id);

      if (!column.name || column.name.trim() === '') {
        errors.push('Column name is required');
      }

      const validTypes: TableColumnType[] = ['text', 'number', 'date', 'checkbox'];
      if (!validTypes.includes(column.type)) {
        errors.push(`Invalid column type: ${column.type}`);
      }

      if (column.width <= 0) {
        errors.push('Column width must be positive');
      }
    }

    if (this.min_rows < 0) {
      errors.push('Minimum rows cannot be negative');
    }

    if (this.max_rows < this.min_rows) {
      errors.push('Maximum rows must be >= minimum rows');
    }

    if (this.max_rows > 100) {
      errors.push('Maximum rows cannot exceed 100');
    }

    if (this.row_height < 15) {
      errors.push('Row height must be at least 15 points');
    }

    if (this.width <= 0) {
      errors.push('Table width must be positive');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate row values against column definitions
   */
  validateRow(values: TableRowValues): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const column of this.columns) {
      const value = values[column.id];

      // Check required columns
      if (column.required) {
        if (value === null || value === undefined || value === '') {
          errors.push(`Column "${column.name}" is required`);
          continue;
        }
      }

      // Skip validation if no value
      if (value === null || value === undefined || value === '') {
        continue;
      }

      // Type validation
      switch (column.type) {
        case 'number':
          if (typeof value !== 'number' && isNaN(Number(value))) {
            errors.push(`Column "${column.name}" must be a number`);
          }
          break;
        case 'checkbox':
          if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
            errors.push(`Column "${column.name}" must be a boolean`);
          }
          break;
        case 'date':
          // Basic date format check (YYYY-MM-DD)
          if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            errors.push(`Column "${column.name}" must be a valid date (YYYY-MM-DD)`);
          }
          break;
        // text type accepts any string value
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get default column configuration
   */
  static getDefaultColumn(index: number): TableColumn {
    return {
      id: crypto.randomUUID(),
      name: `Column ${index + 1}`,
      type: 'text',
      width: 100,
      required: false,
    };
  }

  /**
   * Get default table configuration
   */
  static getDefaultConfig(): Partial<CreateFieldTableData> {
    return {
      columns: [
        FieldTable.getDefaultColumn(0),
        FieldTable.getDefaultColumn(1),
      ],
      min_rows: 1,
      max_rows: 10,
      row_height: 25,
      show_header: true,
      font_size: 10,
      allow_add_rows: true,
      allow_remove_rows: true,
    };
  }

  /**
   * Convert to JSON
   */
  toJSON(): FieldTableData & { rows?: TableRowData[] } {
    return {
      id: this.id,
      document_id: this.document_id,
      name: this.name,
      description: this.description,
      page: this.page,
      x: this.x,
      y: this.y,
      width: this.width,
      columns: this.columns,
      min_rows: this.min_rows,
      max_rows: this.max_rows,
      row_height: this.row_height,
      show_header: this.show_header,
      header_background_color: this.header_background_color,
      header_text_color: this.header_text_color,
      font_size: this.font_size,
      border_color: this.border_color,
      signer_email: this.signer_email,
      allow_add_rows: this.allow_add_rows,
      allow_remove_rows: this.allow_remove_rows,
      created_at: this.created_at,
      updated_at: this.updated_at,
      rows: this.rows?.map((r) => r.toJSON()),
    };
  }
}

/**
 * Table Row Class
 */
export class TableRow {
  id: string;
  table_id: string;
  row_index: number;
  values: TableRowValues;
  created_at: Date;
  updated_at: Date;

  constructor(data: TableRowData) {
    this.id = data.id;
    this.table_id = data.table_id;
    this.row_index = data.row_index;
    this.values = data.values || {};
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  /**
   * Get value for a specific column
   */
  getValue(columnId: string): string | number | boolean | null {
    return this.values[columnId] ?? null;
  }

  /**
   * Set value for a specific column
   */
  setValue(columnId: string, value: string | number | boolean | null): void {
    this.values[columnId] = value;
  }

  /**
   * Check if row has any non-empty values
   */
  hasValues(): boolean {
    return Object.values(this.values).some(
      (v) => v !== null && v !== undefined && v !== ''
    );
  }

  /**
   * Convert to JSON
   */
  toJSON(): TableRowData {
    return {
      id: this.id,
      table_id: this.table_id,
      row_index: this.row_index,
      values: this.values,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }
}
