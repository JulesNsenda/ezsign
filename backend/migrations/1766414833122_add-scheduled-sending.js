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
  // Add scheduling columns to documents table
  pgm.addColumns('documents', {
    scheduled_send_at: {
      type: 'timestamp with time zone',
      notNull: false,
    },
    scheduled_timezone: {
      type: 'varchar(50)',
      notNull: false,
    },
    schedule_job_id: {
      type: 'varchar(100)',
      notNull: false,
    },
  });

  // Drop existing status constraint
  pgm.sql(`ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_status_check`);

  // Add updated status constraint including 'scheduled'
  pgm.addConstraint('documents', 'documents_status_check', {
    check: "status IN ('draft', 'scheduled', 'pending', 'completed', 'cancelled')",
  });

  // Create index for finding scheduled documents efficiently
  pgm.createIndex('documents', 'scheduled_send_at', {
    name: 'idx_documents_scheduled_send',
    where: "status = 'scheduled'",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop the index
  pgm.dropIndex('documents', 'scheduled_send_at', { name: 'idx_documents_scheduled_send' });

  // Drop the updated constraint
  pgm.dropConstraint('documents', 'documents_status_check');

  // Re-add original constraint without 'scheduled'
  pgm.addConstraint('documents', 'documents_status_check', {
    check: "status IN ('draft', 'pending', 'completed', 'cancelled')",
  });

  // Remove scheduling columns
  pgm.dropColumns('documents', ['scheduled_send_at', 'scheduled_timezone', 'schedule_job_id']);
};
