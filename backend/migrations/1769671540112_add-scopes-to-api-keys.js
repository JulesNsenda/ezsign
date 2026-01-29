/**
 * Migration: Add scopes column to api_keys table
 *
 * Adds a TEXT[] array column to store API key scopes like:
 * - documents:read, documents:write
 * - signers:read, signers:write
 * - templates:read, templates:write
 * - webhooks:read, webhooks:write
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
  // Add scopes column with default empty array for existing keys (full access)
  pgm.addColumn('api_keys', {
    scopes: {
      type: 'text[]',
      notNull: true,
      default: pgm.func("ARRAY['documents:read', 'documents:write', 'signers:read', 'signers:write', 'templates:read', 'templates:write', 'webhooks:read', 'webhooks:write']::text[]"),
    },
  });

  // Add index for scope queries
  pgm.createIndex('api_keys', 'scopes', {
    method: 'gin',
    name: 'idx_api_keys_scopes',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropIndex('api_keys', 'scopes', { name: 'idx_api_keys_scopes' });
  pgm.dropColumn('api_keys', 'scopes');
};
