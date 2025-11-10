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
  // Add reminder tracking columns to signers table
  pgm.addColumns('signers', {
    last_reminder_sent_at: {
      type: 'timestamp',
      notNull: false,
      comment: 'Timestamp of last reminder email sent to this signer',
    },
    reminder_count: {
      type: 'integer',
      notNull: true,
      default: 0,
      comment: 'Number of reminder emails sent to this signer',
    },
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Remove reminder tracking columns
  pgm.dropColumns('signers', ['last_reminder_sent_at', 'reminder_count']);
};
