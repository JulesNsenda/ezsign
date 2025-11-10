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
  pgm.createTable('documents', {
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
      references: 'teams(id)',
      onDelete: 'SET NULL',
    },
    title: {
      type: 'varchar(255)',
      notNull: true,
    },
    original_filename: {
      type: 'varchar(255)',
      notNull: true,
    },
    file_path: {
      type: 'varchar(500)',
      notNull: true,
    },
    file_size: {
      type: 'integer',
      notNull: true,
    },
    mime_type: {
      type: 'varchar(100)',
      notNull: true,
    },
    page_count: {
      type: 'integer',
      notNull: true,
      default: 1,
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'draft',
      check: "status IN ('draft', 'pending', 'completed', 'cancelled')",
    },
    workflow_type: {
      type: 'varchar(50)',
      notNull: true,
      default: 'single',
      check: "workflow_type IN ('single', 'sequential', 'parallel')",
    },
    completed_at: {
      type: 'timestamp',
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
  pgm.createIndex('documents', 'user_id');
  pgm.createIndex('documents', 'team_id');
  pgm.createIndex('documents', 'status');
  pgm.createIndex('documents', 'created_at');

  // Create trigger to automatically update updated_at
  pgm.createTrigger('documents', 'update_documents_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('documents');
};
