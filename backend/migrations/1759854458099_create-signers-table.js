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
  pgm.createTable('signers', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents(id)',
      onDelete: 'CASCADE',
    },
    email: {
      type: 'varchar(255)',
      notNull: true,
    },
    name: {
      type: 'varchar(255)',
      notNull: true,
    },
    signing_order: {
      type: 'integer',
      notNull: false,
      comment: 'Order for sequential signing workflows (null for parallel)',
    },
    status: {
      type: 'varchar(50)',
      notNull: true,
      default: 'pending',
      check: "status IN ('pending', 'signed', 'declined')",
    },
    access_token: {
      type: 'varchar(255)',
      notNull: true,
      unique: true,
      comment: 'Unique token for accessing the signing page',
    },
    signed_at: {
      type: 'timestamp',
      notNull: false,
    },
    ip_address: {
      type: 'varchar(45)',
      notNull: false,
      comment: 'IP address when document was signed',
    },
    user_agent: {
      type: 'text',
      notNull: false,
      comment: 'Browser user agent when document was signed',
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes for faster lookups
  pgm.createIndex('signers', 'document_id');
  pgm.createIndex('signers', 'email');
  pgm.createIndex('signers', 'access_token');
  pgm.createIndex('signers', 'status');

  // Create trigger to automatically update updated_at
  pgm.createTrigger('signers', 'update_signers_updated_at', {
    when: 'BEFORE',
    operation: 'UPDATE',
    function: 'update_updated_at_column',
    level: 'ROW',
  });
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('signers');
};
