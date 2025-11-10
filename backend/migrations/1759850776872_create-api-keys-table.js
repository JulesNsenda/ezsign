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
  pgm.createTable('api_keys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    key_hash: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    last_used_at: {
      type: 'timestamp',
    },
    expires_at: {
      type: 'timestamp',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create index on user_id for faster lookups
  pgm.createIndex('api_keys', 'user_id');

  // Create index on key_hash for authentication lookups
  pgm.createIndex('api_keys', 'key_hash');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('api_keys');
};
