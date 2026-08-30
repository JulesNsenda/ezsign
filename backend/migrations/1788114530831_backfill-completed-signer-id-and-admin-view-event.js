/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
exports.shorthands = undefined;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.up = (pgm) => {
  // (1) Item 4 permits a new system event: an instance admin reading a
  // document's activity through the admin bypass on
  // `GET /documents/:id/activity`. It is recorded so that a privileged
  // cross-tenant read of the audit trail appears *in* the audit trail - the
  // one access on that endpoint that ought to.
  //
  // The value list is written out in full rather than derived from a shared
  // constant: a migration is an immutable historical record, and one that
  // reads a constant would change meaning the next time that constant is
  // edited. `AuditEvent.test.ts` parses these literals back out and asserts
  // they match the TypeScript vocabulary.
  pgm.sql('ALTER TABLE audit_events DROP CONSTRAINT IF EXISTS audit_events_event_type_check');
  pgm.addConstraint('audit_events', 'audit_events_event_type_check', {
    check:
      "event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded', 'settings.updated', 'signer_reminder_sent', 'user.sessions_revoked', 'admin.activity_viewed')",
  });

  // (2) Item 3 wrote the completing signer under `completed_by_signer_id`
  // while `signed`/`viewed` used `signer_id`. Item 4 joins signers on
  // `metadata->>'signer_id'`, so every `completed` row written between the
  // two renders a null signer - on exactly the row a support reader cares
  // most about. Renaming the key at the emit fixes new rows only; without
  // this backfill the gap in existing rows is permanent, because nothing else
  // records which signer completed the document.
  pgm.sql(`
    UPDATE audit_events
    SET metadata = (metadata - 'completed_by_signer_id')
                   || jsonb_build_object('signer_id', metadata->>'completed_by_signer_id')
    WHERE metadata ? 'completed_by_signer_id'
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
exports.down = (pgm) => {
  // Restore the old key first: the rows have to be back in their previous
  // shape before the constraint narrows, so the rollback is total rather
  // than partial.
  pgm.sql(`
    UPDATE audit_events
    SET metadata = (metadata - 'signer_id')
                   || jsonb_build_object('completed_by_signer_id', metadata->>'signer_id')
    WHERE event_type = 'completed' AND metadata ? 'signer_id'
  `);

  // Narrow the CHECK without validating existing rows, for the same reason
  // 1787557155047 did: `admin.activity_viewed` rows may already exist, and
  // deleting audit rows to force a rollback through is not an acceptable
  // remedy in a signing product. NOT VALID leaves them in place while still
  // rejecting new ones. `pgm.addConstraint` cannot express NOT VALID.
  pgm.dropConstraint('audit_events', 'audit_events_event_type_check');
  pgm.sql(`
    ALTER TABLE audit_events
    ADD CONSTRAINT audit_events_event_type_check
    CHECK (event_type IN ('created', 'updated', 'sent', 'viewed', 'signed', 'declined', 'completed', 'cancelled', 'deleted', 'downloaded', 'settings.updated', 'signer_reminder_sent', 'user.sessions_revoked'))
    NOT VALID
  `);
};
