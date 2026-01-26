/**
 * Add document expiration and reminder functionality
 * - Adds expires_at and reminder_settings to documents
 * - Creates document_reminders table for tracking sent reminders
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
  // Add expiration and reminder settings to documents table
  pgm.addColumns('documents', {
    expires_at: {
      type: 'timestamp',
      comment: 'When the document signing request expires',
    },
    reminder_settings: {
      type: 'jsonb',
      default: pgm.func("'{\"enabled\": true, \"intervals\": [1, 3, 7]}'::jsonb"),
      comment: 'Reminder configuration: enabled flag and intervals (days before expiration)',
    },
  });

  // Create index on expires_at for efficient queries
  pgm.createIndex('documents', 'expires_at', {
    where: 'expires_at IS NOT NULL AND status = \'pending\'',
  });

  // Create document_reminders table for tracking sent reminders
  pgm.createTable('document_reminders', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    signer_id: {
      type: 'uuid',
      references: 'signers',
      onDelete: 'CASCADE',
      comment: 'Specific signer to remind (null for owner notifications)',
    },
    reminder_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "reminder_type IN ('1_day', '3_day', '7_day', 'custom', 'owner')",
      comment: 'Type of reminder: 1_day, 3_day, 7_day before expiration, custom, or owner notification',
    },
    scheduled_for: {
      type: 'timestamp',
      notNull: true,
      comment: 'When the reminder should be sent',
    },
    sent_at: {
      type: 'timestamp',
      comment: 'When the reminder was actually sent (null if pending)',
    },
    job_id: {
      type: 'varchar(100)',
      comment: 'BullMQ job ID for cancellation',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes for efficient queries
  pgm.createIndex('document_reminders', 'document_id');
  pgm.createIndex('document_reminders', 'signer_id');
  pgm.createIndex('document_reminders', 'scheduled_for', {
    where: 'sent_at IS NULL',
  });
  pgm.createIndex('document_reminders', ['document_id', 'signer_id', 'reminder_type'], {
    unique: true,
    where: 'signer_id IS NOT NULL',
  });

  // Add table comment
  pgm.sql(`
    COMMENT ON TABLE document_reminders IS 'Tracks scheduled and sent deadline reminders for documents';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('document_reminders');
  pgm.dropIndex('documents', 'expires_at');
  pgm.dropColumns('documents', ['expires_at', 'reminder_settings']);
};
