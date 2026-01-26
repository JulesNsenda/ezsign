/**
 * Create email_logs table
 * Tracks all outgoing emails for delivery status monitoring
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
  // Create email_logs table
  pgm.createTable('email_logs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      references: 'documents',
      onDelete: 'CASCADE',
      comment: 'Associated document (nullable for non-document emails)',
    },
    signer_id: {
      type: 'uuid',
      references: 'signers',
      onDelete: 'CASCADE',
      comment: 'Associated signer (for signing-related emails)',
    },
    user_id: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
      comment: 'User who triggered the email or recipient user',
    },
    recipient_email: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'Email address of the recipient',
    },
    email_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "email_type IN ('signing_request', 'reminder', 'completion', 'password_change', 'verification', 'welcome', 'password_reset')",
      comment: 'Type of email sent',
    },
    subject: {
      type: 'text',
      notNull: true,
      comment: 'Email subject line',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'queued'",
      check: "status IN ('queued', 'sent', 'delivered', 'bounced', 'failed', 'opened')",
      comment: 'Current delivery status',
    },
    error_message: {
      type: 'text',
      comment: 'Error details if delivery failed',
    },
    message_id: {
      type: 'varchar(255)',
      comment: 'SMTP message ID for tracking',
    },
    metadata: {
      type: 'jsonb',
      comment: 'Additional email metadata (template data, headers, etc.)',
    },
    sent_at: {
      type: 'timestamp',
      comment: 'When the email was sent to SMTP',
    },
    delivered_at: {
      type: 'timestamp',
      comment: 'When delivery was confirmed',
    },
    opened_at: {
      type: 'timestamp',
      comment: 'When the email was opened (if tracking enabled)',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes for common queries
  pgm.createIndex('email_logs', 'document_id');
  pgm.createIndex('email_logs', 'signer_id');
  pgm.createIndex('email_logs', 'user_id');
  pgm.createIndex('email_logs', 'recipient_email');
  pgm.createIndex('email_logs', 'email_type');
  pgm.createIndex('email_logs', 'status');
  pgm.createIndex('email_logs', 'created_at');
  pgm.createIndex('email_logs', 'message_id');

  // Add table comment
  pgm.sql(`
    COMMENT ON TABLE email_logs IS 'Tracks all outgoing emails for delivery status monitoring and resend functionality';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('email_logs');
};
