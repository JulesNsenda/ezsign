/**
 * Create audit_events table
 * Stores audit trail for all document-related events
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
  // Create audit_events table
  pgm.createTable('audit_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      references: 'documents',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      references: 'users',
      onDelete: 'SET NULL',
    },
    event_type: {
      type: 'varchar(50)',
      notNull: true,
      check: "event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded')",
    },
    ip_address: {
      type: 'varchar(45)',
      comment: 'IPv4 or IPv6 address',
    },
    user_agent: {
      type: 'text',
      comment: 'Browser user agent string',
    },
    metadata: {
      type: 'jsonb',
      comment: 'Additional event-specific data',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes
  pgm.createIndex('audit_events', 'document_id');
  pgm.createIndex('audit_events', 'user_id');
  pgm.createIndex('audit_events', 'event_type');
  pgm.createIndex('audit_events', 'created_at');
  pgm.createIndex('audit_events', 'metadata', { method: 'gin' });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE audit_events IS 'Audit trail for all document-related events';
    COMMENT ON COLUMN audit_events.metadata IS 'JSONB field for storing event-specific data like signer email, field IDs, etc.';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('audit_events');
};
