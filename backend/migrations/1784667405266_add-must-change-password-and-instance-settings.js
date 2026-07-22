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
  pgm.addColumn('users', {
    must_change_password: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  pgm.createTable('instance_settings', {
    key: {
      type: 'varchar(100)',
      primaryKey: true,
    },
    value: {
      type: 'text',
      notNull: true,
    },
    is_secret: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    updated_by: {
      type: 'uuid',
      references: 'users(id)',
      onDelete: 'SET NULL',
    },
    updated_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Instance settings writes get an audit_events entry ('settings.updated'),
  // so the event_type CHECK constraint needs to allow it alongside the
  // original document-lifecycle values.
  pgm.sql('ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_event_type_check');
  pgm.addConstraint('audit_events', 'audit_events_event_type_check', {
    check:
      "event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded', 'settings.updated')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropConstraint('audit_events', 'audit_events_event_type_check');
  pgm.addConstraint('audit_events', 'audit_events_event_type_check', {
    check:
      "event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded')",
  });

  pgm.dropTable('instance_settings');
  pgm.dropColumn('users', 'must_change_password');
};
