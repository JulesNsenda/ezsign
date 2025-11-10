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
  pgm.createTable('fields', {
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
    type: {
      type: 'varchar(50)',
      notNull: true,
      check: "type IN ('signature', 'initials', 'date', 'text', 'checkbox')",
    },
    page: {
      type: 'integer',
      notNull: true,
      comment: 'Page number (0-indexed)',
    },
    x: {
      type: 'numeric(10, 2)',
      notNull: true,
      comment: 'X coordinate from left in points',
    },
    y: {
      type: 'numeric(10, 2)',
      notNull: true,
      comment: 'Y coordinate from bottom in points',
    },
    width: {
      type: 'numeric(10, 2)',
      notNull: true,
      comment: 'Field width in points',
    },
    height: {
      type: 'numeric(10, 2)',
      notNull: true,
      comment: 'Field height in points',
    },
    required: {
      type: 'boolean',
      notNull: true,
      default: true,
    },
    signer_email: {
      type: 'varchar(255)',
      notNull: false,
      comment: 'Email of the signer assigned to this field',
    },
    properties: {
      type: 'jsonb',
      notNull: false,
      comment: 'Field-specific properties (font, color, placeholder, etc.)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes for faster lookups
  pgm.createIndex('fields', 'document_id');
  pgm.createIndex('fields', 'signer_email');
  pgm.createIndex('fields', 'type');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('fields');
};
