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
  pgm.createTable('team_invitations', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    team_id: {
      type: 'uuid',
      notNull: true,
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
    },
    role: {
      type: 'varchar(50)',
      notNull: true,
      default: 'member',
    },
    token: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
    },
    invited_by: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
    },
    expires_at: {
      type: 'timestamp',
      notNull: true,
    },
    accepted_at: {
      type: 'timestamp',
    },
    created_at: {
      type: 'timestamp',
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Index for faster lookups
  pgm.createIndex('team_invitations', 'token');
  pgm.createIndex('team_invitations', 'email');
  pgm.createIndex('team_invitations', 'team_id');
  pgm.createIndex('team_invitations', ['team_id', 'email'], {
    unique: true,
    where: "status = 'pending'",
    name: 'unique_pending_invitation',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
exports.down = (pgm) => {
  pgm.dropTable('team_invitations');
};
