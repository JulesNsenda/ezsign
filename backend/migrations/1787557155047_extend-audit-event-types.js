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
  // BUG-1/BUG-2 (see docs/plans/2026-08-23-envelope-activity-log-and-email-templates.md):
  // signerController.resendSigningEmail writes 'signer_reminder_sent' and
  // adminUsersController.revokeAllSessions writes 'user.sessions_revoked' -
  // neither value is permitted by the CHECK added in 1784667405266, so the
  // former 500s after the reminder email has already gone out and the latter
  // has its audit row silently swallowed.
  pgm.sql('ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_event_type_check');
  pgm.addConstraint('audit_events', 'audit_events_event_type_check', {
    check:
      "event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded', 'settings.updated', 'signer_reminder_sent', 'user.sessions_revoked')",
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  // A CHECK constraint is validated against every existing row at the moment
  // it is (re)added. The narrower constraint below does not permit
  // 'signer_reminder_sent' or 'user.sessions_revoked', and both values
  // already have live writers (signerController.resendSigningEmail,
  // adminUsersController.revokeAllSessions) - unlike the precedent this
  // migration follows, 1784667405266, whose value ('settings.updated') had
  // no writer that could pre-date its own `up`. So we cannot assume the
  // narrower constraint validates cleanly, and this is a signing product's
  // audit trail: deleting rows that fail it - including the
  // 'user.sessions_revoked' trail a compromise investigation would want -
  // to force the rollback through is not an acceptable remedy. Instead, add
  // the narrower constraint NOT VALID: existing rows are not checked, new
  // rows still are, and nothing is deleted. `pgm.addConstraint` does not
  // expose NOT VALID, hence the raw SQL. Do not change this back to a
  // DELETE-then-addConstraint.
  pgm.dropConstraint('audit_events', 'audit_events_event_type_check');
  pgm.sql(`
    ALTER TABLE audit_events
    ADD CONSTRAINT audit_events_event_type_check
    CHECK (event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded', 'settings.updated'))
    NOT VALID
  `);
};
