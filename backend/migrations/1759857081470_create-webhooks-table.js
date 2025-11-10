/**
 * Create webhooks and webhook_events tables
 * Stores webhook configurations and delivery event log
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
  // Create webhooks table
  pgm.createTable('webhooks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users',
      onDelete: 'CASCADE',
    },
    url: {
      type: 'varchar(2048)',
      notNull: true,
    },
    events: {
      type: 'text[]',
      notNull: true,
      comment: 'Array of event types to subscribe to',
    },
    secret: {
      type: 'varchar(255)',
      notNull: true,
      comment: 'Shared secret for HMAC signature verification',
    },
    active: {
      type: 'boolean',
      notNull: true,
      default: true,
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

  // Create webhook_events table
  pgm.createTable('webhook_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    webhook_id: {
      type: 'uuid',
      notNull: true,
      references: 'webhooks',
      onDelete: 'CASCADE',
    },
    event_type: {
      type: 'varchar(50)',
      notNull: true,
    },
    payload: {
      type: 'jsonb',
      notNull: true,
      comment: 'Event payload sent to webhook',
    },
    status: {
      type: 'varchar(20)',
      notNull: true,
      default: "'pending'",
      check: "status IN ('pending', 'delivered', 'failed')",
    },
    attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    last_attempt_at: {
      type: 'timestamp',
    },
    next_retry_at: {
      type: 'timestamp',
      comment: 'Scheduled time for next retry attempt',
    },
    response_status: {
      type: 'integer',
      comment: 'HTTP response status code',
    },
    response_body: {
      type: 'text',
      comment: 'Response body from webhook endpoint',
    },
    error_message: {
      type: 'text',
      comment: 'Error message if delivery failed',
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

  // Create indexes for webhooks
  pgm.createIndex('webhooks', 'user_id');
  pgm.createIndex('webhooks', 'active');

  // Create indexes for webhook_events
  pgm.createIndex('webhook_events', 'webhook_id');
  pgm.createIndex('webhook_events', 'event_type');
  pgm.createIndex('webhook_events', 'status');
  pgm.createIndex('webhook_events', 'next_retry_at');
  pgm.createIndex('webhook_events', 'created_at');

  // Add trigger for webhooks updated_at
  pgm.sql(`
    CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Add trigger for webhook_events updated_at
  pgm.sql(`
    CREATE TRIGGER update_webhook_events_updated_at
    BEFORE UPDATE ON webhook_events
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
  `);

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE webhooks IS 'Webhook endpoint configurations';
    COMMENT ON TABLE webhook_events IS 'Webhook delivery event log';
    COMMENT ON COLUMN webhooks.events IS 'Array of event types: document.created, document.sent, document.signed, document.completed, etc.';
    COMMENT ON COLUMN webhooks.secret IS 'Secret key for generating HMAC-SHA256 signature';
    COMMENT ON COLUMN webhook_events.payload IS 'Full event payload sent to webhook URL';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('webhook_events');
  pgm.dropTable('webhooks');
};
