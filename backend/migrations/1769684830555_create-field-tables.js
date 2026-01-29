/**
 * Migration: Create Field Tables
 *
 * Adds support for table fields with repeatable rows.
 * Tables have configurable columns and can be expanded/contracted by signers.
 */

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.up = (pgm) => {
  // Create field_tables table
  pgm.createTable('field_tables', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents(id)',
      onDelete: 'CASCADE',
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    // Table position and dimensions on the page
    page: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    x: {
      type: 'real',
      notNull: true,
    },
    y: {
      type: 'real',
      notNull: true,
    },
    width: {
      type: 'real',
      notNull: true,
    },
    // Column definitions stored as JSONB array
    // Each column: { id, name, type: 'text'|'number'|'date'|'checkbox', width, required }
    columns: {
      type: 'jsonb',
      notNull: true,
      default: '[]',
    },
    // Row configuration
    min_rows: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    max_rows: {
      type: 'integer',
      notNull: true,
      default: 10,
    },
    row_height: {
      type: 'real',
      notNull: true,
      default: 25, // Points
    },
    // Whether to show a header row with column names
    show_header: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    // Header styling
    header_background_color: {
      type: 'varchar(7)',
      notNull: false,
      default: '#f3f4f6',
    },
    header_text_color: {
      type: 'varchar(7)',
      notNull: false,
      default: '#374151',
    },
    // Cell styling
    font_size: {
      type: 'integer',
      notNull: true,
      default: 10,
    },
    border_color: {
      type: 'varchar(7)',
      notNull: false,
      default: '#d1d5db',
    },
    // Signer assignment
    signer_email: {
      type: 'varchar(255)',
      notNull: false,
    },
    // Whether the signer can add/remove rows
    allow_add_rows: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    allow_remove_rows: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Create field_table_rows table for storing actual row data
  pgm.createTable('field_table_rows', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    table_id: {
      type: 'uuid',
      notNull: true,
      references: 'field_tables(id)',
      onDelete: 'CASCADE',
    },
    row_index: {
      type: 'integer',
      notNull: true,
    },
    // Cell values stored as JSONB object: { columnId: value, ... }
    values: {
      type: 'jsonb',
      notNull: true,
      default: '{}',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // Indexes
  pgm.createIndex('field_tables', 'document_id');
  pgm.createIndex('field_tables', ['document_id', 'page']);
  pgm.createIndex('field_tables', 'signer_email');

  pgm.createIndex('field_table_rows', 'table_id');
  pgm.createIndex('field_table_rows', ['table_id', 'row_index']);

  // Unique constraint to prevent duplicate row indices within a table
  pgm.addConstraint('field_table_rows', 'field_table_rows_table_row_unique', {
    unique: ['table_id', 'row_index'],
  });
};

/**
 * @param {import('node-pg-migrate').MigrationBuilder} pgm
 */
exports.down = (pgm) => {
  pgm.dropTable('field_table_rows');
  pgm.dropTable('field_tables');
};
