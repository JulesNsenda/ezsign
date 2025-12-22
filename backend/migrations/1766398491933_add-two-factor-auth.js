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
  // Create user_2fa table for storing TOTP secrets
  pgm.createTable('user_2fa', {
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
      unique: true,
    },
    totp_secret: {
      type: 'text',
      notNull: true,
    },
    is_enabled: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
    enabled_at: {
      type: 'timestamp with time zone',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
    updated_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create user_backup_codes table for storing hashed backup codes
  pgm.createTable('user_backup_codes', {
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
    code_hash: {
      type: 'text',
      notNull: true,
    },
    used_at: {
      type: 'timestamp with time zone',
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Create user_trusted_devices table
  pgm.createTable('user_trusted_devices', {
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
    device_hash: {
      type: 'text',
      notNull: true,
    },
    device_name: {
      type: 'varchar(255)',
    },
    trusted_until: {
      type: 'timestamp with time zone',
      notNull: true,
    },
    created_at: {
      type: 'timestamp with time zone',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });

  // Add 2FA related columns to users table
  pgm.addColumns('users', {
    two_fa_failed_attempts: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    two_fa_locked_until: {
      type: 'timestamp with time zone',
    },
  });

  // Add require_2fa column to teams table
  pgm.addColumns('teams', {
    require_2fa: {
      type: 'boolean',
      notNull: true,
      default: false,
    },
  });

  // Create indexes
  pgm.createIndex('user_2fa', 'user_id');
  pgm.createIndex('user_backup_codes', 'user_id');
  pgm.createIndex('user_backup_codes', ['user_id', 'code_hash']);
  pgm.createIndex('user_trusted_devices', 'user_id');
  pgm.createIndex('user_trusted_devices', ['user_id', 'device_hash']);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  // Drop indexes
  pgm.dropIndex('user_trusted_devices', ['user_id', 'device_hash']);
  pgm.dropIndex('user_trusted_devices', 'user_id');
  pgm.dropIndex('user_backup_codes', ['user_id', 'code_hash']);
  pgm.dropIndex('user_backup_codes', 'user_id');
  pgm.dropIndex('user_2fa', 'user_id');

  // Remove columns from teams
  pgm.dropColumns('teams', ['require_2fa']);

  // Remove columns from users
  pgm.dropColumns('users', ['two_fa_failed_attempts', 'two_fa_locked_until']);

  // Drop tables
  pgm.dropTable('user_trusted_devices');
  pgm.dropTable('user_backup_codes');
  pgm.dropTable('user_2fa');
};
