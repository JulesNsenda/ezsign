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
  // Item 3.2 (see docs/plans/2026-08-23-envelope-activity-log-and-email-templates.md):
  // the only handler that can observe a signer opening a document is the
  // public, unauthenticated `getDocumentBySigningToken`, which is hit on
  // every page load, refresh and link-preview bot. Recording a `viewed`
  // audit event per request would bury the timeline the feature exists to
  // provide. This column makes the event once-per-signer: the emit is gated
  // on the NULL -> now() transition of a conditional UPDATE, so concurrent
  // requests race for one row and only the winner emits.
  //
  // Deliberately nullable with no default: NULL is the load-bearing value
  // (it means "not yet viewed"), and backfilling existing signers with a
  // timestamp would assert a view that never happened.
  pgm.addColumn('signers', {
    viewed_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'First time this signer opened the signing link; NULL until then. Gates the once-per-signer `viewed` audit event.',
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropColumn('signers', 'viewed_at');
};
