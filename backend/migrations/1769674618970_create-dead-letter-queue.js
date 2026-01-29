/**
 * Migration: Create dead_letter_queue table
 *
 * Stores failed jobs for manual inspection and retry.
 * Jobs are moved here after exhausting all retries.
 */

/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.up = (pgm) => {
  pgm.createTable('dead_letter_queue', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    queue_name: {
      type: 'varchar(100)',
      notNull: true,
    },
    job_id: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'Original BullMQ job ID',
    },
    job_name: {
      type: 'varchar(255)',
      comment: 'Job name if provided',
    },
    job_data: {
      type: 'jsonb',
      notNull: true,
      comment: 'Original job data/payload',
    },
    error_message: {
      type: 'text',
      comment: 'Last error message',
    },
    error_stack: {
      type: 'text',
      comment: 'Error stack trace',
    },
    attempts_made: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    max_attempts: {
      type: 'integer',
      notNull: true,
      default: 3,
    },
    failed_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    retried_at: {
      type: 'timestamptz',
      comment: 'When the job was last retried from DLQ',
    },
    retry_count: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of times job has been retried from DLQ',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: 'failed',
      comment: 'Status: failed, retrying, resolved, discarded',
    },
    metadata: {
      type: 'jsonb',
      comment: 'Additional metadata (e.g., job options, timestamps)',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Indexes for common queries
  pgm.createIndex('dead_letter_queue', 'queue_name');
  pgm.createIndex('dead_letter_queue', 'status');
  pgm.createIndex('dead_letter_queue', 'failed_at');
  pgm.createIndex('dead_letter_queue', ['queue_name', 'status']);

  // Add constraint for valid status values
  pgm.addConstraint('dead_letter_queue', 'valid_status', {
    check: "status IN ('failed', 'retrying', 'resolved', 'discarded')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('dead_letter_queue');
};
