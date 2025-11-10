/**
 * Create signatures table
 * Stores signature data for each field signed by signers
 */

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
  // Create signatures table
  pgm.createTable('signatures', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    signer_id: {
      type: 'uuid',
      notNull: true,
      references: 'signers',
      onDelete: 'CASCADE',
    },
    field_id: {
      type: 'uuid',
      notNull: true,
      references: 'fields',
      onDelete: 'CASCADE',
    },
    signature_type: {
      type: 'varchar(20)',
      notNull: true,
      check: "signature_type IN ('drawn', 'typed', 'uploaded')",
    },
    signature_data: {
      type: 'text',
      notNull: true,
      comment: 'Base64 encoded image for drawn/uploaded, text for typed',
    },
    text_value: {
      type: 'varchar(500)',
      comment: 'Plain text value for typed signatures',
    },
    font_family: {
      type: 'varchar(100)',
      comment: 'Font family for typed signatures',
    },
    ip_address: {
      type: 'varchar(45)',
      comment: 'IPv4 or IPv6 address',
    },
    user_agent: {
      type: 'text',
      comment: 'Browser user agent string',
    },
    signed_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('CURRENT_TIMESTAMP'),
    },
  });

  // Create indexes
  pgm.createIndex('signatures', 'signer_id');
  pgm.createIndex('signatures', 'field_id');
  pgm.createIndex('signatures', 'signature_type');
  pgm.createIndex('signatures', 'signed_at');

  // Add unique constraint to prevent duplicate signatures for same field
  pgm.addConstraint('signatures', 'unique_field_signature', {
    unique: ['field_id'],
  });

  // Add comments
  pgm.sql(`
    COMMENT ON TABLE signatures IS 'Stores signature data for document fields';
    COMMENT ON COLUMN signatures.signature_data IS 'Base64 image data for drawn/uploaded signatures, or rendered text for typed';
    COMMENT ON COLUMN signatures.text_value IS 'Plain text entered for typed signatures';
    COMMENT ON COLUMN signatures.font_family IS 'Font family used for typed signatures';
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 * @param run {() => void | undefined}
 * @returns {Promise<void> | void}
 */
export const down = (pgm) => {
  pgm.dropTable('signatures');
};
