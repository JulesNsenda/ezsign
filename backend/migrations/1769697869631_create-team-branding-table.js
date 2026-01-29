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
  pgm.createTable('team_branding', {
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
      unique: true,
    },
    // Logo settings
    logo_path: {
      type: 'varchar(500)',
      comment: 'Path to logo file in storage',
    },
    logo_url: {
      type: 'varchar(500)',
      comment: 'Public URL for logo (if using external storage)',
    },
    favicon_path: {
      type: 'varchar(500)',
      comment: 'Path to favicon file',
    },
    // Color settings
    primary_color: {
      type: 'varchar(7)',
      default: "'#4F46E5'",
      comment: 'Primary brand color in hex format',
    },
    secondary_color: {
      type: 'varchar(7)',
      default: "'#10B981'",
      comment: 'Secondary brand color in hex format',
    },
    accent_color: {
      type: 'varchar(7)',
      comment: 'Accent color for highlights',
    },
    // Text settings
    company_name: {
      type: 'varchar(255)',
      comment: 'Company name to display instead of EzSign',
    },
    tagline: {
      type: 'varchar(500)',
      comment: 'Company tagline or description',
    },
    email_footer_text: {
      type: 'text',
      comment: 'Custom footer text for emails',
    },
    // Page customization
    custom_page_title: {
      type: 'varchar(255)',
      comment: 'Custom browser tab title',
    },
    support_email: {
      type: 'varchar(255)',
      comment: 'Custom support email address',
    },
    support_url: {
      type: 'varchar(500)',
      comment: 'Custom support/help URL',
    },
    privacy_url: {
      type: 'varchar(500)',
      comment: 'Custom privacy policy URL',
    },
    terms_url: {
      type: 'varchar(500)',
      comment: 'Custom terms of service URL',
    },
    // Display options
    show_powered_by: {
      type: 'boolean',
      notNull: true,
      default: true,
      comment: 'Show "Powered by EzSign" text',
    },
    hide_ezsign_branding: {
      type: 'boolean',
      notNull: true,
      default: false,
      comment: 'Completely hide EzSign branding (enterprise feature)',
    },
    // Timestamps
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

  // Create index on team_id for faster lookups
  pgm.createIndex('team_branding', 'team_id');

  // Create trigger to automatically update updated_at
  pgm.createTrigger('team_branding', 'update_team_branding_updated_at', {
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
  pgm.dropTable('team_branding');
};
