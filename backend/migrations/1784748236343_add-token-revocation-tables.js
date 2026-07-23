/**
 * Migration: Create revoked_tokens + user_token_revocations tables
 *
 * Backs the Postgres-based JWT blacklist (replaces the Redis-based store).
 * Two tables are required because they represent different revocation
 * shapes:
 *   - revoked_tokens: single-token revocation, keyed by jti (logout).
 *   - user_token_revocations: per-user "revoke everything issued before
 *     this instant" (logout-all, password change). A single-table design
 *     cannot represent this without enumerating every outstanding jti.
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
  pgm.createTable('revoked_tokens', {
    jti: {
      type: 'varchar(255)',
      primaryKey: true,
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'When this blacklist entry can be garbage collected (mirrors the token\'s own expiry).',
    },
  });

  pgm.createIndex('revoked_tokens', 'expires_at');

  pgm.createTable('user_token_revocations', {
    user_id: {
      type: 'uuid',
      primaryKey: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    revoked_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'Tokens with iat <= this instant (inclusive) are considered revoked.',
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      comment: 'When this revocation entry can be garbage collected (mirrors max token lifetime).',
    },
  });

  pgm.createIndex('user_token_revocations', 'expires_at');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('user_token_revocations');
  pgm.dropTable('revoked_tokens');
};
