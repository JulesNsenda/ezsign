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
  pgm.createTable('templates', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    team_id: {
      type: 'uuid',
      notNull: false,
      references: 'teams(id)',
      onDelete: 'CASCADE',
      comment: 'Team that owns this template (null for personal templates)',
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    description: {
      type: 'text',
      notNull: false,
    },
    original_document_id: {
      type: 'uuid',
      notNull: false,
      references: 'documents(id)',
      onDelete: 'SET NULL',
      comment: 'Original document this template was created from',
    },
    file_path: {
      type: 'varchar(1024)',
      notNull: true,
      comment: 'Path to the template PDF file',
    },
    file_size: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    mime_type: {
      type: 'varchar(255)',
      notNull: true,
      default: 'application/pdf',
    },
    page_count: {
      type: 'integer',
      notNull: true,
      default: 0,
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

  // Create indexes for faster lookups
  pgm.createIndex('templates', 'user_id');
  pgm.createIndex('templates', 'team_id');
  pgm.createIndex('templates', 'original_document_id');
  pgm.createIndex('templates', 'created_at');

  // Create trigger to automatically update updated_at
  pgm.createTrigger('templates', 'update_templates_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });

  // Create template_fields junction table to store field definitions for templates
  pgm.createTable('template_fields', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    template_id: {
      type: 'uuid',
      notNull: true,
      references: 'templates(id)',
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
    signer_role: {
      type: 'varchar(255)',
      notNull: false,
      comment: 'Role name for signer (e.g., "Client", "Witness")',
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

  // Create indexes for template_fields
  pgm.createIndex('template_fields', 'template_id');
  pgm.createIndex('template_fields', 'type');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('template_fields');
  pgm.dropTable('templates');
};
