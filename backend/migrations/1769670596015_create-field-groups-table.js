/**
 * Create field_groups table
 * Enables organizing fields into collapsible sections within documents
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const up = (pgm) => {
  pgm.createTable('field_groups', {
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
      comment: 'Document this group belongs to',
    },
    name: {
      type: 'varchar(100)',
      notNull: true,
      comment: 'Display name for the field group/section',
    },
    description: {
      type: 'text',
      comment: 'Optional description of the group purpose',
    },
    sort_order: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Order of group within document (0-indexed)',
    },
    collapsed: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Whether the group is collapsed in the UI',
    },
    color: {
      type: 'varchar(7)',
      comment: 'Optional hex color for visual distinction (#RRGGBB)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes for common queries
  pgm.createIndex('field_groups', 'document_id');
  pgm.createIndex('field_groups', ['document_id', 'sort_order']);

  // Unique constraint: name must be unique per document
  pgm.createIndex('field_groups', ['document_id', 'name'], { unique: true });

  // Add table comment
  pgm.sql(`
    COMMENT ON TABLE field_groups IS 'Organizes fields into collapsible sections within documents';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('field_groups');
};
