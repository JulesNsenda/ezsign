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
  pgm.createTable('team_members', {
    team_id: {
      type: 'uuid',
      notNull: true,
      references: 'teams(id)',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: 'uuid',
      notNull: true,
      references: 'users(id)',
      onDelete: 'CASCADE',
    },
    role: {
      type: 'varchar(50)',
      notNull: true,
      default: 'member',
      check: "role IN ('owner', 'admin', 'member')",
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create composite primary key
  pgm.addConstraint('team_members', 'team_members_pkey', {
    primaryKey: ['team_id', 'user_id'],
  });

  // Create indexes for faster lookups
  pgm.createIndex('team_members', 'team_id');
  pgm.createIndex('team_members', 'user_id');
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('team_members');
};
